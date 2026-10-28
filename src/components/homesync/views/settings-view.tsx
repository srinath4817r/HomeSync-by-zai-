"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import {
  Check,
  Loader2,
  LogOut,
  MapPin,
  Monitor,
  Moon,
  Palette,
  Sun,
  Trash2,
  UserRound,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { apiSend, useResource } from "@/lib/homesync/api";
import { useAppStore } from "@/lib/homesync/store";
import { useSession } from "@/lib/homesync/session";
import type { FamilyInfo } from "@/lib/homesync/types";
import { Chip, GlassCard, MemberAvatar, SectionHeader, ViewTitle } from "@/components/homesync/glass";
import { HomeSyncMark } from "@/components/homesync/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

/** Shape returned by GET /api/family (membership + family + raw household profiles). */
interface FamilyResponse {
  membership: { role: string; status: string } | null;
  family: FamilyInfo | null;
  members: {
    id: string;
    name: string;
    role: string;
    color: string;
    photoUrl: string | null;
    userId: string | null;
    locationSharing: boolean;
  }[];
}

/** The slice of useResource<T> the cards below need. */
interface FamilyResource {
  data: FamilyResponse | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/* ---------- Minimalist On/Off segmented control ---------- */

function OnOffSegmented({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  const options: { text: string; next: boolean }[] = [
    { text: "Off", next: false },
    { text: "On", next: true },
  ];
  return (
    <div
      role="group"
      aria-label={label}
      className="glass-inset inline-flex shrink-0 items-center gap-0.5 rounded-full border border-border/60 p-0.5"
    >
      {options.map((opt) => (
        <button
          key={opt.text}
          type="button"
          aria-pressed={value === opt.next}
          disabled={disabled}
          onClick={() => onChange(opt.next)}
          className={cn(
            "min-w-11 rounded-full px-3 py-1.5 text-xs font-semibold leading-none transition-colors disabled:opacity-60",
            value === opt.next
              ? "brand-gradient text-white shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {opt.text}
        </button>
      ))}
    </div>
  );
}

/** Hydration-safe "client mounted" flag (no setState-in-effect). */
const subscribeNoop = () => () => {};
function useMounted(): boolean {
  return useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false
  );
}

/* ---------- My profile (server: PATCH /api/auth/profile) ---------- */

function ProfileCard() {
  const user = useSession((s) => s.user);
  const updateUser = useSession((s) => s.updateUser);
  const [name, setName] = useState(user?.name ?? "");
  const [busy, setBusy] = useState(false);

  if (!user) return null;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const nextName = name.trim();
    if (!nextName) {
      toast.error("Enter a display name to continue.");
      return;
    }
    try {
      setBusy(true);
      const res = await apiSend<{ user: { id: string; name: string } }>("/api/auth/profile", "PATCH", {
        name: nextName,
      });
      updateUser({ name: res.user.name });
      toast.success("Profile updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update your profile.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <GlassCard className="space-y-4 p-4 sm:p-5">
      <SectionHeader icon={<UserRound className="h-4 w-4" />} title="My profile" sub="Visible to your family" />

      <div className="flex items-center gap-3">
        <MemberAvatar name={user.name} color={user.color} role={user.role} photoUrl={user.photoUrl} size={44} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-tight">{user.name}</p>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
        </div>
        <Chip tone="brand">{user.role}</Chip>
      </div>

      <form
        className="space-y-3"
        onSubmit={(e) => {
          void save(e);
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="profile-name">Display name</Label>
            <Input
              id="profile-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              autoComplete="name"
              disabled={busy}
              className="h-10 rounded-xl bg-background/50"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="profile-email">Email</Label>
            <Input
              id="profile-email"
              value={user.email ?? ""}
              readOnly
              disabled
              className="h-10 rounded-xl bg-background/50"
            />
            <p className="text-[10px] text-muted-foreground">Signed in with Google — this can&apos;t be changed.</p>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="profile-role">Role</Label>
          <Input
            id="profile-role"
            value={user.role}
            readOnly
            disabled
            className="h-10 rounded-xl bg-background/50"
          />
          <p className="text-[10px] text-muted-foreground">Your role is set by the Family Admin.</p>
        </div>
        <Button
          type="submit"
          disabled={busy || name.trim() === user.name || name.trim().length === 0}
          className="brand-gradient h-10 rounded-xl text-white shadow-md"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Save profile
        </Button>
      </form>
    </GlassCard>
  );
}

/* ---------- Family settings (server: PATCH /api/family — admin only) ---------- */

function FamilyAdminCard({ familyRes }: { familyRes: FamilyResource }) {
  const hydrate = useSession((s) => s.hydrate);
  const family = familyRes.data?.family ?? null;
  const activeAccounts = (familyRes.data?.members ?? []).filter((m) => m.userId !== null).length;

  const [name, setName] = useState("");
  const [homeLabel, setHomeLabel] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [capacity, setCapacity] = useState("");
  const [saving, setSaving] = useState(false);
  const [seededKey, setSeededKey] = useState<string | null>(null);

  // Reseed only when the SERVER values actually change — never while the admin
  // is typing (background refetches keep the same values), and always after a
  // save so server-clamped values (e.g. capacity) show up.
  const familyKey = family
    ? `${family.id}:${family.name}:${family.homeLabel ?? ""}:${family.homeLat ?? ""}:${family.homeLng ?? ""}:${family.capacity}`
    : null;
  useEffect(() => {
    if (family && familyKey && seededKey !== familyKey) {
      setName(family.name);
      setHomeLabel(family.homeLabel ?? "");
      setLat(family.homeLat === null ? "" : String(family.homeLat));
      setLng(family.homeLng === null ? "" : String(family.homeLng));
      setCapacity(String(family.capacity));
      setSeededKey(familyKey);
    }
  }, [family, familyKey, seededKey]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!family || saving) return;
    const cap = Math.trunc(Number(capacity));
    if (!Number.isFinite(cap) || cap < 1) {
      toast.error("Capacity must be a whole number of at least 1.");
      return;
    }
    const latNum = lat.trim() === "" ? null : Number(lat);
    const lngNum = lng.trim() === "" ? null : Number(lng);
    if (latNum !== null && (!Number.isFinite(latNum) || latNum < -90 || latNum > 90)) {
      toast.error("Home latitude must be a number between -90 and 90.");
      return;
    }
    if (lngNum !== null && (!Number.isFinite(lngNum) || lngNum < -180 || lngNum > 180)) {
      toast.error("Home longitude must be a number between -180 and 180.");
      return;
    }
    try {
      setSaving(true);
      await apiSend("/api/family", "PATCH", {
        name: name.trim(),
        homeLabel: homeLabel.trim(),
        homeLat: latNum,
        homeLng: lngNum,
        capacity: cap,
      });
      toast.success("Family settings saved");
      await hydrate(); // refresh the session's family cache
      await familyRes.refresh(); // reseed happens when the fresh values arrive
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save family settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <GlassCard className="space-y-4 p-4 sm:p-5">
      <SectionHeader
        icon={<UsersRound className="h-4 w-4" />}
        title="Family"
        sub="Household name, home place and capacity"
        action={<Chip tone="brand">Admin</Chip>}
      />

      {!family ? (
        familyRes.error ? (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2">
            <p className="text-xs font-medium text-red-600 dark:text-red-400">{familyRes.error}</p>
            <Button variant="outline" size="sm" className="h-7 rounded-full px-3 text-xs" onClick={() => void familyRes.refresh()}>
              Retry
            </Button>
          </div>
        ) : (
          <p className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading family settings…
          </p>
        )
      ) : (
        <form
          className="space-y-3.5"
          onSubmit={(e) => {
            void save(e);
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="family-name">Family name</Label>
              <Input
                id="family-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                disabled={saving}
                className="h-10 rounded-xl bg-background/50"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="family-home-label">Home label</Label>
              <Input
                id="family-home-label"
                value={homeLabel}
                onChange={(e) => setHomeLabel(e.target.value)}
                maxLength={80}
                placeholder="e.g. 24 Lakeview Avenue"
                disabled={saving}
                className="h-10 rounded-xl bg-background/50"
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="family-lat">Home latitude</Label>
              <Input
                id="family-lat"
                type="number"
                step="any"
                min={-90}
                max={90}
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                placeholder="13.0827"
                disabled={saving}
                className="h-10 rounded-xl bg-background/50"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="family-lng">Home longitude</Label>
              <Input
                id="family-lng"
                type="number"
                step="any"
                min={-180}
                max={180}
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                placeholder="80.2707"
                disabled={saving}
                className="h-10 rounded-xl bg-background/50"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="family-capacity">Member capacity</Label>
              <Input
                id="family-capacity"
                type="number"
                min={Math.max(1, activeAccounts)}
                max={24}
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                disabled={saving}
                className="h-10 rounded-xl bg-background/50"
              />
            </div>
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Coordinates power weather and the family map — leave one empty to clear it. Capacity can&apos;t go below
            the {activeAccounts} active member{activeAccounts === 1 ? "" : "s"}.
          </p>
          <Button type="submit" disabled={saving} className="brand-gradient h-10 rounded-xl text-white shadow-md">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Save family settings
          </Button>
        </form>
      )}
    </GlassCard>
  );
}

/* ---------- Privacy (real consent toggle + real history deletion) ---------- */

function PrivacyCard({ familyRes }: { familyRes: FamilyResource }) {
  const user = useSession((s) => s.user);
  const members = familyRes.data?.members ?? [];
  const myProfile = user ? (members.find((m) => m.userId === user.id) ?? null) : null;

  const [toggling, setToggling] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function toggleSharing(on: boolean) {
    if (!myProfile || toggling) return;
    try {
      setToggling(true);
      await apiSend("/api/members", "PATCH", { id: myProfile.id, locationSharing: on });
      toast.success(on ? "Location sharing is on" : "Location sharing is off");
      await familyRes.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update location sharing.");
    } finally {
      setToggling(false);
    }
  }

  async function deleteHistory() {
    if (deleting) return;
    try {
      setDeleting(true);
      await apiSend("/api/location", "DELETE");
      toast.success("Your location history was deleted");
      setConfirmOpen(false);
      await familyRes.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete your location history.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <GlassCard className="space-y-4 p-4 sm:p-5">
      <SectionHeader icon={<MapPin className="h-4 w-4" />} title="Privacy" sub="You control what your family sees" />

      {familyRes.error ? (
        <p className="text-xs text-red-500">Couldn&apos;t load your profile: {familyRes.error}</p>
      ) : myProfile ? (
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium leading-tight">Share my location with family</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Only your device records positions, and only while sharing is on
            </p>
          </div>
          <OnOffSegmented
            label="Share my location with family"
            value={myProfile.locationSharing}
            disabled={toggling || familyRes.loading}
            onChange={(v) => void toggleSharing(v)}
          />
        </div>
      ) : familyRes.loading ? (
        <p className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading your profile…
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          No household profile is linked to your account, so there is no location sharing to configure.
        </p>
      )}

      <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-3">
        <p className="mb-1.5 text-xs font-semibold text-red-600 dark:text-red-400">Danger zone</p>
        <p className="mb-2.5 text-[11px] leading-relaxed text-muted-foreground">
          Deleting your location history removes every recorded position for your profile. This cannot be undone.
        </p>
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="border-red-500/40 text-red-600 hover:bg-red-500/10 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
              disabled={deleting}
            >
              <Trash2 className="h-4 w-4" /> Delete my location history
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete your location history?</AlertDialogTitle>
              <AlertDialogDescription>
                Every recorded location linked to your profile will be permanently removed from the server. New
                positions will only be recorded if location sharing is on.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 text-white hover:bg-red-600/90"
                disabled={deleting}
                onClick={(e) => {
                  e.preventDefault();
                  void deleteHistory();
                }}
              >
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Delete history
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </GlassCard>
  );
}

/* ---------- Appearance (theme + elderly mode — unchanged behavior) ---------- */

const THEME_OPTIONS: { value: "light" | "dark" | "system"; icon: LucideIcon; label: string }[] = [
  { value: "light", icon: Sun, label: "Light" },
  { value: "dark", icon: Moon, label: "Dark" },
  { value: "system", icon: Monitor, label: "System" },
];

function AppearanceCard() {
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();
  const elderlyMode = useAppStore((s) => s.elderlyMode);
  const setElderlyMode = useAppStore((s) => s.setElderlyMode);

  useEffect(() => {
    document.documentElement.classList.toggle("elderly", elderlyMode);
  }, [elderlyMode]);

  return (
    <GlassCard className="space-y-5 p-4 sm:p-5">
      <SectionHeader icon={<Palette className="h-4 w-4" />} title="Appearance" sub="Make HOME SYNC feel like yours" />
      <div>
        <Label className="text-xs font-medium text-muted-foreground">Theme</Label>
        <RadioGroup
          value={mounted ? theme : undefined}
          onValueChange={setTheme}
          className="mt-2 grid grid-cols-3 gap-2"
        >
          {THEME_OPTIONS.map((t) => {
            const selected = mounted && theme === t.value;
            return (
              <Label
                key={t.value}
                htmlFor={`theme-${t.value}`}
                className={cn(
                  "flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-xs font-medium transition-colors",
                  selected
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-border/70 text-muted-foreground hover:bg-muted/60"
                )}
              >
                <RadioGroupItem id={`theme-${t.value}`} value={t.value} className="sr-only" />
                <t.icon className="h-5 w-5" aria-hidden />
                {t.label}
              </Label>
            );
          })}
        </RadioGroup>
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium leading-tight">Elderly-friendly mode</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Bigger text and buttons across the app</p>
        </div>
        <OnOffSegmented
          label="Elderly-friendly mode"
          value={mounted && elderlyMode}
          onChange={(v) => setElderlyMode(v)}
        />
      </div>
    </GlassCard>
  );
}

/* ---------- Session (real sign out) ---------- */

function SessionCard() {
  const user = useSession((s) => s.user);
  const logout = useSession((s) => s.logout);
  const [busy, setBusy] = useState(false);

  if (!user) return null;

  async function signOut() {
    if (busy) return;
    try {
      setBusy(true);
      await logout();
      toast("Signed out — see you soon");
    } finally {
      setBusy(false);
    }
  }

  return (
    <GlassCard className="space-y-4 p-4 sm:p-5">
      <SectionHeader icon={<LogOut className="h-4 w-4" />} title="Session" sub="Signed in with Google" />
      <div className="glass-inset flex items-center gap-3 rounded-xl p-3">
        <MemberAvatar name={user.name} color={user.color} role={user.role} photoUrl={user.photoUrl} size={36} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-tight">{user.name}</p>
          <p className="truncate text-[11px] text-muted-foreground">{user.email}</p>
        </div>
        <Chip>Google</Chip>
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Signing out ends this session on the server — the cookie is cleared and this device can&apos;t reach your
        family data until you sign in again.
      </p>
      <Button variant="outline" disabled={busy} onClick={() => void signOut()} className="h-10 rounded-xl">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
        Sign out
      </Button>
    </GlassCard>
  );
}

/* ---------- Settings view ---------- */

export function SettingsView() {
  const user = useSession((s) => s.user);
  // Administration keys off the session role — the server enforces it independently.
  const isAdmin = user?.role === "Family Admin";

  const familyRes = useResource<FamilyResponse>("/api/family");

  return (
    <div className="max-w-3xl space-y-4">
      <ViewTitle title="Settings" sub="Your profile, family, privacy and session" />

      {/* My profile */}
      {user ? <ProfileCard /> : null}

      {/* Family (admin only) */}
      {isAdmin ? <FamilyAdminCard familyRes={familyRes} /> : null}

      {/* Privacy */}
      <PrivacyCard familyRes={familyRes} />

      {/* Appearance */}
      <AppearanceCard />

      {/* Session */}
      <SessionCard />

      {/* About */}
      <GlassCard className="p-4 sm:p-5">
        <div className="flex flex-col items-center gap-1.5 py-2 text-center">
          <HomeSyncMark size={40} />
          <p className="text-sm font-semibold">HOME SYNC v1.0 • One Home. One Family.</p>
          <p className="text-xs text-muted-foreground">
            Weather streams live from Open-Meteo; the family map uses your real home coordinates.
          </p>
        </div>
      </GlassCard>
    </div>
  );
}
