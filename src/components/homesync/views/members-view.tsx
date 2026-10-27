"use client";

import { useState } from "react";
import { MapPin, Pause, Play, Plus, ShieldCheck, UserMinus, UserRoundPlus, UsersRound } from "lucide-react";
import { toast } from "sonner";

import { apiSend, timeAgo, useResource } from "@/lib/homesync/api";
import { canWrite } from "@/lib/homesync/roles";
import { useSession } from "@/lib/homesync/session";
import type { Member } from "@/lib/homesync/types";
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
import {
  Chip,
  EmptyState,
  GlassCard,
  MemberAvatar,
  PageLoader,
  SectionHeader,
  ViewTitle,
} from "@/components/homesync/glass";

const CAPACITY = 8;
const ROLES = ["Family Admin", "Parent", "Senior Member", "Child", "Caregiver", "Member"] as const;

const PRIMARY_BTN = "brand-gradient text-white border-0";

interface InviteForm {
  name: string;
  relation: string;
  role: string;
}

function emptyInvite(): InviteForm {
  return { name: "", relation: "", role: "Member" };
}

/** Join code generated client-side from crypto.randomUUID. */
function newJoinCode(): string {
  return `HS-${crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}

function MemberCard({
  member,
  isSelf,
  busy,
  writable,
  onToggleLocation,
  onRoleChange,
  onRemove,
}: {
  member: Member;
  isSelf: boolean;
  busy: boolean;
  writable: boolean;
  onToggleLocation: (member: Member, sharing: boolean) => void;
  onRoleChange: (member: Member, role: string) => void;
  onRemove: (member: Member) => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  return (
    <GlassCard className="flex flex-col p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <MemberAvatar name={member.name} color={member.color} role={member.role} size={56} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="truncate text-sm font-bold">{member.name}</p>
            {member.isAdmin ? <Chip tone="brand">Admin</Chip> : null}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Chip>{member.relation}</Chip>
            <Chip>{member.role}</Chip>
          </div>
        </div>
      </div>

      <div className="glass-inset mt-3 rounded-xl p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {member.locationSharing ? (
              <>
                <p className="flex items-center gap-1 truncate text-xs font-semibold">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  {member.locationLabel ?? "Location available"}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">Updated {timeAgo(member.locationUpdatedAt)}</p>
              </>
            ) : (
              <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                No live location
              </p>
            )}
          </div>
          <Button
            variant={member.locationSharing ? "secondary" : "outline"}
            size="sm"
            className="h-10 min-w-[110px] gap-1.5 rounded-full border-white/40 px-4 text-xs font-semibold dark:border-white/10"
            disabled={busy || !writable}
            aria-pressed={member.locationSharing}
            aria-label={`Location sharing for ${member.name}: ${member.locationSharing ? "on — pause it" : "paused — resume it"}`}
            onClick={() => onToggleLocation(member, !member.locationSharing)}
          >
            {member.locationSharing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            {member.locationSharing ? "Pause" : "Resume"}
          </Button>
        </div>
        <div className="mt-2.5">
          <Chip tone={member.locationSharing ? "success" : "default"}>
            {member.locationSharing ? "Sharing on" : "Sharing off"}
          </Chip>
        </div>
      </div>

      <div className="mt-auto space-y-2.5 pt-3.5">
        <div className="grid gap-1.5">
          <Label className="text-[11px] text-muted-foreground">Role</Label>
          <Select
            value={member.role}
            disabled={isSelf || busy || !writable}
            onValueChange={(v) => onRoleChange(member, v)}
          >
            <SelectTrigger className="h-8 w-full text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLES.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isSelf ? (
            <p className="text-[10px] text-muted-foreground">You can’t change your own role.</p>
          ) : !writable ? (
            <p className="text-[10px] text-muted-foreground">View-only for your role.</p>
          ) : null}
        </div>

        {writable ? (
          <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                className="h-8 justify-start px-2 text-xs text-red-600 hover:bg-red-500/10 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                disabled={busy}
              >
                <UserMinus className="h-3.5 w-3.5" /> Remove member
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove {member.name} from the family?</AlertDialogTitle>
                <AlertDialogDescription>
                  {member.name} will lose access to HOME SYNC. Past doses, tasks and bills stay in history. This cannot
                  be undone.
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
        ) : (
          <Chip className="self-start">View-only for your role</Chip>
        )}
      </div>
    </GlassCard>
  );
}

export function MembersView() {
  const { data, loading, error, refresh } = useResource<Member[]>("/api/members");
  const user = useSession((s) => s.user);
  const writable = canWrite(user?.role);
  // Roster administration keys off the session role — never a hardcoded name.
  const isAdmin = user?.role === "Family Admin";

  const [inviteOpen, setInviteOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [invite, setInvite] = useState<InviteForm>(emptyInvite);

  const members = data ?? [];
  const count = members.length;
  const places = Math.max(0, CAPACITY - count);
  const pct = Math.min(100, Math.round((count / CAPACITY) * 100));

  async function toggleLocation(member: Member, sharing: boolean) {
    if (busyId) return;
    try {
      setBusyId(member.id);
      await apiSend("/api/members", "PATCH", { id: member.id, locationSharing: sharing });
      toast.success(`Location sharing ${sharing ? "resumed" : "paused"} for ${member.name}`);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update location sharing");
    } finally {
      setBusyId(null);
    }
  }

  async function changeRole(member: Member, role: string) {
    if (busyId || role === member.role) return;
    try {
      setBusyId(member.id);
      await apiSend("/api/members", "PATCH", { id: member.id, role });
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
      toast.success(`${member.name} removed from the family`);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove member");
    } finally {
      setBusyId(null);
    }
  }

  async function submitInvite() {
    try {
      setSaving(true);
      await apiSend("/api/members", "POST", {
        name: invite.name.trim(),
        relation: invite.relation.trim(),
        role: invite.role,
      });
      toast.success(`Invite created — share this code with your family: ${newJoinCode()}`, { duration: 15000 });
      setInviteOpen(false);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create invite");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <PageLoader label="Loading family…" />;

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
              {count} / {CAPACITY} members • {places} place{places === 1 ? "" : "s"} available
            </span>
            {writable ? (
              <Button
                className={`h-10 px-4 text-sm ${PRIMARY_BTN}`}
                onClick={() => {
                  setInvite(emptyInvite());
                  setInviteOpen(true);
                }}
              >
                <Plus className="h-4 w-4" /> Invite Member
              </Button>
            ) : (
              <Chip tone="brand">View-only for your role</Chip>
            )}
          </>
        }
      />

      {/* Capacity */}
      <GlassCard className="p-4 sm:p-5">
        <SectionHeader
          icon={<UsersRound className="h-4 w-4" />}
          title="Family capacity"
          sub={`${count} of ${CAPACITY} member slots used`}
          action={
            <Chip tone={places > 0 ? "brand" : "warning"}>
              {places} place{places === 1 ? "" : "s"} available
            </Chip>
          }
        />
        <div
          className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={CAPACITY}
          aria-valuenow={count}
        >
          <div
            className="brand-gradient h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          {isAdmin ? "You can increase capacity in Settings." : "Administrators can increase capacity in Settings."}
        </p>
      </GlassCard>

      {/* Member cards */}
      {members.length === 0 ? (
        <EmptyState icon={<UsersRound className="h-10 w-10" />} title="No members yet" sub="Invite your family to get started." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {members.map((member) => (
            <MemberCard
              key={member.id}
              member={member}
              isSelf={Boolean(user?.memberId && member.id === user.memberId)}
              busy={busyId === member.id}
              writable={writable}
              onToggleLocation={(m, sharing) => void toggleLocation(m, sharing)}
              onRoleChange={(m, role) => void changeRole(m, role)}
              onRemove={(m) => void removeMember(m)}
            />
          ))}
        </div>
      )}

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

      {/* Invite dialog */}
      <Dialog
        open={inviteOpen}
        onOpenChange={(o) => {
          if (o) setInvite(emptyInvite());
          setInviteOpen(o);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Invite a family member</DialogTitle>
            <DialogDescription>
              They’ll appear here after joining with Google sign-in and your approval.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3.5 py-1">
            <div className="grid gap-1.5">
              <Label htmlFor="invite-name">Name *</Label>
              <Input
                id="invite-name"
                placeholder="e.g. Meera"
                value={invite.name}
                onChange={(e) => setInvite({ ...invite, name: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="invite-relation">Relation *</Label>
              <Input
                id="invite-relation"
                placeholder="e.g. Wife, Son, Uncle"
                value={invite.relation}
                onChange={(e) => setInvite({ ...invite, relation: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Requested role</Label>
              <Select value={invite.role} onValueChange={(v) => setInvite({ ...invite, role: v })}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setInviteOpen(false)}>
              Cancel
            </Button>
            <Button
              className={PRIMARY_BTN}
              disabled={invite.name.trim().length === 0 || invite.relation.trim().length === 0 || saving}
              onClick={() => void submitInvite()}
            >
              <UserRoundPlus className="h-4 w-4" /> Create invite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
