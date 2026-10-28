"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  Check,
  CheckCheck,
  Eye,
  HeartHandshake,
  Lightbulb,
  Pill,
  Plus,
  RotateCcw,
  SkipForward,
  Trash2,
  TriangleAlert,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";

import { apiSend, fmtDate, fmtTime, useResource } from "@/lib/homesync/api";
import { canWrite } from "@/lib/homesync/roles";
import { useSession } from "@/lib/homesync/session";
import { useAppStore } from "@/lib/homesync/store";
import type { Member } from "@/lib/homesync/types";
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
import { Button } from "@/components/ui/button";
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
  ViewTitle,
} from "@/components/homesync/glass";

/**
 * A medicine dose exactly as GET /api/medicines returns it.
 * Status is one of scheduled | taken | skipped | acknowledged — confirmations
 * carry actedBy/actedAt, recorded server-side from the signed-in session.
 */
interface Dose {
  id: string;
  memberId: string;
  caregiverId: string | null;
  name: string;
  dosage: string;
  timeLabel: string;
  instructions: string | null;
  status: "scheduled" | "taken" | "skipped" | "acknowledged";
  scheduledAt: string;
  actedAt: string | null;
  actedBy: string | null;
  createdAt: string;
}

type DoseStatus = Dose["status"];
type ToastKind = "success" | "info" | "warning";

interface AddForm {
  name: string;
  dosage: string;
  time: string;
  memberId: string;
  caregiverId: string; // member id, or "none"
  instructions: string;
}

const PRIMARY_BTN = "brand-gradient text-white border-0";

function emptyForm(): AddForm {
  return { name: "", dosage: "1 tablet", time: "", memberId: "", caregiverId: "none", instructions: "" };
}

/** Chip for a dose status — every state is a real, recorded state. */
function StatusChip({ status }: { status: DoseStatus }) {
  if (status === "taken")
    return (
      <Chip tone="success">
        <Check className="h-3 w-3" /> Taken
      </Chip>
    );
  if (status === "skipped") return <Chip tone="warning">Skipped</Chip>;
  if (status === "acknowledged") return <Chip tone="brand">Acknowledged</Chip>;
  return (
    <Chip>
      <CalendarClock className="h-3 w-3" /> Scheduled
    </Chip>
  );
}

/** Shown where mutation controls would be, for read-only roles. */
function ViewOnlyChip() {
  return (
    <Chip tone="default">
      <Eye className="h-3 w-3" /> View-only for your role
    </Chip>
  );
}

/** Assigned caregiver for this dose, if any (plain assignment — no automation theater). */
function caregiverFor(dose: Dose, byId: Map<string, Member>): Member | null {
  return dose.caregiverId ? (byId.get(dose.caregiverId) ?? null) : null;
}

/** Dose action buttons — every button sends a real PATCH { id, status }. */
function DoseActions({
  dose,
  busy,
  onAct,
}: {
  dose: Dose;
  busy: boolean;
  onAct: (status: DoseStatus, message: string, kind?: ToastKind) => void;
}) {
  if (dose.status !== "scheduled") {
    return (
      <Button
        variant="ghost"
        className="h-11 px-4 text-sm"
        disabled={busy}
        onClick={() => onAct("scheduled", `${dose.name} at ${dose.timeLabel} set back to scheduled`, "info")}
      >
        <RotateCcw className="h-4 w-4" /> Undo
      </Button>
    );
  }
  return (
    <>
      <Button
        className={`h-11 px-5 text-sm ${PRIMARY_BTN}`}
        disabled={busy}
        onClick={() => onAct("taken", `${dose.name} at ${dose.timeLabel} marked taken`)}
      >
        {busy ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
        ) : (
          <Check className="h-4 w-4" />
        )}
        Mark taken
      </Button>
      <Button
        variant="ghost"
        className="h-11 px-4 text-sm"
        disabled={busy}
        onClick={() => onAct("skipped", `${dose.name} at ${dose.timeLabel} marked skipped`, "info")}
      >
        <SkipForward className="h-4 w-4" /> Skipped
      </Button>
      <Button
        variant="outline"
        className="h-11 px-4 text-sm"
        disabled={busy}
        onClick={() => onAct("acknowledged", `${dose.name} at ${dose.timeLabel} acknowledged`, "info")}
      >
        <CheckCheck className="h-4 w-4" /> Acknowledge
      </Button>
    </>
  );
}

