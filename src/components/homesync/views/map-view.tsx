"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  Layers,
  Loader2,
  Lock,
  Map as MapIcon,
  MapPin,
  Pause,
  Play,
  Satellite,
  TriangleAlert,
  UsersRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { apiSend, timeAgo, useResource } from "@/lib/homesync/api";
import type { Member } from "@/lib/homesync/types";
import { canWrite } from "@/lib/homesync/roles";
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
import { SAVED_PLACES, memberPinsFrom, placePins, type MapStyle } from "@/components/homesync/family-map-data";

const FamilyMap = dynamic(() => import("@/components/homesync/family-map").then((m) => m.FamilyMap), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center">
      <span className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
    </div>
  ),
});

const MAP_STYLES: { key: MapStyle; label: string; icon: LucideIcon }[] = [
  { key: "satellite", label: "Satellite", icon: Satellite },
  { key: "hybrid", label: "Hybrid", icon: Layers },
  { key: "streets", label: "Streets", icon: MapIcon },
];

/** A fix older than 45 minutes is considered stale. */
function isStale(m: Member): boolean {
  return m.locationUpdatedAt
    ? Date.now() - new Date(m.locationUpdatedAt).getTime() > 45 * 60000
    : true;
}

/** Minimalist glass pill that pauses / resumes a member's location sharing. */
function SharingButton({
  member,
  busy,
  writable,
  onToggle,
}: {
  member: Member;
  busy: boolean;
  writable: boolean;
  onToggle: (m: Member, on: boolean) => void;
}) {
  const resuming = !member.locationSharing;
  return (
    <button
      type="button"
      onClick={() => onToggle(member, resuming)}
      disabled={busy || !writable}
      title={!writable ? "Your role is read-only" : undefined}
      aria-label={`${resuming ? "Resume" : "Pause"} location sharing for ${member.name}`}
      className={cn(
        "glass glass-hover inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3",
        "text-xs font-semibold text-foreground transition-all active:scale-95",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        "disabled:pointer-events-none disabled:opacity-50"
      )}
    >
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
      ) : resuming ? (
        <Play className="h-3.5 w-3.5" aria-hidden />
      ) : (
        <Pause className="h-3.5 w-3.5" aria-hidden />
      )}
      {resuming ? "Resume" : "Pause"}
    </button>
  );
}

