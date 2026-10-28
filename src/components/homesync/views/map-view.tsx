"use client";

/**
 * Family Map — REAL positions only.
 *
 * - Markers come exclusively from GET /api/location (real GPS pings).
 * - A member without a recorded position has NO marker — never a guess.
 * - "Share my location" toggles MY consent (PATCH /api/members) and streams
 *   real device GPS via navigator.geolocation.watchPosition, POSTed to
 *   /api/location at most once a minute.
 * - No sliders anywhere; filters are chips.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import {
  EyeOff,
  Loader2,
  Lock,
  MapPinned,
  RotateCcw,
  TriangleAlert,
  UsersRound,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { apiSend, timeAgo, useResource } from "@/lib/homesync/api";
import type { MapPin, Member } from "@/lib/homesync/types";
import { useSession } from "@/lib/homesync/session";
import { cn } from "@/lib/utils";
import {
  Chip,
  EmptyState,
  GlassCard,
  MemberAvatar,
  PageLoader,
  SectionHeader,
  ViewTitle,
} from "@/components/homesync/glass";
import { LivePing } from "@/components/homesync/icons";

const FamilyMap = dynamic(() => import("@/components/homesync/family-map").then((m) => m.FamilyMap), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center">
      <span className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
    </div>
  ),
});

/** One entry of GET /api/location (server-computed, real pings only). */
interface LocationEntry {
  memberId: string;
  name: string;
  photoUrl: string | null;
  color: string;
  sharing: boolean;
  placeLabel: string | null;
  position: { lat: number; lng: number; accuracyM: number | null } | null;
  lastPingAt: string | null;
  stale: boolean;
}

const INDIA_CENTER: [number, number] = [20.5937, 78.9629];
const POST_THROTTLE_MS = 60_000;

function geoErrorMessage(err: GeolocationPositionError): string {
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return "Location permission was denied in this browser. Allow location access for this site, then try again.";
    case err.POSITION_UNAVAILABLE:
      return "Your device could not determine a position right now. Check that location services are on.";
    case err.TIMEOUT:
      return "Getting your position timed out. Move somewhere with a clearer view of the sky and try again.";
    default:
      return "Your device reported an unknown location error.";
  }
}

