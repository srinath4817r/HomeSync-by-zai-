"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import {
  Bell,
  Check,
  Download,
  Loader2,
  Lock,
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
import type { Member, SessionUser } from "@/lib/homesync/types";
import { useResource } from "@/lib/homesync/api";
import { useAppStore } from "@/lib/homesync/store";
import { useSession } from "@/lib/homesync/session";
import { Chip, GlassCard, MemberAvatar, SectionHeader, ViewTitle } from "@/components/homesync/glass";
import { HomeSyncMark, ShieldUserIcon } from "@/components/homesync/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const CAPACITY = 8;

const ROLE_OPTIONS = ["Family Admin", "Parent", "Senior Member", "Child"];

/** Hydration-safe "client mounted" flag (no setState-in-effect). */
const subscribeNoop = () => () => {};
function useMounted(): boolean {
  return useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false
  );
}

const THEME_OPTIONS: { value: "light" | "dark" | "system"; icon: LucideIcon; label: string }[] = [
  { value: "light", icon: Sun, label: "Light" },
  { value: "dark", icon: Moon, label: "Dark" },
  { value: "system", icon: Monitor, label: "System" },
];

const NOTIFICATION_ROWS: { key: string; label: string; helper: string }[] = [
  { key: "morning", label: "Daily morning summary", helper: "A calm digest of the day, every morning" },
  { key: "bills", label: "Bill reminders", helper: "Before each due date" },
  { key: "medicine", label: "Medicine escalations", helper: "When a dose needs attention" },
  { key: "activity", label: "Family activity", helper: "Tasks, events and purchases" },
];

/* ---------- Minimalist On/Off segmented control (no Switch components) ---------- */

