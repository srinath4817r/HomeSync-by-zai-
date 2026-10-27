"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Banknote,
  CalendarClock,
  CircleCheckBig,
  Droplets,
  Flame,
  MoreVertical,
  Package,
  Plus,
  ReceiptText,
  Repeat,
  ShoppingBasket,
  Trash2,
  Wallet,
  Wifi,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { apiSend, fmtDate, fmtMoney, useResource } from "@/lib/homesync/api";
import { canWrite } from "@/lib/homesync/roles";
import { useSession } from "@/lib/homesync/session";
import { useAppStore } from "@/lib/homesync/store";
import type { Bill, Member } from "@/lib/homesync/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  StatTile,
  ViewTitle,
} from "@/components/homesync/glass";

const CATEGORIES = ["Electricity", "Internet", "Water", "Gas", "Household", "Other"] as const;
const RECURRENCE = [
  { value: "none", label: "One-time" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
];

interface AddForm {
  title: string;
  amount: string;
  dueDate: string; // "YYYY-MM-DD" from <input type="date">
  category: string;
  payerId: string; // member id, or "none"
  recurring: string; // RECURRENCE value, "none" = one-time
}

const PRIMARY_BTN = "brand-gradient text-white border-0";

function emptyForm(): AddForm {
  return { title: "", amount: "", dueDate: "", category: "Electricity", payerId: "none", recurring: "none" };
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Category → Lucide icon (emoji-free, monochrome — the label carries the meaning). */
const BILL_CATEGORY_ICON: Record<string, LucideIcon> = {
  Electricity: Zap,
  Internet: Wifi,
  Water: Droplets,
  Gas: Flame,
  Household: ShoppingBasket,
};

/** Due-date chip: red overdue → amber upcoming → green paid. */
function DueChip({ bill }: { bill: Bill }) {
  if (bill.status === "paid") return <Chip tone="success">Paid {fmtDate(bill.paidAt)}</Chip>;
  const overdue = new Date(bill.dueDate).getTime() < startOfToday().getTime();
  if (overdue) return <Chip tone="danger">Overdue</Chip>;
  return <Chip tone="warning">Due {fmtDate(bill.dueDate)}</Chip>;
}

function BillRow({
  bill,
  payer,
  busy,
  writable,
  onMarkPaid,
  onMarkUnpaid,
  onDelete,
}: {
  bill: Bill;
  payer: Member | null;
  busy: boolean;
  writable: boolean;
  onMarkPaid: (bill: Bill) => void;
  onMarkUnpaid: (bill: Bill) => void;
  onDelete: (bill: Bill) => void;
}) {
  const Icon = BILL_CATEGORY_ICON[bill.category] ?? Package;
  return (
    <GlassCard className="p-3.5 sm:p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span
          aria-hidden
          className="glass-inset flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-foreground/70"
        >
          <Icon className="h-5 w-5" />
        </span>

        <div className="min-w-0 flex-1 basis-48">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="max-w-full truncate text-sm font-semibold">{bill.title}</p>
            <Chip>{bill.category}</Chip>
            {bill.recurring ? (
              <Chip tone="brand">
                <Repeat className="h-3 w-3" /> {bill.recurring.toLowerCase()}
              </Chip>
            ) : null}
            <DueChip bill={bill} />
          </div>
          <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
            {payer ? (
              <MemberAvatar
                name={payer.name}
                color={payer.color}
                role={payer.role}
                size={22}
                title={`Payer: ${payer.name}`}
                className="shrink-0"
              />
            ) : (
              <span
                title="No payer assigned"
                className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-muted text-[10px]"
              >
                ?
              </span>
            )}
            <span className="truncate">
              {payer ? payer.name : "Unassigned payer"}
              {bill.status === "paid" && bill.paidAt ? ` · paid ${fmtDate(bill.paidAt)}` : ""}
            </span>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <p className="text-base font-bold tabular-nums">{fmtMoney(bill.amount, bill.currency)}</p>
          {bill.status === "paid" ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-10"
              disabled={busy || !writable}
              onClick={() => onMarkUnpaid(bill)}
            >
              Mark unpaid
            </Button>
          ) : (
            <Button
              size="sm"
              className={`h-10 px-4 text-xs ${PRIMARY_BTN}`}
              disabled={busy || !writable}
              onClick={() => onMarkPaid(bill)}
            >
              Mark paid
            </Button>
          )}
          {writable ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9" aria-label={`Actions for ${bill.title}`}>
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  className="text-red-600 focus:text-red-600 dark:text-red-400 dark:focus:text-red-300"
                  onClick={() => onDelete(bill)}
                >
                  <Trash2 className="h-4 w-4" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>
    </GlassCard>
  );
}

export function BillsView() {
  const billsRes = useResource<Bill[]>("/api/bills");
  const membersRes = useResource<Member[]>("/api/members");
  const user = useSession((s) => s.user);
  const writable = canWrite(user?.role);
  const quickAdd = useAppStore((s) => s.quickAdd);
  const consumeQuickAdd = useAppStore((s) => s.consumeQuickAdd);

  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [form, setForm] = useState<AddForm>(emptyForm);

  useEffect(() => {
    if (quickAdd === "bill" && writable) {
      setForm(emptyForm());
      setAddOpen(true);
      consumeQuickAdd();
    }
  }, [quickAdd, consumeQuickAdd, writable]);

  const bills = useMemo(() => billsRes.data ?? [], [billsRes.data]);
  const members = useMemo(() => membersRes.data ?? [], [membersRes.data]);
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  const summary = useMemo(() => {
    const due = bills.filter((b) => b.status === "due");
    const weekAhead = Date.now() + 7 * 24 * 60 * 60 * 1000;
    const monthStart = startOfToday();
    monthStart.setDate(1);
    return {
      due,
      dueThisWeek: due.filter((b) => new Date(b.dueDate).getTime() <= weekAhead).reduce((s, b) => s + b.amount, 0),
      totalDue: due.reduce((s, b) => s + b.amount, 0),
      paidThisMonth: bills
        .filter((b) => b.status === "paid" && b.paidAt && new Date(b.paidAt).getTime() >= monthStart.getTime())
        .reduce((s, b) => s + b.amount, 0),
    };
  }, [bills]);

  // Share of the total due, per category, biggest first.
  const categories = useMemo(() => {
    const map = new Map<string, number>();
    for (const bill of summary.due) map.set(bill.category, (map.get(bill.category) ?? 0) + bill.amount);
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [summary]);

  async function patchBill(bill: Bill, body: Record<string, unknown>) {
    if (busyId) return;
    try {
      setBusyId(bill.id);
      await apiSend("/api/bills", "PATCH", { id: bill.id, ...body });
      await billsRes.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function markPaid(bill: Bill) {
    if (busyId) return;
    try {
      await patchBill(bill, { status: "paid" });
      toast.success(`${bill.title} marked paid`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update bill");
    }
  }

  async function markUnpaid(bill: Bill) {
    if (busyId) return;
    try {
      await patchBill(bill, { status: "due" });
      toast.info(`${bill.title} marked unpaid — reminder re-enabled`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update bill");
    }
  }

  async function deleteBill(bill: Bill) {
    if (busyId) return;
    try {
      setBusyId(bill.id);
      await apiSend("/api/bills", "DELETE", { id: bill.id });
      toast.success(`${bill.title} deleted`);
      await billsRes.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete bill");
    } finally {
      setBusyId(null);
    }
  }

  const amountNum = Number.parseFloat(form.amount);
  const canSubmit =
    form.title.trim().length > 0 && Number.isFinite(amountNum) && amountNum > 0 && form.dueDate.length > 0 && !saving;

  async function submitBill() {
    const [y, mo, d] = form.dueDate.split("-").map(Number);
    if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return;
    const dueDate = new Date(y, mo - 1, d, 9, 0, 0, 0); // due at 9:00 AM local
    try {
      setSaving(true);
      await apiSend("/api/bills", "POST", {
        title: form.title.trim(),
        amount: amountNum,
        dueDate: dueDate.toISOString(),
        category: form.category,
        ...(form.payerId !== "none" ? { payerId: form.payerId } : {}),
        ...(form.recurring !== "none" ? { recurring: form.recurring } : {}),
        currency: "INR",
      });
      toast.success(`Reminder added — ${form.title.trim()} due ${fmtDate(dueDate.toISOString())}`);
      setAddOpen(false);
      await billsRes.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add bill");
    } finally {
      setSaving(false);
    }
  }

  const loading = billsRes.loading || membersRes.loading;
  const error = billsRes.error ?? membersRes.error;

  if (loading) return <PageLoader label="Loading bills…" />;

  if (error) {
    return (
      <div className="space-y-4">
        <ViewTitle title="Bills & Expenses" sub="Household bills and payment tracking" />
        <EmptyState icon={<ReceiptText className="h-10 w-10" />} title="Couldn’t load bills" sub={error} />
        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={() => {
              void billsRes.refresh();
              void membersRes.refresh();
            }}
          >
            Try again
          </Button>
        </div>
      </div>
    );
  }

  const monthLabel = new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <div className="space-y-4">
      <ViewTitle
        title="Bills & Expenses"
        sub="Household bills and payment tracking"
        right={
          writable ? (
            <Button
              className={`h-10 px-4 text-sm ${PRIMARY_BTN}`}
              onClick={() => {
                setForm(emptyForm());
                setAddOpen(true);
              }}
            >
              <Plus className="h-4 w-4" /> Add Bill
            </Button>
          ) : (
            <Chip tone="brand">View-only for your role</Chip>
          )
        }
      />

      {/* Summary */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile icon={<CalendarClock className="h-4 w-4" />} label="Due this week" value={fmtMoney(summary.dueThisWeek)} sub="Next 7 days" />
        <StatTile
          icon={<Wallet className="h-4 w-4" />}
          label="Total due"
          value={fmtMoney(summary.totalDue)}
          sub={`${summary.due.length} unpaid bill${summary.due.length === 1 ? "" : "s"}`}
        />
        <StatTile icon={<CircleCheckBig className="h-4 w-4" />} label="Paid this month" value={fmtMoney(summary.paidThisMonth)} sub={monthLabel} />
      </div>

      {/* Category breakdown */}
      <GlassCard className="p-4 sm:p-5">
        <SectionHeader icon={<Banknote className="h-4 w-4" />} title="Where the money goes" sub="Share of total due by category" />
        <div className="mt-4 space-y-3">
          {categories.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing due right now — all clear!</p>
          ) : (
            categories.map(([category, amount]) => {
              const pct = summary.totalDue > 0 ? Math.round((amount / summary.totalDue) * 100) : 0;
              const Icon = BILL_CATEGORY_ICON[category] ?? Package;
              return (
                <div key={category}>
                  <div className="flex items-center justify-between gap-2 text-xs font-medium">
                    <span className="flex items-center gap-1.5">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" /> {category}
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      {fmtMoney(amount)} · {pct}%
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div className="brand-gradient h-full rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </GlassCard>

      {/* Bills list */}
      <section className="space-y-2.5">
        <SectionHeader
          icon={<ReceiptText className="h-4 w-4" />}
          title="All bills"
          sub={`${bills.length} tracked · ${summary.due.length} unpaid`}
        />
        <div className="scrollbar-slim max-h-96 space-y-2.5 overflow-y-auto pr-1">
          {bills.length === 0 ? (
            <EmptyState
              title="No bills tracked yet"
              sub="Add your first bill reminder so nothing gets paid late."
            />
          ) : (
            bills.map((bill) => {
              const payerId = bill.payerId;
              return (
                <BillRow
                  key={bill.id}
                  bill={bill}
                  payer={payerId ? (memberById.get(payerId) ?? null) : null}
                  busy={busyId === bill.id}
                  writable={writable}
                  onMarkPaid={(b) => void markPaid(b)}
                  onMarkUnpaid={(b) => void markUnpaid(b)}
                  onDelete={(b) => void deleteBill(b)}
                />
              );
            })
          )}
        </div>
      </section>

      {/* Add Bill dialog */}
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
              <ReceiptText className="h-4 w-4" /> Add bill reminder
            </DialogTitle>
            <DialogDescription>Track an upcoming bill so it never gets paid late.</DialogDescription>
          </DialogHeader>
          <div className="grid max-h-[60vh] gap-3.5 overflow-y-auto py-1 pr-1 scrollbar-slim">
            <div className="grid gap-1.5">
              <Label htmlFor="bill-title">Title *</Label>
              <Input
                id="bill-title"
                placeholder="e.g. Electricity – TNEB"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="bill-amount">Amount (₹) *</Label>
                <Input
                  id="bill-amount"
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  placeholder="1840"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="bill-due">Due date *</Label>
                <Input
                  id="bill-due"
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => {
                      const Icon = BILL_CATEGORY_ICON[c] ?? Package;
                      return (
                        <SelectItem key={c} value={c}>
                          <span className="flex items-center gap-1.5">
                            <Icon className="h-3.5 w-3.5 text-muted-foreground" /> {c}
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Payer</Label>
                <Select value={form.payerId} onValueChange={(v) => setForm({ ...form, payerId: v })}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Who pays it?" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
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
              <Label>Repeats</Label>
              <Select value={form.recurring} onValueChange={(v) => setForm({ ...form, recurring: v })}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RECURRENCE.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button className={PRIMARY_BTN} disabled={!canSubmit} onClick={() => void submitBill()}>
              <Plus className="h-4 w-4" /> Add bill
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
