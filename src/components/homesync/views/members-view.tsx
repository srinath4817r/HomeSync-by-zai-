"use client";

import { useState } from "react";
import {
  Check,
  Inbox,
  Loader2,
  MapPin,
  Pause,
  Play,
  Plus,
  ShieldCheck,
  Ticket,
  UserMinus,
  UserRoundPlus,
  UsersRound,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { apiSend, timeAgo, useResource } from "@/lib/homesync/api";
import { useSession } from "@/lib/homesync/session";
import type { FamilyInfo, InviteInfo, JoinRequest, Member } from "@/lib/homesync/types";
import { InviteCodeRow } from "@/components/homesync/onboarding";
import { Button } from "@/components/ui/button";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Chip,
  EmptyState,
  GlassCard,
  MemberAvatar,
  SectionHeader,
  ViewTitle,
} from "@/components/homesync/glass";

const PRIMARY_BTN = "brand-gradient text-white border-0";

const ALL_ROLES = ["Family Admin", "Parent", "Senior Member", "Child", "Caregiver", "Member"] as const;

/** Roles an admin can assign when approving a join request — never "Family Admin". */
const APPROVE_ROLES = ["Parent", "Senior Member", "Child", "Caregiver", "Member"] as const;

/** Roles for household profiles of people who don't use the app themselves. */
const PROFILE_ROLES = ["Parent", "Senior Member", "Child", "Caregiver", "Member"] as const;

const EXPIRY_OPTIONS = [
  { days: 1, label: "1 day" },
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
];

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

/* ---------------- Loading skeletons (real placeholders, no fake data) ---------------- */

function InviteRowSkeleton() {
  return (
    <div className="glass-inset flex items-center justify-between gap-2 rounded-xl px-3 py-2">
      <div className="min-w-0 space-y-1.5">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-2.5 w-40" />
      </div>
      <Skeleton className="h-5 w-14 rounded-full" />
    </div>
  );
}

function MemberCardSkeleton() {
  return (
    <GlassCard className="flex flex-col p-4 sm:p-5" aria-hidden>
      <div className="flex items-start gap-3">
        <Skeleton className="h-14 w-14 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1 space-y-2 pt-1">
          <Skeleton className="h-3.5 w-28" />
          <div className="flex gap-1.5">
            <Skeleton className="h-4 w-14 rounded-full" />
            <Skeleton className="h-4 w-20 rounded-full" />
          </div>
        </div>
      </div>
      <Skeleton className="mt-3 h-[76px] w-full rounded-xl" />
    </GlassCard>
  );
}

/* ---------------- Invite codes (admin) ---------------- */