function OnOffSegmented({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
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
          onClick={() => onChange(opt.next)}
          className={cn(
            "min-w-11 rounded-full px-3 py-1.5 text-xs font-semibold leading-none transition-colors",
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

function SettingRow({
  label,
  helper,
  value,
  onChange,
}: {
  label: string;
  helper?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium leading-tight">{label}</p>
        {helper ? <p className="mt-0.5 text-xs text-muted-foreground">{helper}</p> : null}
      </div>
      <OnOffSegmented label={label} value={value} onChange={onChange} />
    </div>
  );
}

/* ---------- My profile (self-editable until the Family Admin locks it) ---------- */

function ProfileCard({
  user,
  onSaved,
}: {
  user: SessionUser;
  onSaved: (patch: { name: string; role: string }) => void;
}) {
  const [name, setName] = useState(user.name);
  const [role, setRole] = useState(user.role);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (busy || !user.email) return;
    const nextName = name.trim();
    if (!nextName) {
      toast.error("Enter a display name to continue.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email, name: nextName, role }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        user?: SessionUser;
        error?: string;
      };
      if (!res.ok || !data.user) {
        toast.error(data.error ?? "Could not update your profile.");
        return;
      }
      onSaved({ name: data.user.name, role: data.user.role });
      toast.success("Profile updated");
    } catch {
      toast.error("Could not update your profile.");
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

      {user.profileLocked ? (
        <div className="space-y-3">
          <div className="rounded-xl border border-border/70 bg-muted/40 p-3">
            <Chip>
              <Lock className="h-3 w-3" /> Locked by your Family Admin
            </Chip>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Only your Family Admin can change your name or role now. Ask them to make the change for you.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="profile-name-locked">Display name</Label>
              <Input
                id="profile-name-locked"
                value={user.name}
                readOnly
                disabled
                className="h-10 rounded-xl bg-background/50"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-role-locked">Role</Label>
              <Input
                id="profile-role-locked"
                value={user.role}
                readOnly
                disabled
                className="h-10 rounded-xl bg-background/50"
              />
            </div>
          </div>
        </div>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
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
              <Label htmlFor="profile-role">Role</Label>
              <Select value={role} onValueChange={setRole} disabled={busy}>
                <SelectTrigger id="profile-role" className="h-10 w-full rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button type="submit" disabled={busy} className="brand-gradient h-10 rounded-xl text-white shadow-md">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Save profile
          </Button>
        </form>
      )}
    </GlassCard>
  );
}

/* ---------- Settings view ---------- */

export function SettingsView() {
  // Signed-in user (profile card + session updates)
  const user = useSession((s) => s.user);
  const updateUser = useSession((s) => s.updateUser);

  // Theme (mounted guard avoids hydration mismatch)
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();

  // Elderly-friendly mode (persisted in the app store)
  const elderlyMode = useAppStore((s) => s.elderlyMode);
  const setElderlyMode = useAppStore((s) => s.setElderlyMode);
  useEffect(() => {
    document.documentElement.classList.toggle("elderly", elderlyMode);
  }, [elderlyMode]);

  // Family list (read-only summary)
  const {
    data: members,
    loading: membersLoading,
    error: membersError,
  } = useResource<Member[]>("/api/members");
  const memberList = members ?? [];
  const capacityPct = Math.min(100, Math.round((memberList.length / CAPACITY) * 100));

  // Local preference state (client-only, not persisted)
  const [familyName, setFamilyName] = useState("Our Home");
  const [shareLocation, setShareLocation] = useState(true);
  const [recordLocation, setRecordLocation] = useState(true);
  const [approxOnly, setApproxOnly] = useState(false);
  const [retention, setRetention] = useState("30");
  const [notifications, setNotifications] = useState<Record<string, boolean>>({
    morning: true,
    bills: true,
    medicine: true,
    activity: true,
  });

  return (
    <div className="max-w-3xl space-y-4">
      <ViewTitle title="Settings" sub="Your profile, appearance, family, privacy and more" />

      {/* My profile */}
      {user ? (
        user.isGuest ? (
          <p className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground">
            <ShieldUserIcon size={14} /> Guests can&apos;t edit a profile
          </p>
        ) : (
          <ProfileCard key={user.id} user={user} onSaved={(patch) => updateUser(patch)} />
        )
      ) : null}

      {/* Appearance */}
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

      {/* Family */}
      <GlassCard className="space-y-4 p-4 sm:p-5">
        <SectionHeader icon={<UsersRound className="h-4 w-4" />} title="Family" sub="The people who share this home" />
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="family-name"
            value={familyName}
            onChange={(e) => setFamilyName(e.target.value)}
            aria-label="Family name"
            className="glass-inset border-0 focus-visible:ring-primary/40"
          />
          <Button
            className="brand-gradient shrink-0 border-0 text-white shadow-md"
            onClick={() => toast.success("Saved")}
          >
            Save
          </Button>
        </div>
        <div className="space-y-2.5">
          <div className="flex items-center justify-between gap-3">
            {membersError ? (
              <p className="text-xs text-red-500">Couldn&apos;t load members: {membersError}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                {membersLoading ? "Loading members…" : `${memberList.length} members • capacity ${CAPACITY}`}
              </p>
            )}
            {!membersError && memberList.length > 0 ? (
              <div className="flex shrink-0 -space-x-2">
                {memberList.slice(0, CAPACITY).map((m) => (
                  <MemberAvatar
                    key={m.id}
                    name={m.name}
                    color={m.color}
                    role={m.role}
                    size={26}
                    className="ring-2 ring-background"
                    title={`${m.name} • ${m.role}`}
                  />
                ))}
              </div>
            ) : null}
          </div>
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-label="Family capacity"
            aria-valuemin={0}
            aria-valuemax={CAPACITY}
            aria-valuenow={memberList.length}
          >
            <div
              className="brand-gradient h-full rounded-full transition-all"
              style={{ width: `${capacityPct}%` }}
            />
          </div>
        </div>
      </GlassCard>

      {/* Location & privacy */}
      <GlassCard className="space-y-4 p-4 sm:p-5">
        <SectionHeader icon={<MapPin className="h-4 w-4" />} title="Location & privacy" sub="You control what your family sees" />
        <SettingRow
          label="Share my location with family"
          value={shareLocation}
          onChange={setShareLocation}
        />
        <SettingRow
          label="Record location every 30 minutes"
          helper="Background limits apply — recording may pause when the app is closed"
          value={recordLocation}
          onChange={setRecordLocation}
        />
        <SettingRow
          label="Approximate location only"
          value={approxOnly}
          onChange={setApproxOnly}
        />
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <Label htmlFor="location-retention" className="text-sm font-medium leading-tight">
              Location history retention
            </Label>
            <p className="mt-0.5 text-xs text-muted-foreground">How long past locations are kept</p>
          </div>
          <Select value={retention} onValueChange={setRetention}>
            <SelectTrigger id="location-retention" className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="30">30 days</SelectItem>
              <SelectItem value="90">90 days</SelectItem>
              <SelectItem value="365">1 year</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-3">
          <p className="mb-2 text-xs font-semibold text-red-600 dark:text-red-400">Danger zone</p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              className="border-red-500/40 text-red-600 hover:bg-red-500/10 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
              onClick={() => toast.success("Location history cleared")}
            >
              <Trash2 className="h-4 w-4" /> Delete my location history
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => toast("Export will be emailed when storage integration is connected")}
            >
              <Download className="h-4 w-4" /> Export family data
            </Button>
          </div>
        </div>
      </GlassCard>

      {/* Notifications */}
      <GlassCard className="space-y-3.5 p-4 sm:p-5">
        <SectionHeader icon={<Bell className="h-4 w-4" />} title="Notifications" sub="Stay in the loop, calmly" />
        {NOTIFICATION_ROWS.map((row) => (
          <SettingRow
            key={row.key}
            label={row.label}
            helper={row.helper}
            value={notifications[row.key] ?? false}
            onChange={(v) => setNotifications((prev) => ({ ...prev, [row.key]: v }))}
          />
        ))}
      </GlassCard>

      {/* About */}
      <GlassCard className="p-4 sm:p-5">
        <div className="flex flex-col items-center gap-1.5 py-2 text-center">
          <HomeSyncMark size={40} />
          <p className="text-sm font-semibold">HOME SYNC v1.0 • One Home. One Family.</p>
          <p className="text-xs text-muted-foreground">
            Maps, weather and nearby services stream live data.
          </p>
        </div>
      </GlassCard>
    </div>
  );
}