export function MapView() {
  const { user, family } = useSession();
  const locRes = useResource<{ locations: LocationEntry[] }>("/api/location");
  const memRes = useResource<Member[]>("/api/members");

  const [filterId, setFilterId] = useState<string | null>(null);
  const [activePinId, setActivePinId] = useState<string | null>(null);
  const [busyToggle, setBusyToggle] = useState(false);
  const [liveFix, setLiveFix] = useState<{ lat: number; lng: number; accuracyM: number | null } | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);

  const watchRef = useRef<number | null>(null);
  const lastPostRef = useRef(0);
  const sharingRef = useRef(false);

  const entries = useMemo(() => locRes.data?.locations ?? [], [locRes.data]);
  const members = useMemo(() => memRes.data ?? [], [memRes.data]);
  const myMember = useMemo(
    () => members.find((m) => m.userId && user && m.userId === user.id) ?? null,
    [members, user]
  );
  const sharingCount = entries.filter((e) => e.sharing).length;
  const sharingEntries = useMemo(() => entries.filter((e) => e.sharing), [entries]);
  const offEntries = useMemo(() => entries.filter((e) => !e.sharing), [entries]);

  // Stop streaming if the component unmounts (or hot-reloads) mid-share.
  useEffect(() => {
    return () => {
      if (watchRef.current !== null && typeof navigator !== "undefined") {
        navigator.geolocation.clearWatch(watchRef.current);
        watchRef.current = null;
      }
    };
  }, []);

  // If consent is already ON (e.g. the view was reopened), start streaming
  // again so the switch state always matches what this device is really doing.
  useEffect(() => {
    if (myMember?.locationSharing && watchRef.current === null && !busyToggle) {
      startWatch();
    }
  }, [myMember?.locationSharing]);

  const postPing = (lat: number, lng: number, accuracyM: number | null, capturedAt: string) => {
    if (!sharingRef.current) return;
    const now = Date.now();
    if (now - lastPostRef.current < POST_THROTTLE_MS) return;
    // Claim the slot synchronously so a burst of GPS fixes during the request
    // can never bypass the ≥60s throttle.
    lastPostRef.current = now;
    void apiSend("/api/location", "POST", { lat, lng, accuracyM, capturedAt })
      .then(() => {
        locRes.refresh();
      })
      .catch((e: unknown) => {
        // 403 usually means consent was switched off elsewhere — stop posting.
        sharingRef.current = false;
        toast.error(e instanceof Error ? e.message : "Could not send your location");
      });
  };

  const startWatch = () => {
    if (watchRef.current !== null) return; // already streaming
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setGeoError("This browser does not support location sharing.");
      return;
    }
    sharingRef.current = true;
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const fix = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracyM: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
        };
        setLiveFix(fix);
        setGeoError(null);
        postPing(fix.lat, fix.lng, fix.accuracyM, new Date(pos.timestamp).toISOString());
      },
      (err) => {
        setGeoError(geoErrorMessage(err));
        toast.error("Location sharing could not get a fix", {
          description: geoErrorMessage(err),
        });
      },
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 20_000 }
    );
  };

  const stopWatch = () => {
    sharingRef.current = false;
    if (watchRef.current !== null && typeof navigator !== "undefined") {
      navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    }
    setLiveFix(null);
    setGeoError(null);
    lastPostRef.current = 0;
  };

  async function toggleSharing(on: boolean) {
    if (!myMember) {
      toast.error("No household profile is linked to your account.");
      return;
    }
    setBusyToggle(true);
    try {
      await apiSend("/api/members", "PATCH", { id: myMember.id, locationSharing: on });
      toast.success(on ? "Location sharing is on" : "Location sharing is off");
      await Promise.all([memRes.refresh(), locRes.refresh()]);
      if (on) startWatch();
      else stopWatch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update sharing");
    } finally {
      setBusyToggle(false);
    }
  }

  const pins = useMemo(() => {
    const visible = filterId ? entries.filter((e) => e.memberId === filterId) : entries;
    const list: MapPin[] = visible
      .filter((e) => e.position !== null)
      .map((e) => ({
        id: `member-${e.memberId}`,
        kind: "member" as const,
        label: e.name,
        sublabel: e.placeLabel ?? undefined,
        color: e.color,
        initials: e.name.slice(0, 2).toUpperCase(),
        lat: e.position!.lat,
        lng: e.position!.lng,
        stale: e.stale,
        sharing: e.sharing,
      }));

    // My own freshest device fix (real GPS) — replaces the last server ping
    // while streaming so the marker moves as I move.
    if (
      liveFix &&
      myMember &&
      sharingRef.current &&
      (!filterId || filterId === myMember.id)
    ) {
      const mine: MapPin = {
        id: `member-${myMember.id}`,
        kind: "member",
        label: myMember.name,
        sublabel: myMember.locationLabel ?? undefined,
        color: myMember.color,
        initials: myMember.name.slice(0, 2).toUpperCase(),
        lat: liveFix.lat,
        lng: liveFix.lng,
        stale: false,
        sharing: true,
      };
      const idx = list.findIndex((p) => p.id === mine.id);
      if (idx >= 0) list[idx] = mine;
      else list.push(mine);
    }
    return list;
  }, [entries, filterId, liveFix, myMember]);

  // Center: family home → first real ping → India overview.
  const center = useMemo<[number, number]>(() => {
    if (typeof family?.homeLat === "number" && typeof family?.homeLng === "number") {
      return [family.homeLat, family.homeLng];
    }
    const first = pins[0];
    if (first) return [first.lat, first.lng];
    return INDIA_CENTER;
  }, [family?.homeLat, family?.homeLng, pins]);
  const centerIsFallback = !family?.homeLat && !family?.homeLng && pins.length === 0;

  const activePin = activePinId ? pins.find((p) => p.id === activePinId) ?? null : null;
  const activeEntry = activePin
    ? entries.find((e) => `member-${e.memberId}` === activePin.id) ?? null
    : null;

  function selectMember(id: string | null) {
    setFilterId(id);
    setActivePinId(id ? `member-${id}` : null);
  }

  if (locRes.loading && !locRes.data) {
    return (
      <div className="space-y-4">
        <ViewTitle title="Family Map" sub="Real positions, shared with consent" />
        <PageLoader label="Placing everyone on the map…" />
      </div>
    );
  }
  if (locRes.error && !locRes.data) {
    return (
      <div className="space-y-4">
        <ViewTitle title="Family Map" sub="Real positions, shared with consent" />
        <GlassCard className="p-4 sm:p-5">
          <EmptyState icon={<MapPinned className="h-10 w-10" />} title="Couldn't load the map" sub={locRes.error} />
          <div className="mt-3 flex justify-center">
            <Button variant="outline" onClick={locRes.refresh}>
              <RotateCcw /> Try again
            </Button>
          </div>
        </GlassCard>
      </div>
    );
  }

  function renderEntryRow(e: LocationEntry, extra?: ReactNode) {
    const member = members.find((m) => m.id === e.memberId);
    const isActive = filterId === e.memberId;
    return (
      <li
        key={e.memberId}
        className={cn(
          "rounded-xl transition-colors",
          isActive ? "glass-inset ring-1 ring-primary/30" : "hover:bg-accent/50"
        )}
      >
        <button
          type="button"
          onClick={() => selectMember(isActive ? null : e.memberId)}
          aria-pressed={isActive}
          aria-label={`Show only ${e.name} on the map`}
          className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <MemberAvatar
            name={e.name}
            color={e.color}
            role={member?.role}
            photoUrl={e.photoUrl}
            size={34}
            ring={e.sharing}
          />
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-[13px] font-semibold">
              {e.name}
              {member ? (
                <span className="font-normal text-muted-foreground"> • {member.relation}</span>
              ) : null}
            </p>
            {extra ?? null}
          </div>
        </button>
      </li>
    );
  }

  return (
    <div className="space-y-4">
      <ViewTitle
        title="Family Map"
        sub="Real positions, shared with consent — nothing here is guessed"
        right={
          <Chip tone="brand" className="shrink-0">
            <LivePing /> {sharingCount} of {entries.length} sharing
          </Chip>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        {/* ---- Map ---- */}
        <GlassCard className="flex flex-col p-4 sm:p-5">
          <SectionHeader
            icon={<MapPinned className="h-4 w-4" />}
            title="Live locations"
            sub="OpenStreetMap • only real device positions are shown"
          />

          {/* Member filter chips */}
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => selectMember(null)}
              aria-pressed={filterId === null}
              className={cn(
                "rounded-full border border-white/40 px-3 py-1.5 text-xs font-semibold transition-all active:scale-95 dark:border-white/10",
                filterId === null ? "brand-gradient text-white" : "glass glass-hover"
              )}
            >
              All
            </button>
            {entries.map((e) => {
              const active = filterId === e.memberId;
              return (
                <button
                  key={e.memberId}
                  type="button"
                  onClick={() => selectMember(active ? null : e.memberId)}
                  aria-pressed={active}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border border-white/40 px-3 py-1.5 text-xs font-semibold transition-all active:scale-95 dark:border-white/10",
                    active ? "brand-gradient text-white" : "glass glass-hover"
                  )}
                >
                  <span
                    aria-hidden
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: e.color }}
                  />
                  {e.name}
                </button>
              );
            })}
          </div>

          {/* OpenStreetMap (Leaflet, client-only) */}
          <div className="relative mt-3 h-[60vh] min-h-[360px] w-full">
            <FamilyMap
              pins={pins}
              className="h-full w-full"
              activePinId={activePinId}
              onPinClick={(p) => setActivePinId((cur) => (cur === p.id ? null : p.id))}
              center={center}
              zoom={filterId ? 16 : 14}
            />

            {pins.length === 0 && (
              <div className="glass-strong pointer-events-none absolute left-3 top-3 z-[1100] max-w-[calc(100%-1.5rem)] rounded-2xl px-3.5 py-2.5 text-xs shadow-xl">
                <p className="font-semibold">No positions to show</p>
                <p className="mt-0.5 text-muted-foreground">
                  Markers appear only when a member shares a real GPS fix.
                </p>
              </div>
            )}

            {/* Selected pin detail card */}
            {activeEntry && (
              <div className="glass-strong absolute bottom-3 left-3 z-[1100] max-w-[calc(100%-1.5rem)] rounded-2xl p-3.5 shadow-xl sm:max-w-xs">
                <button
                  type="button"
                  onClick={() => setActivePinId(null)}
                  aria-label="Close details"
                  className="absolute right-2 top-2 rounded-full p-1 text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
                <div className="flex items-center gap-3">
                  <MemberAvatar
                    name={activeEntry.name}
                    color={activeEntry.color}
                    role={members.find((m) => m.id === activeEntry.memberId)?.role}
                    photoUrl={activeEntry.photoUrl}
                    size={44}
                    ring={activeEntry.sharing}
                  />
                  <div className="min-w-0 flex-1 leading-tight">
                    <p className="truncate text-sm font-semibold">{activeEntry.name}</p>
                    {activeEntry.position ? (
                      <>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {activeEntry.placeLabel ?? "Sharing on"}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          Updated {timeAgo(activeEntry.lastPingAt)}
                          {activeEntry.position.accuracyM
                            ? ` • ±${Math.round(activeEntry.position.accuracyM)} m`
                            : ""}
                        </p>
                      </>
                    ) : (
                      <p className="mt-0.5 text-xs text-muted-foreground">No position recorded</p>
                    )}
                  </div>
                  {activeEntry.stale && (
                    <TriangleAlert
                      className="h-4 w-4 shrink-0 text-amber-500"
                      aria-label="Location may be outdated"
                    />
                  )}
                </div>
              </div>
            )}
          </div>

          {centerIsFallback && (
            <p className="mt-2 flex items-start gap-2 text-[11px] leading-relaxed text-amber-600 dark:text-amber-400">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              No home location is set — the map shows a default view. Set your home in Settings to
              center the map on your family.
            </p>
          )}

          <p className="mt-2 flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Locations are shared only with consent. Positions older than 45 minutes are hidden until a
            fresh fix arrives.
          </p>
        </GlassCard>

        {/* ---- Side panel ---- */}
        <div className="flex flex-col gap-4">
          {/* Share MY location */}
          <GlassCard className="p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <SectionHeader
                icon={<LivePing />}
                title="Share my location"
                sub="Real GPS from this device, sent once a minute"
              />
              <Switch
                checked={myMember?.locationSharing ?? false}
                onCheckedChange={(on) => void toggleSharing(on)}
                disabled={busyToggle || !myMember}
                aria-label="Toggle my location sharing"
              />
            </div>

            <div className="mt-3 text-xs leading-relaxed text-muted-foreground">
              {!myMember ? (
                <p>No household profile is linked to your account yet.</p>
              ) : busyToggle ? (
                <p className="flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Updating…
                </p>
              ) : myMember.locationSharing ? (
                liveFix ? (
                  <p className="flex flex-wrap items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                    <LivePing className="shrink-0" />
                    Live
                    {liveFix.accuracyM ? (
                      <Chip tone="success" className="shrink-0">
                        accuracy ±{Math.round(liveFix.accuracyM)} m
                      </Chip>
                    ) : null}
                  </p>
                ) : (
                  <p className="flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Waiting for a GPS fix…
                  </p>
                )
              ) : (
                <p className="flex items-center gap-2">
                  <EyeOff className="h-3.5 w-3.5" /> Off — your position stays private.
                </p>
              )}
            </div>

            {geoError && (
              <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-2.5 text-[11px] leading-relaxed text-amber-700 dark:text-amber-400">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{geoError}</span>
              </div>
            )}
          </GlassCard>

          {/* Who's where */}
          <GlassCard className="p-4 sm:p-5">
            <SectionHeader
              icon={<UsersRound className="h-4 w-4" />}
              title="Who's where"
              sub="Tap a member to isolate them on the map"
            />
            {entries.length === 0 ? (
              <div className="mt-3">
                <EmptyState title="No members yet" sub="Invite your family to start sharing locations." />
              </div>
            ) : (
              <div className="scrollbar-slim mt-3 max-h-96 space-y-1 overflow-y-auto pr-1">
                <ul className="space-y-1">
                  {sharingEntries.map((e) =>
                    renderEntryRow(
                      e,
                      e.position ? (
                        <>
                          <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            <LivePing color={e.stale ? "#f59e0b" : "#10b981"} className="shrink-0" />
                            <span className="truncate">{e.placeLabel ?? "Location on"}</span>
                            <span className="shrink-0">• {timeAgo(e.lastPingAt)}</span>
                          </p>
                          {e.stale && (
                            <p className="mt-0.5 flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400">
                              <TriangleAlert className="h-3 w-3 shrink-0" /> may be outdated
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="truncate text-[11px] text-muted-foreground">
                          {e.lastPingAt
                            ? `Last seen ${timeAgo(e.lastPingAt)} — too old to show`
                            : "No position recorded yet"}
                        </p>
                      )
                    )
                  )}
                </ul>
                {offEntries.length > 0 && (
                  <div className="pt-2">
                    <p className="flex items-center gap-1.5 px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <EyeOff className="h-3 w-3 shrink-0" /> Location sharing off
                    </p>
                    <ul className="space-y-1">
                      {offEntries.map((e) =>
                        renderEntryRow(
                          e,
                          <p className="truncate text-[11px] text-muted-foreground">
                            Private — no position is recorded or shown.
                          </p>
                        )
                      )}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