function InviteAdminCard() {
  const { data, loading, error, refresh } = useResource<{ invitations: InviteInfo[] }>("/api/family/invite");
  const [expiryDays, setExpiryDays] = useState("7");
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [latest, setLatest] = useState<InviteInfo | null>(null);

  const invitations = data?.invitations ?? [];

  function inviteState(inv: InviteInfo): { label: string; tone: "success" | "warning" | "danger" } {
    if (inv.revokedAt) return { label: "Revoked", tone: "danger" };
    if (inv.expired) return { label: "Expired", tone: "warning" };
    return { label: "Active", tone: "success" };
  }

  function daysLeft(iso: string): number {
    return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000));
  }

  async function createInvite() {
    if (creating) return;
    try {
      setCreating(true);
      const res = await apiSend<{ invitation: InviteInfo }>("/api/family/invite", "POST", {
        expiresInDays: Number(expiryDays),
      });
      setLatest(res.invitation);
      await refresh();
      toast.success(`Invite code ${res.invitation.code} created — valid for ${expiryDays} day${Number(expiryDays) > 1 ? "s" : ""}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create an invite code.");
    } finally {
      setCreating(false);
    }
  }

  async function revoke(inv: InviteInfo) {
    if (busyId) return;
    try {
      setBusyId(inv.id);
      await apiSend("/api/family/invite", "DELETE", { id: inv.id });
      toast.success(`Invite code ${inv.code} revoked`);
      if (latest?.id === inv.id) setLatest(null);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not revoke the invite code.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <GlassCard className="space-y-3.5 p-4 sm:p-5">
      <SectionHeader
        icon={<Ticket className="h-4 w-4" />}
        title="Invite a member"
        sub="Share a code so family can request to join with Google sign-in"
        action={<Chip tone="brand">Admin</Chip>}
      />

      {error ? (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2">
          <p className="text-xs font-medium text-red-600 dark:text-red-400">{error}</p>
          <Button variant="outline" size="sm" className="h-7 rounded-full px-3 text-xs" onClick={() => void refresh()}>
            Retry
          </Button>
        </div>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="space-y-1 sm:w-44">
          <Label htmlFor="invite-expiry" className="text-[11px] text-muted-foreground">
            Code expires after
          </Label>
          <Select value={expiryDays} onValueChange={setExpiryDays}>
            <SelectTrigger id="invite-expiry" className="h-9 w-full rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EXPIRY_OPTIONS.map((o) => (
                <SelectItem key={o.days} value={String(o.days)}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          className={`h-9 shrink-0 rounded-xl px-4 text-sm sm:mt-5 ${PRIMARY_BTN}`}
          disabled={creating}
          onClick={() => void createInvite()}
        >
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserRoundPlus className="h-4 w-4" />}
          Create invite code
        </Button>
      </div>

      {latest ? (
        <div className="rounded-xl border border-primary/30 bg-primary/10 p-3">
          <p className="mb-2 text-[11px] font-semibold text-primary">
            New code — share it with your family, then approve their request here
          </p>
          <InviteCodeRow code={latest.code} />
        </div>
      ) : null}

      {loading && invitations.length === 0 ? (
        <div className="space-y-1.5">
          <InviteRowSkeleton />
          <InviteRowSkeleton />
        </div>
      ) : invitations.length === 0 ? (
        <p className="px-1 text-xs text-muted-foreground">No invite codes yet.</p>
      ) : (
        <ul className="scrollbar-slim max-h-44 space-y-1.5 overflow-y-auto pr-1">
          {invitations.map((inv) => {
            const state = inviteState(inv);
            const revocable = !inv.revokedAt && !inv.expired;
            return (
              <li key={inv.id} className="glass-inset flex items-center justify-between gap-2 rounded-xl px-3 py-2">
                <div className="min-w-0">
                  <p className="font-mono text-xs font-semibold tracking-widest">{inv.code}</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    Created {timeAgo(inv.createdAt)}
                    {revocable ? ` • expires in ${daysLeft(inv.expiresAt)} day${daysLeft(inv.expiresAt) === 1 ? "" : "s"}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Chip tone={state.tone}>{state.label}</Chip>
                  {revocable ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 rounded-full px-2.5 text-[11px] text-red-600 hover:bg-red-500/10 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                      disabled={busyId === inv.id}
                      onClick={() => void revoke(inv)}
                    >
                      {busyId === inv.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                      Revoke
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </GlassCard>
  );
}

/* ---------------- Join requests (admin) ---------------- */

function JoinRequestsCard() {
  const { data, loading, error, refresh } = useResource<{ requests: JoinRequest[] }>("/api/family/requests");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [roles, setRoles] = useState<Record<string, string>>({});

  const requests = data?.requests ?? [];

  async function act(request: JoinRequest, action: "approve" | "reject") {
    if (busyId) return;
    try {
      setBusyId(request.id);
      if (action === "approve") {
        await apiSend("/api/family/requests", "POST", {
          membershipId: request.id,
          action: "approve",
          role: roles[request.id] ?? "Member",
        });
        toast.success(`${request.user.name} joined the family`);
      } else {
        await apiSend("/api/family/requests", "POST", { membershipId: request.id, action: "reject" });
        toast.success(`Request from ${request.user.name} declined`);
      }
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not process the join request.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <GlassCard className="space-y-3.5 p-4 sm:p-5">
      <SectionHeader
        icon={<Inbox className="h-4 w-4" />}
        title="Join requests"
        sub="People waiting for your approval"
        action={
          requests.length > 0 ? <Chip tone="warning">{requests.length} pending</Chip> : <Chip tone="brand">Admin</Chip>
        }
      />

      {error ? (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2">
          <p className="text-xs font-medium text-red-600 dark:text-red-400">{error}</p>
          <Button variant="outline" size="sm" className="h-7 rounded-full px-3 text-xs" onClick={() => void refresh()}>
            Retry
          </Button>
        </div>
      ) : loading && requests.length === 0 ? (
        <div className="glass-inset rounded-xl p-3">
          <div className="flex items-center gap-2.5">
            <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-2.5 w-48" />
            </div>
          </div>
          <Skeleton className="mt-2.5 h-8 w-full rounded-xl" />
        </div>
      ) : requests.length === 0 ? (
        <p className="px-1 text-xs text-muted-foreground">No pending requests right now.</p>
      ) : (
        <ul className="scrollbar-slim max-h-80 space-y-2 overflow-y-auto pr-1">
          {requests.map((request) => (
            <li key={request.id} className="glass-inset rounded-xl p-3">
              <div className="flex items-center gap-2.5">
                <MemberAvatar name={request.user.name} color="#8f7a99" photoUrl={request.user.photoUrl} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold leading-tight">{request.user.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {request.user.email} • requested {timeAgo(request.createdAt)}
                  </p>
                </div>
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <Select
                  value={roles[request.id] ?? "Member"}
                  onValueChange={(v) => setRoles((prev) => ({ ...prev, [request.id]: v }))}
                >
                  <SelectTrigger className="h-8 min-w-[140px] flex-1 rounded-xl text-xs" aria-label={`Role for ${request.user.name}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {APPROVE_ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  className={`h-8 rounded-xl px-3.5 text-xs ${PRIMARY_BTN}`}
                  disabled={Boolean(busyId)}
                  onClick={() => void act(request, "approve")}
                >
                  {busyId === request.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  Approve
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 rounded-xl px-3.5 text-xs text-red-600 hover:bg-red-500/10 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                  disabled={Boolean(busyId)}
                  onClick={() => void act(request, "reject")}
                >
                  {busyId === request.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                  Reject
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </GlassCard>
  );
}

/* ---------------- Member card ---------------- */

function MemberCard({
  member,
  isSelf,
  isAdmin,
  busy,
  onToggleLocation,
  onRoleChange,
  onRemove,
}: {
  member: Member;
  isSelf: boolean;
  isAdmin: boolean;
  busy: boolean;
  onToggleLocation: (member: Member, sharing: boolean) => void;
  onRoleChange: (member: Member, role: string) => void;
  onRemove: (member: Member) => void;
}) {
  return (
    <GlassCard className="flex flex-col p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <MemberAvatar
          name={member.name}
          color={member.color}
          role={member.role}
          photoUrl={member.photoUrl}
          size={56}
          className="shrink-0"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="truncate text-sm font-bold">{member.name}</p>
            {member.isAdmin ? <Chip tone="brand">Admin</Chip> : null}
            {isSelf ? <Chip tone="success">You</Chip> : null}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Chip>{member.relation}</Chip>
            <Chip>{member.role}</Chip>
          </div>
        </div>
      </div>

      {/* Location state — toggling is self-service only */}
      <div className="glass-inset mt-3 rounded-xl p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {member.locationSharing ? (
              <>
                <p className="flex items-center gap-1 truncate text-xs font-semibold">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  {member.locationLabel ?? "Location available"}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {member.locationUpdatedAt ? `Updated ${timeAgo(member.locationUpdatedAt)}` : "No signal recorded yet"}
                </p>
              </>
            ) : (
              <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                No live location
              </p>
            )}
          </div>
          {isSelf ? (
            <Button
              variant={member.locationSharing ? "secondary" : "outline"}
              size="sm"
              className="h-10 min-w-[110px] gap-1.5 rounded-full border-white/40 px-4 text-xs font-semibold dark:border-white/10"
              disabled={busy}
              aria-pressed={member.locationSharing}
              aria-label={`Location sharing for ${member.name}: ${member.locationSharing ? "on — pause it" : "paused — resume it"}`}
              onClick={() => onToggleLocation(member, !member.locationSharing)}
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : member.locationSharing ? (
                <Pause className="h-3.5 w-3.5" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
              {member.locationSharing ? "Pause" : "Resume"}
            </Button>
          ) : null}
        </div>
        <div className="mt-2.5">
          <Chip tone={member.locationSharing ? "success" : "default"}>
            {member.locationSharing ? "Sharing on" : "Sharing off"}
          </Chip>
          {member.locationSharing && member.lastPing ? (
            <Chip className="ml-1.5">±{Math.round(member.lastPing.accuracyM ?? 0)} m</Chip>
          ) : null}
        </div>
      </div>

      {/* Role management + removal — admin only, never on your own profile */}
      {isAdmin && !isSelf ? (
        <div className="mt-auto space-y-2.5 pt-3.5">
          <div className="grid gap-1.5">
            <Label className="text-[11px] text-muted-foreground">Role</Label>
            <Select value={member.role} disabled={busy} onValueChange={(v) => onRoleChange(member, v)}>
              <SelectTrigger className="h-8 w-full text-xs" aria-label={`Role for ${member.name}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ALL_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                className="h-8 justify-start px-2 text-xs text-red-600 hover:bg-red-500/10 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                disabled={busy}
              >
                <UserMinus className="h-3.5 w-3.5" /> Remove profile
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove {member.name} from the household?</AlertDialogTitle>
                <AlertDialogDescription>
                  The profile and its recorded locations are removed. If {member.name} has an account, they lose access
                  to HOME SYNC. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-red-600 text-white hover:bg-red-600/90"
                  onClick={() => onRemove(member)}
                >
                  Remove
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      ) : (
        <p className="mt-auto pt-3.5 text-[10px] text-muted-foreground">
          {isSelf && isAdmin
            ? "Ask another Family Admin to change your role."
            : "Roles are managed by the Family Admin."}
        </p>
      )}
    </GlassCard>
  );
}

/* ---------------- View ---------------- */

export function MembersView() {
  const user = useSession((s) => s.user);
  // Administration keys off the session role — the server enforces it independently.
  const isAdmin = user?.role === "Family Admin";

  const { data, loading, error, refresh } = useResource<Member[]>("/api/members");
  const { data: familyRes } = useResource<FamilyResponse>("/api/family");

  const members = data ?? [];
  const family = familyRes?.family ?? null;
  const activeAccounts = (familyRes?.members ?? []).filter((m) => m.userId !== null).length;
  const capacity = family?.capacity ?? 0;
  const places = Math.max(0, capacity - activeAccounts);
  const pct = capacity > 0 ? Math.min(100, Math.round((activeAccounts / capacity) * 100)) : 0;

  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [profile, setProfile] = useState({ name: "", relation: "", role: "Member" });

  async function toggleLocation(member: Member, sharing: boolean) {
    if (busyId) return;
    try {
      setBusyId(member.id);
      await apiSend("/api/members", "PATCH", { id: member.id, locationSharing: sharing });
      toast.success(sharing ? "Location sharing is on" : "Location sharing is paused");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update location sharing");
    } finally {
      setBusyId(null);
    }
  }

  async function changeRole(member: Member, role: string) {
    if (busyId || role === member.role) return;
    // Honest client-side guard: the last admin profile can never be demoted here.
    if (member.isAdmin && role !== "Family Admin") {
      const adminProfiles = members.filter((m) => m.isAdmin).length;
      if (adminProfiles <= 1) {
        toast.error("There must always be one Family Admin. Promote someone else first.");
        return;
      }
    }
    try {
      setBusyId(member.id);
      // Sending isAdmin alongside the role keeps the admin flag in sync on demotion.
      await apiSend("/api/members", "PATCH", {
        id: member.id,
        role,
        ...(role !== "Family Admin" ? { isAdmin: false } : {}),
      });
      toast.success(`${member.name} is now ${role}`);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update role");
    } finally {
      setBusyId(null);
    }
  }

  async function removeMember(member: Member) {
    if (busyId) return;
    try {
      setBusyId(member.id);
      await apiSend("/api/members", "DELETE", { id: member.id });
      toast.success(`${member.name} was removed from the household`);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove member");
    } finally {
      setBusyId(null);
    }
  }

  async function submitAddProfile(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    const name = profile.name.trim();
    const relation = profile.relation.trim();
    if (!name) {
      toast.error("Enter a name to continue.");
      return;
    }
    try {
      setSaving(true);
      await apiSend("/api/members", "POST", { name, relation, role: profile.role });
      toast.success(`${name} was added to the household`);
      setAddOpen(false);
      setProfile({ name: "", relation: "", role: "Member" });
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add the profile");
    } finally {
      setSaving(false);
    }
  }

  // First paint: real skeleton placeholders that mirror the final layout.
  if (loading && members.length === 0) {
    return (
      <div className="space-y-4">
        <ViewTitle title="Family Members" sub="Everyone who shares this home" />
        <GlassCard className="p-4 sm:p-5">
          <div className="flex items-center gap-2.5">
            <Skeleton className="h-8 w-8 rounded-xl" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-36" />
              <Skeleton className="h-2.5 w-52" />
            </div>
          </div>
          <Skeleton className="mt-4 h-2.5 w-full rounded-full" />
        </GlassCard>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <MemberCardSkeleton />
          <MemberCardSkeleton />
          <MemberCardSkeleton />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <ViewTitle title="Family Members" sub="Everyone who shares this home" />
        <EmptyState icon={<UsersRound className="h-10 w-10" />} title="Couldn’t load family members" sub={error} />
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => void refresh()}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ViewTitle
        title="Family Members"
        sub="Everyone who shares this home"
        right={
          <>
            <span className="hidden text-xs font-medium text-muted-foreground md:inline">
              {activeAccounts} active member{activeAccounts === 1 ? "" : "s"} • {members.length} household profile
              {members.length === 1 ? "" : "s"}
            </span>
            {isAdmin ? (
              <Button
                className={`h-10 px-4 text-sm ${PRIMARY_BTN}`}
                onClick={() => {
                  setProfile({ name: "", relation: "", role: "Member" });
                  setAddOpen(true);
                }}
              >
                <Plus className="h-4 w-4" /> Add profile
              </Button>
            ) : null}
          </>
        }
      />

      {/* Capacity */}
      <GlassCard className="p-4 sm:p-5">
        <SectionHeader
          icon={<UsersRound className="h-4 w-4" />}
          title="Family capacity"
          sub={`${family?.name ?? "Your home"} • ${activeAccounts} of ${capacity} member places used`}
          action={
            capacity > 0 ? (
              <Chip tone={places > 0 ? "brand" : "warning"}>
                {places} place{places === 1 ? "" : "s"} available
              </Chip>
            ) : null
          }
        />
        <div
          className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label="Family capacity"
          aria-valuemin={0}
          aria-valuemax={capacity}
          aria-valuenow={activeAccounts}
        >
          <div className="brand-gradient h-full rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          {isAdmin
            ? "You can change capacity in Settings. Profiles for people without an account don’t take a member place."
            : "Profiles for people without an account don’t take a member place."}
        </p>
      </GlassCard>

      {/* Admin: join requests first — people are waiting */}
      {isAdmin ? <JoinRequestsCard /> : null}

      {/* Admin: invite codes */}
      {isAdmin ? <InviteAdminCard /> : null}

      {/* Household roster */}
      <div className="space-y-2">
        <SectionHeader
          icon={<UsersRound className="h-4 w-4" />}
          title="Household"
          sub="Everyone in this home, with or without an account"
        />
        {members.length === 0 ? (
          <EmptyState
            icon={<UsersRound className="h-10 w-10" />}
            title="No members yet"
            sub={
              isAdmin
                ? "Add a household profile or share an invite code so your family can join."
                : "Ask the Family Admin to add your family."
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {members.map((member) => (
              <MemberCard
                key={member.id}
                member={member}
                isSelf={Boolean(user && member.userId === user.id)}
                isAdmin={isAdmin}
                busy={busyId === member.id}
                onToggleLocation={(m, sharing) => void toggleLocation(m, sharing)}
                onRoleChange={(m, role) => void changeRole(m, role)}
                onRemove={(m) => void removeMember(m)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Honest join-flow note */}
      <GlassCard className="p-4">
        <div className="flex items-start gap-2.5">
          <ShieldCheck aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="text-xs leading-relaxed text-muted-foreground">
            Joining requires Google sign-in and admin approval. Requested roles are not authoritative until an
            administrator assigns them.
          </p>
        </div>
      </GlassCard>

      {/* Add household profile dialog (admin) */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add a household profile</DialogTitle>
            <DialogDescription>
              For people who share the home but don’t use the app — like grandparents or a helper.
            </DialogDescription>
          </DialogHeader>
          <form className="grid gap-3.5 py-1" onSubmit={submitAddProfile}>
            <div className="grid gap-1.5">
              <Label htmlFor="profile-add-name">Name *</Label>
              <Input
                id="profile-add-name"
                placeholder="e.g. Meera"
                maxLength={60}
                autoComplete="off"
                value={profile.name}
                onChange={(e) => setProfile({ ...profile, name: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="profile-add-relation">Relation</Label>
              <Input
                id="profile-add-relation"
                placeholder="e.g. Grandmother, Uncle"
                maxLength={30}
                autoComplete="off"
                value={profile.relation}
                onChange={(e) => setProfile({ ...profile, relation: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Role</Label>
              <Select value={profile.role} onValueChange={(v) => setProfile({ ...profile, role: v })}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROFILE_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setAddOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className={PRIMARY_BTN} disabled={saving || profile.name.trim().length === 0}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserRoundPlus className="h-4 w-4" />}
                Add profile
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