export function MapView() {
  const { data, loading, error, refresh } = useResource<Member[]>("/api/members");
  const user = useSession((s) => s.user);
  const writable = canWrite(user?.role);
  const [activePinId, setActivePinId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [mapStyle, setMapStyle] = useState<MapStyle>("satellite");

  const members = useMemo(() => data ?? [], [data]);
  const pins = useMemo(() => [...placePins(), ...memberPinsFrom(members)], [members]);
  const sharingCount = members.filter((m) => m.locationSharing).length;

  // Member ids work even when the member has sharing off (no pin on the map yet).
  const activeMember = activePinId?.startsWith("member-")
    ? (members.find((m) => `member-${m.id}` === activePinId) ?? null)
    : null;
  const activePin = activePinId ? (pins.find((p) => p.id === activePinId) ?? null) : null;
  const activePlace = activePin?.kind === "place" ? activePin : null;

  async function toggleSharing(m: Member, on: boolean) {
    setBusyId(m.id);
    try {
      await apiSend("/api/members", "PATCH", { id: m.id, locationSharing: on });
      toast.success(on ? `Location sharing resumed for ${m.name}` : `Location sharing paused for ${m.name}`);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update sharing");
    } finally {
      setBusyId(null);
    }
  }

  if (loading && !data) {
    return (
      <div className="space-y-4">
        <ViewTitle title="Family Map" sub="Live satellite view of your family — consent-based sharing" />
        <PageLoader label="Placing everyone on the map…" />
      </div>
    );
  }
  if (error && !data) {
    return (
      <div className="space-y-4">
        <ViewTitle title="Family Map" sub="Live satellite view of your family — consent-based sharing" />
        <EmptyState title="Couldn't load the map" sub={error} />
        <div className="flex justify-center">
          <ButtonRetry onClick={refresh} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ViewTitle
        title="Family Map"
        sub="Live satellite view of your family — consent-based sharing"
        right={
          <Chip tone="brand" className="shrink-0">
            <LivePing /> {sharingCount} of {members.length} sharing
          </Chip>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        {/* ---- Map ---- */}
        <GlassCard className="flex flex-col p-4 sm:p-5">
          <SectionHeader
            icon={<Satellite className="h-4 w-4" />}
            title="Live locations"
            sub="Real satellite imagery • tap a pin for details"
          />

          {/* Style switcher */}
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {MAP_STYLES.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setMapStyle(s.key)}
                aria-pressed={mapStyle === s.key}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border border-white/40 px-3 py-1.5 text-xs font-semibold transition-all active:scale-95 dark:border-white/10",
                  mapStyle === s.key ? "brand-gradient text-white" : "glass glass-hover"
                )}
              >
                <s.icon className="h-3.5 w-3.5" /> {s.label}
              </button>
            ))}
          </div>

          {/* Real satellite map (Leaflet, client-only) */}
          <div className="relative mt-3 h-[60vh] min-h-[360px] w-full">
            <FamilyMap
              pins={pins}
              className="h-full w-full"
              activePinId={activePinId}
              onPinClick={(p) => setActivePinId((cur) => (cur === p.id ? null : p.id))}
              mapStyle={mapStyle}
            />

            {/* Selected pin detail card */}
            {(activeMember || activePlace) && (
              <div className="glass-strong absolute bottom-3 left-3 z-[1100] max-w-[calc(100%-1.5rem)] rounded-2xl p-3.5 shadow-xl sm:max-w-xs">
                <button
                  type="button"
                  onClick={() => setActivePinId(null)}
                  aria-label="Close details"
                  className="absolute right-2 top-2 rounded-full p-1 text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
                {activeMember ? (
                  <div className="flex items-center gap-3">
                    <MemberAvatar
                      name={activeMember.name}
                      color={activeMember.color}
                      role={activeMember.role}
                      size={44}
                      ring={activeMember.locationSharing}
                    />
                    <div className="min-w-0 flex-1 leading-tight">
                      <p className="flex items-center gap-2 text-sm font-semibold">
                        <span className="truncate">{activeMember.name}</span>
                        <Chip tone="brand" className="shrink-0">{activeMember.role}</Chip>
                      </p>
                      {activeMember.locationSharing ? (
                        <>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {activeMember.locationLabel ?? "Sharing on — no place label"}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            Updated {timeAgo(activeMember.locationUpdatedAt)}
                          </p>
                        </>
                      ) : (
                        <p className="mt-0.5 text-xs text-muted-foreground">Location sharing is paused</p>
                      )}
                    </div>
                    {activeMember.locationSharing && isStale(activeMember) && (
                      <TriangleAlert
                        className="h-4 w-4 shrink-0 text-amber-500"
                        aria-label="Location may be outdated"
                      />
                    )}
                  </div>
                ) : activePlace ? (
                  <div className="flex items-center gap-3">
                    <span
                      aria-hidden
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl text-white shadow-sm"
                      style={{ background: `linear-gradient(135deg, ${activePlace.color}, ${activePlace.color}99)` }}
                    >
                      <MapPin className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 leading-tight">
                      <p className="text-sm font-semibold">{activePlace.label}</p>
                      <p className="text-xs text-muted-foreground">{activePlace.sublabel ?? "Saved place"}</p>
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <p className="mt-3 flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Locations are shared only with consent. Members know when it is on, who can see them, and can pause it
            at any time.
          </p>
        </GlassCard>

        {/* ---- Side panel ---- */}
        <div className="flex flex-col gap-4">
          <GlassCard className="p-4 sm:p-5">
            <SectionHeader
              icon={<UsersRound className="h-4 w-4" />}
              title="Who's where"
              sub="Tap a member to locate them on the map"
            />
            {members.length === 0 ? (
              <div className="mt-3">
                <EmptyState title="No members yet" sub="Invite your family to start sharing locations." />
              </div>
            ) : (
              <ul className="scrollbar-slim mt-3 max-h-[340px] space-y-1 overflow-y-auto pr-1">
                {members.map((m) => {
                  const stale = m.locationSharing && isStale(m);
                  const isActive = activePinId === `member-${m.id}`;
                  return (
                    <li
                      key={m.id}
                      className={cn(
                        "rounded-xl transition-colors",
                        isActive ? "glass-inset ring-1 ring-primary/30" : "hover:bg-accent/50"
                      )}
                    >
                      <div className="flex items-center gap-1.5 px-2.5 py-2">
                        <button
                          type="button"
                          onClick={() => setActivePinId((cur) => (cur === `member-${m.id}` ? null : `member-${m.id}`))}
                          aria-pressed={isActive}
                          aria-label={`Show ${m.name} on the map`}
                          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                        >
                          <MemberAvatar name={m.name} color={m.color} role={m.role} size={34} ring={m.locationSharing} />
                          <div className="min-w-0 flex-1 leading-tight">
                            <p className="truncate text-[13px] font-semibold">
                              {m.name} <span className="font-normal text-muted-foreground">• {m.relation}</span>
                            </p>
                            {m.locationSharing ? (
                              <>
                                <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                  <LivePing color={stale ? "#f59e0b" : "#10b981"} className="shrink-0" />
                                  <span className="truncate">{m.locationLabel ?? "Location on"}</span>
                                  <span className="shrink-0">• {timeAgo(m.locationUpdatedAt)}</span>
                                </p>
                                {stale && (
                                  <p className="mt-0.5 flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400">
                                    <TriangleAlert className="h-3 w-3 shrink-0" /> may be outdated
                                  </p>
                                )}
                              </>
                            ) : (
                              <p className="truncate text-[11px] text-muted-foreground">Sharing paused</p>
                            )}
                          </div>
                        </button>
                        <SharingButton
                          member={m}
                          busy={busyId === m.id}
                          writable={writable}
                          onToggle={(mm, on) => void toggleSharing(mm, on)}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {!writable && (
              <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
                You are signed in with a read-only role, so sharing controls are locked.
              </p>
            )}
          </GlassCard>

          <GlassCard className="p-4 sm:p-5">
            <SectionHeader icon={<MapPin className="h-4 w-4" />} title="Saved places" sub="Home, school, office & more" />
            <ul className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-1">
              {SAVED_PLACES.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setActivePinId((cur) => (cur === p.id ? null : p.id))}
                    aria-pressed={activePinId === p.id}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors",
                      activePinId === p.id ? "glass-inset ring-1 ring-primary/30" : "hover:bg-accent/50"
                    )}
                  >
                    <span
                      aria-hidden
                      className="h-3 w-3 shrink-0 rounded-full shadow-sm ring-2 ring-white/60 dark:ring-white/20"
                      style={{ background: p.color }}
                    />
                    <div className="min-w-0 leading-tight">
                      <p className="truncate text-xs font-semibold">{p.label}</p>
                      <p className="truncate text-[10px] text-muted-foreground">{p.sublabel ?? "Saved place"}</p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}

function ButtonRetry({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="brand-gradient rounded-xl px-4 py-2 text-sm font-semibold text-white"
    >
      Try again
    </button>
  );
}
