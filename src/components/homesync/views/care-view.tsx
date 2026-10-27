"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BellOff,
  BellRing,
  Check,
  CheckCheck,
  Eye,
  HeartHandshake,
  Lightbulb,
  Pill,
  Plus,
  RotateCcw,
  Siren,
  SkipForward,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";

import { apiSend, fmtDate, useResource } from "@/lib/homesync/api";
import { canWrite } from "@/lib/homesync/roles";
import { useSession } from "@/lib/homesync/session";
import { useAppStore } from "@/lib/homesync/store";
import type { Medicine, Member } from "@/lib/homesync/types";
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

type MedicineAction = "take" | "skip" | "miss" | "escalate" | "acknowledge" | "reset";
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

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Chip for a dose status — "acknowledged" deliberately never reads as "taken". */
function StatusChip({ status }: { status: string }) {
  if (status === "taken")
    return (
      <Chip tone="success">
        <Check className="h-3 w-3" /> Confirmed taken
      </Chip>
    );
  if (status === "skipped") return <Chip>Skipped</Chip>;
  if (status === "confirmation_pending") return <Chip tone="warning">Confirmation pending</Chip>;
  if (status === "escalated") return <Chip tone="danger">Escalated to caregiver</Chip>;
  if (status === "acknowledged") return <Chip tone="brand">Caregiver acknowledged</Chip>;
  return <Chip>Scheduled</Chip>;
}

/** Shown where mutation controls would be, for read-only roles. */
function ViewOnlyChip() {
  return (
    <Chip tone="default">
      <Eye className="h-3 w-3" /> View-only for your role
    </Chip>
  );
}

/** Caregiver to display for this dose (escalation target wins over assigned caregiver). */
function caregiverFor(med: Medicine, byId: Map<string, Member>): Member | null {
  const id = med.escalatedToId ?? med.caregiverId;
  return id ? (byId.get(id) ?? null) : null;
}

/** Large touch-target action buttons, driven by the dose status state machine. */
function DoseActions({
  med,
  busy,
  onAct,
}: {
  med: Medicine;
  busy: boolean;
  onAct: (action: MedicineAction, message: string, kind?: ToastKind) => void;
}) {
  const takeMsg = `${med.name} at ${med.timeLabel} confirmed taken`;
  if (med.status === "scheduled") {
    return (
      <>
        <Button
          className={`h-11 px-5 text-sm ${PRIMARY_BTN}`}
          disabled={busy}
          onClick={() => onAct("take", takeMsg)}
        >
          <Check className="h-4 w-4" /> Take
        </Button>
        <Button
          variant="ghost"
          className="h-11 px-4 text-sm"
          disabled={busy}
          onClick={() => onAct("miss", `No response detected — ${med.name} (${med.timeLabel}) is now confirmation pending`, "warning")}
        >
          <BellOff className="h-4 w-4" /> Missed
        </Button>
        <Button
          variant="ghost"
          className="h-11 px-4 text-sm"
          disabled={busy}
          onClick={() => onAct("skip", `${med.name} at ${med.timeLabel} skipped`, "info")}
        >
          <SkipForward className="h-4 w-4" /> Skip
        </Button>
      </>
    );
  }
  if (med.status === "confirmation_pending") {
    return (
      <>
        <Button className={`h-11 px-5 text-sm ${PRIMARY_BTN}`} disabled={busy} onClick={() => onAct("take", takeMsg)}>
          <CheckCheck className="h-4 w-4" /> Confirm taken
        </Button>
        <Button
          variant="outline"
          className="h-11 border-red-500/40 px-4 text-sm text-red-600 hover:bg-red-500/10 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
          disabled={busy}
          onClick={() => onAct("escalate", `Caregiver alerted about ${med.name} (${med.timeLabel})`, "warning")}
        >
          <BellRing className="h-4 w-4" /> Escalate to caregiver
        </Button>
        <Button
          variant="ghost"
          className="h-11 px-4 text-sm"
          disabled={busy}
          onClick={() => onAct("reset", `${med.name} reset to scheduled`, "info")}
        >
          <RotateCcw className="h-4 w-4" /> Reset
        </Button>
      </>
    );
  }
  if (med.status === "escalated") {
    return (
      <>
        <Button
          variant="secondary"
          className="h-11 px-4 text-sm"
          disabled={busy}
          onClick={() => onAct("acknowledge", `Caregiver acknowledged ${med.name} — dose still needs confirmation`, "info")}
        >
          Acknowledge
        </Button>
        <Button className={`h-11 px-5 text-sm ${PRIMARY_BTN}`} disabled={busy} onClick={() => onAct("take", takeMsg)}>
          <CheckCheck className="h-4 w-4" /> Confirm taken
        </Button>
      </>
    );
  }
  if (med.status === "acknowledged") {
    return (
      <Button className={`h-11 px-5 text-sm ${PRIMARY_BTN}`} disabled={busy} onClick={() => onAct("take", takeMsg)}>
        <CheckCheck className="h-4 w-4" /> Confirm taken
      </Button>
    );
  }
  // taken | skipped
  return (
    <Button
      variant="ghost"
      className="h-11 px-4 text-sm"
      disabled={busy}
      onClick={() => onAct("reset", `${med.name} reset to scheduled`, "info")}
    >
      <RotateCcw className="h-4 w-4" /> Reset
    </Button>
  );
}