/** Who confirmed this dose and when — straight from the server record. */
function ActedByLine({ dose }: { dose: Dose }) {
  if (!dose.actedBy || !dose.actedAt || dose.status === "scheduled") return null;
  return (
    <p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-foreground/70">
      <CheckCheck className="h-3 w-3 shrink-0" />
      Confirmed by {dose.actedBy} • {fmtTime(dose.actedAt)}
    </p>
  );
}

function DoseCard({
  dose,
  member,
  caregiver,
  busy,
  writable,
  onAct,
  onDelete,
}: {
  dose: Dose;
  member: Member | null;
  caregiver: Member | null;
  busy: boolean;
  writable: boolean;
  onAct: (status: DoseStatus, message: string, kind?: ToastKind) => void;
  onDelete: () => void;
}) {
  return (
    <GlassCard className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <MemberAvatar
            name={member?.name ?? "Unknown"}
            color={member?.color ?? "#71717a"}
            role={member?.role}
            size={44}
            title={member?.name ?? undefined}
            className="shrink-0"
          />
          <div className="min-w-0">
            <p className="text-lg font-bold leading-none tabular-nums">{dose.timeLabel}</p>
            <p className="mt-1 truncate text-sm font-semibold">
              {dose.name} <span className="font-normal text-muted-foreground">· {dose.dosage}</span>
            </p>
            {dose.instructions ? (
              <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                <Lightbulb className="h-3 w-3 shrink-0" /> {dose.instructions}
              </p>
            ) : null}
            {caregiver ? (
              <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                <HeartHandshake className="h-3 w-3 shrink-0" /> Caregiver: {caregiver.name}
              </p>
            ) : null}
            <ActedByLine dose={dose} />
          </div>
        </div>
        <div className="flex shrink-0 items-start gap-1 pt-0.5">
          {writable ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 text-muted-foreground hover:text-red-600 dark:hover:text-red-400"
                  disabled={busy}
                  aria-label={`Delete ${dose.name} at ${dose.timeLabel}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this dose?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {dose.name} at {dose.timeLabel}
                    {member ? ` for ${member.name}` : ""} will be removed for the whole household. This
                    cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500/40"
                    onClick={onDelete}
                  >
                    Delete dose
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}
          <StatusChip status={dose.status} />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {writable ? (
          <DoseActions dose={dose} busy={busy} onAct={onAct} />
        ) : (
          <ViewOnlyChip />
        )}
      </div>
    </GlassCard>
  );
}

export function CareView() {
  const medsRes = useResource<Dose[]>("/api/medicines");
  const membersRes = useResource<Member[]>("/api/members");
  const quickAdd = useAppStore((s) => s.quickAdd);
  const consumeQuickAdd = useAppStore((s) => s.consumeQuickAdd);
  const user = useSession((s) => s.user);
  const writable = canWrite(user?.role);

  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [form, setForm] = useState<AddForm>(emptyForm);

  const openAdd = useCallback(() => {
    setForm(emptyForm());
    setAddOpen(true);
  }, []);

  useEffect(() => {
    if (quickAdd === "medicine") {
      consumeQuickAdd();
      if (writable) openAdd();
    }
  }, [quickAdd, consumeQuickAdd, openAdd, writable]);

  const members = useMemo(() => membersRes.data ?? [], [membersRes.data]);
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  // The server already scopes GET /api/medicines to today — render it as returned.
  const todayDoses = useMemo(
    () => [...(medsRes.data ?? [])].sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()),
    [medsRes.data]
  );

  // Group by member, keeping the family roster order; unknown members last.
  const groups = useMemo(() => {
    const remaining = new Map<string, Dose[]>();
    for (const dose of todayDoses) {
      const list = remaining.get(dose.memberId);
      if (list) list.push(dose);
      else remaining.set(dose.memberId, [dose]);
    }
    const ordered: { member: Member | null; doses: Dose[] }[] = [];
    for (const member of members) {
      const doses = remaining.get(member.id);
      if (doses) {
        ordered.push({ member, doses });
        remaining.delete(member.id);
      }
    }
    for (const [id, doses] of remaining) {
      ordered.push({ member: memberById.get(id) ?? null, doses });
    }
    return ordered;
  }, [todayDoses, members, memberById]);

  async function act(dose: Dose, status: DoseStatus, message: string, kind: ToastKind = "success") {
    if (busyId) return;
    try {
      setBusyId(dose.id);
      await apiSend("/api/medicines", "PATCH", { id: dose.id, status });
      if (kind === "success") toast.success(message);
      else if (kind === "warning") toast.warning(message);
      else toast.info(message);
      await medsRes.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusyId(null);
    }
  }

  async function removeDose(dose: Dose) {
    if (busyId) return;
    try {
      setBusyId(dose.id);
      await apiSend("/api/medicines", "DELETE", { id: dose.id });
      toast.info(`${dose.name} at ${dose.timeLabel} deleted`);
      await medsRes.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete the dose");
    } finally {
      setBusyId(null);
    }
  }

  const canSubmit =
    form.name.trim().length > 0 && form.time.length > 0 && form.memberId.length > 0 && !saving;

  async function submitMedicine() {
    const [hh, mm] = form.time.split(":").map(Number);
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return;
    const scheduledAt = new Date();
    scheduledAt.setHours(hh, mm, 0, 0);
    const timeLabel = scheduledAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
    try {
      setSaving(true);
      await apiSend("/api/medicines", "POST", {
        name: form.name.trim(),
        dosage: form.dosage.trim() || "1 tablet",
        timeLabel,
        scheduledAt: scheduledAt.toISOString(),
        memberId: form.memberId,
        ...(form.caregiverId !== "none" ? { caregiverId: form.caregiverId } : {}),
        ...(form.instructions.trim() ? { instructions: form.instructions.trim() } : {}),
      });
      toast.success(
        `Reminder set — ${form.name.trim()} for ${memberById.get(form.memberId)?.name ?? "member"} at ${timeLabel}`
      );
      setAddOpen(false);
      await medsRes.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add medicine");
    } finally {
      setSaving(false);
    }
  }

  const loading = medsRes.loading || membersRes.loading;
  const error = medsRes.error ?? membersRes.error;

  if (loading) return <PageLoader label="Loading care & medicine…" />;

  if (error) {
    return (
      <div className="space-y-4">
        <ViewTitle title="Care & Medicine" sub="Dose reminders for your household" />
        <EmptyState icon={<Pill className="h-10 w-10" />} title="Couldn’t load care data" sub={error} />
        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={() => {
              void medsRes.refresh();
              void membersRes.refresh();
            }}
          >
            Try again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ViewTitle
        title="Care & Medicine"
        sub={`Today · ${fmtDate(new Date().toISOString())} · ${todayDoses.length} dose${todayDoses.length === 1 ? "" : "s"}`}
        right={
          writable ? (
            <Button className={`h-10 px-4 text-sm ${PRIMARY_BTN}`} onClick={openAdd}>
              <Plus className="h-4 w-4" /> Add Medicine
            </Button>
          ) : (
            <ViewOnlyChip />
          )
        }
      />

      {/* How confirmations work — honest, no automation claims */}
      <GlassCard className="p-3 sm:p-4">
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-3">
          <TriangleAlert
            aria-hidden
            className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-300"
          />
          <p className="text-xs font-medium leading-snug text-amber-700 dark:text-amber-300 sm:text-sm">
            Marking a dose taken, skipped or acknowledged records who confirmed it and when — check the
            “Confirmed by” line under each medicine. Acknowledged is not the same as taken.
          </p>
        </div>
      </GlassCard>

      {/* Doses grouped by member */}
      {groups.length === 0 ? (
        <EmptyState
          icon={<Pill className="h-10 w-10" />}
          title="No medicines scheduled today"
          sub="Use “+ Add Medicine” to plan a dose for a family member."
        />
      ) : (
        groups.map(({ member, doses }) => (
          <section key={member?.id ?? `unknown-${doses[0]?.id ?? "0"}`} className="space-y-2.5">
            <div className="flex items-center gap-2.5 px-1">
              <MemberAvatar
                name={member?.name ?? "Unknown"}
                color={member?.color ?? "#71717a"}
                role={member?.role}
                size={36}
                title={member?.name}
              />
              <div className="min-w-0">
                <h3 className="text-sm font-bold leading-tight">{member?.name ?? "Former member"}</h3>
                <p className="text-[11px] text-muted-foreground leading-tight">
                  {member ? member.relation : "no longer in the family"} · {doses.length} dose
                  {doses.length === 1 ? "" : "s"} today
                </p>
              </div>
            </div>
            {doses.map((dose) => (
              <DoseCard
                key={dose.id}
                dose={dose}
                member={member}
                caregiver={caregiverFor(dose, memberById)}
                busy={busyId === dose.id}
                writable={writable}
                onAct={(status, message, kind) => void act(dose, status, message, kind)}
                onDelete={() => void removeDose(dose)}
              />
            ))}
          </section>
        ))
      )}

      {/* Household note */}
      <GlassCard className="p-4">
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="glass-inset flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-foreground/70"
          >
            <UserRound className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">Everyone sees the same list</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              Doses shown here are scheduled for today across your household. Any member with write access can
              confirm a dose, and their name is recorded with it.
            </p>
          </div>
        </div>
      </GlassCard>

      {/* Add Medicine dialog */}
      <Dialog
        open={addOpen}
        onOpenChange={(o) => {
          if (o) setForm(emptyForm());
          setAddOpen(o);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pill className="h-4 w-4 text-primary" /> Add medicine reminder
            </DialogTitle>
            <DialogDescription>
              Schedule a dose for a family member. It appears for the whole household today and can be
              confirmed with a name attached.
            </DialogDescription>
          </DialogHeader>
          <div className="grid max-h-[60vh] gap-3.5 overflow-y-auto py-1 pr-1 scrollbar-slim">
            <div className="grid gap-1.5">
              <Label htmlFor="med-name">Medicine name *</Label>
              <Input
                id="med-name"
                placeholder="e.g. Metformin"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="med-dosage">Dosage</Label>
                <Input
                  id="med-dosage"
                  placeholder="1 tablet"
                  value={form.dosage}
                  onChange={(e) => setForm({ ...form, dosage: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="med-time">Time *</Label>
                <Input
                  id="med-time"
                  type="time"
                  value={form.time}
                  onChange={(e) => setForm({ ...form, time: e.target.value })}
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>Member *</Label>
                <Select value={form.memberId} onValueChange={(v) => setForm({ ...form, memberId: v })}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Who takes it?" />
                  </SelectTrigger>
                  <SelectContent>
                    {members.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Caregiver (optional)</Label>
                <Select value={form.caregiverId} onValueChange={(v) => setForm({ ...form, caregiverId: v })}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Who to list as caregiver?" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No caregiver</SelectItem>
                    {members.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="med-instructions">Instructions (optional)</Label>
              <Input
                id="med-instructions"
                placeholder="e.g. After breakfast"
                value={form.instructions}
                onChange={(e) => setForm({ ...form, instructions: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button className={PRIMARY_BTN} disabled={!canSubmit} onClick={() => void submitMedicine()}>
              <Plus className="h-4 w-4" /> Add reminder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