function MedicineCard({
  med,
  member,
  caregiver,
  busy,
  writable,
  onAct,
}: {
  med: Medicine;
  member: Member | null;
  caregiver: Member | null;
  busy: boolean;
  writable: boolean;
  onAct: (action: MedicineAction, message: string, kind?: ToastKind) => void;
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
            <p className="text-lg font-bold leading-none tabular-nums">{med.timeLabel}</p>
            <p className="mt-1 truncate text-sm font-semibold">
              {med.name} <span className="font-normal text-muted-foreground">· {med.dosage}</span>
            </p>
            {med.instructions ? (
              <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                <Lightbulb className="h-3 w-3 shrink-0" /> {med.instructions}
              </p>
            ) : null}
            {med.status === "escalated" && caregiver ? (
              <p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400">
                <BellRing className="h-3 w-3 shrink-0" /> Alert sent to {caregiver.name}
              </p>
            ) : null}
            {med.status === "escalated" && !caregiver ? (
              <p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400">
                <BellRing className="h-3 w-3 shrink-0" /> Escalated — no caregiver assigned for this dose
              </p>
            ) : null}
            {med.status === "acknowledged" && caregiver ? (
              <p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-primary">
                <HeartHandshake className="h-3 w-3 shrink-0" /> {caregiver.name} is aware — dose still needs
                confirmation
              </p>
            ) : null}
          </div>
        </div>
        <div className="shrink-0 pt-0.5">
          <StatusChip status={med.status} />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {writable ? (
          <DoseActions med={med} busy={busy} onAct={onAct} />
        ) : (
          <ViewOnlyChip />
        )}
      </div>
    </GlassCard>
  );
}

export function CareView() {
  const medsRes = useResource<Medicine[]>("/api/medicines");
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

  // Today's doses (client-local day), soonest first.
  const todayMeds = useMemo(() => {
    const start = startOfToday().getTime();
    const end = new Date(startOfToday());
    end.setDate(end.getDate() + 1);
    return (medsRes.data ?? [])
      .filter((m) => {
        const t = new Date(m.scheduledAt).getTime();
        return t >= start && t < end.getTime();
      })
      .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
  }, [medsRes.data]);

  // Group by member, keeping the family roster order; unknown members last.
  const groups = useMemo(() => {
    const remaining = new Map<string, Medicine[]>();
    for (const med of todayMeds) {
      const list = remaining.get(med.memberId);
      if (list) list.push(med);
      else remaining.set(med.memberId, [med]);
    }
    const ordered: { member: Member | null; meds: Medicine[] }[] = [];
    for (const member of members) {
      const meds = remaining.get(member.id);
      if (meds) {
        ordered.push({ member, meds });
        remaining.delete(member.id);
      }
    }
    for (const [id, meds] of remaining) {
      ordered.push({ member: memberById.get(id) ?? null, meds });
    }
    return ordered;
  }, [todayMeds, members, memberById]);

  async function act(med: Medicine, action: MedicineAction, message: string, kind: ToastKind = "success") {
    if (busyId) return;
    try {
      setBusyId(med.id);
      await apiSend("/api/medicines", "PATCH", { id: med.id, action });
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
        <ViewTitle title="Care & Medicine" sub="Dose reminders and caregiver escalation" />
        <EmptyState icon={<Siren className="h-10 w-10" />} title="Couldn’t load care data" sub={error} />
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
        sub={`Today · ${fmtDate(new Date().toISOString())} · ${todayMeds.length} dose${todayMeds.length === 1 ? "" : "s"}`}
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

      {/* Honest-status banner */}
      <GlassCard className="p-3 sm:p-4">
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-3">
          <TriangleAlert
            aria-hidden
            className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-300"
          />
          <p className="text-xs font-medium leading-snug text-amber-700 dark:text-amber-300 sm:text-sm">
            Confirmation pending is not the same as medicine missed. Caregiver acknowledgment never marks medicine as
            taken.
          </p>
        </div>
      </GlassCard>

      {/* Doses grouped by member */}
      {groups.length === 0 ? (
        <EmptyState
          icon={<Pill className="h-10 w-10" />}
          title="No doses scheduled for today"
          sub="Use “+ Add Medicine” to set a reminder for a family member."
        />
      ) : (
        groups.map(({ member, meds }) => (
          <section key={member?.id ?? `unknown-${meds[0]?.id ?? "0"}`} className="space-y-2.5">
            <div className="flex items-center gap-2.5 px-1">
              <MemberAvatar
                name={member?.name ?? "Unknown"}
                color={member?.color ?? "#71717a"}
                role={member?.role}
                size={36}
                title={member?.name}
              />
              <div className="min-w-0">
                <h3 className="text-sm font-bold leading-tight">{member?.name ?? "Unknown member"}</h3>
                <p className="text-[11px] text-muted-foreground leading-tight">
                  {member ? member.relation : "no longer in the family"} · {meds.length} dose
                  {meds.length === 1 ? "" : "s"} today
                </p>
              </div>
            </div>
            {meds.map((med) => (
              <MedicineCard
                key={med.id}
                med={med}
                member={member}
                caregiver={caregiverFor(med, memberById)}
                busy={busyId === med.id}
                writable={writable}
                onAct={(action, message, kind) => void act(med, action, message, kind)}
              />
            ))}
          </section>
        ))
      )}

      {/* Escalation explainer */}
      <GlassCard className="p-4">
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="glass-inset flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-amber-600 dark:text-amber-400"
          >
            <BellRing className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">Escalation automation</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              Reminder → repeat at +30s → notify caregiver → escalate to next caregiver. Stops when handled.
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
              Set a dose for a family member. If no confirmation arrives, automation escalates to the caregiver.
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
                    <SelectValue placeholder="Who gets alerted?" />
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
