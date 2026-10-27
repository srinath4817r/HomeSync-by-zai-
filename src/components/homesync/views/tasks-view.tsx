"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { addDays, format, isSameDay } from "date-fns";
import {
  CalendarDays,
  Clock,
  Eye,
  ListChecks,
  MoreHorizontal,
  Play,
  Plus,
  RotateCcw,
  Trash2,
  TriangleAlert,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";

import { apiSend, useResource } from "@/lib/homesync/api";
import { canWrite } from "@/lib/homesync/roles";
import { useSession } from "@/lib/homesync/session";
import { useAppStore } from "@/lib/homesync/store";
import type { Member, Task } from "@/lib/homesync/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  DropdownMenuSeparator,
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
  PriorityDot,
  ViewTitle,
} from "@/components/homesync/glass";

type StatusFilter = "all" | "pending" | "in_progress" | "done";

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "in_progress", label: "In progress" },
  { key: "done", label: "Done" },
];

const PRIORITIES = ["low", "medium", "high"] as const;
const RECURRING = [
  { value: "none", label: "None" },
  { value: "daily", label: "Daily" },
  { value: "weekdays", label: "Weekdays" },
  { value: "weekly", label: "Weekly" },
];

/** Chip text/tone for a task's due date. */
function dueInfo(task: Task): { text: string; tone: "default" | "warning" | "danger" } | null {
  if (!task.dueAt) return null;
  const due = new Date(task.dueAt);
  const now = new Date();
  const time = format(due, "h:mm a");
  if (task.status !== "done" && due.getTime() < now.getTime()) {
    return { text: "Overdue", tone: "danger" };
  }
  if (isSameDay(due, now)) return { text: `Today ${time}`, tone: "warning" };
  if (isSameDay(due, addDays(now, 1))) return { text: `Tomorrow ${time}`, tone: "default" };
  return { text: format(due, "EEE, d MMM"), tone: "default" };
}

/** Shown where mutation controls would be, for read-only roles. */
function ViewOnlyChip() {
  return (
    <Chip tone="default">
      <Eye className="h-3 w-3" /> View-only for your role
    </Chip>
  );
}

export function TasksView() {
  const { data, loading, error, refresh } = useResource<Task[]>("/api/tasks");
  const { data: membersData } = useResource<Member[]>("/api/members");
  const quickAdd = useAppStore((s) => s.quickAdd);
  const consumeQuickAdd = useAppStore((s) => s.consumeQuickAdd);
  const user = useSession((s) => s.user);
  const writable = canWrite(user?.role);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");

  // Add-task dialog state
  const [addOpen, setAddOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState("none");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [priority, setPriority] = useState("medium");
  const [category, setCategory] = useState("");
  const [recurring, setRecurring] = useState("none");
  const [saving, setSaving] = useState(false);

  const tasks = useMemo(() => data ?? [], [data]);
  const members = useMemo(() => membersData ?? [], [membersData]);
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  const openAdd = useCallback(() => {
    setTitle("");
    setAssignee("none");
    setDate("");
    setTime("");
    setPriority("medium");
    setCategory("");
    setRecurring("none");
    setAddOpen(true);
  }, []);

  // Global quick-add signal (ignored for read-only roles)
  useEffect(() => {
    if (quickAdd === "task") {
      consumeQuickAdd();
      if (writable) openAdd();
    }
  }, [quickAdd, consumeQuickAdd, openAdd, writable]);

  const filtered = tasks.filter(
    (t) =>
      (statusFilter === "all" || t.status === statusFilter) &&
      (assigneeFilter === "all" || t.assigneeId === assigneeFilter)
  );

  const pendingCount = tasks.filter((t) => t.status === "pending").length;
  const inProgressCount = tasks.filter((t) => t.status === "in_progress").length;
  const doneCount = tasks.filter((t) => t.status === "done").length;
  const overdueCount = tasks.filter(
    (t) => t.status !== "done" && t.dueAt && new Date(t.dueAt).getTime() < Date.now()
  ).length;

  async function patchStatus(task: Task, status: string) {
    try {
      await apiSend("/api/tasks", "PATCH", { id: task.id, status });
      if (status === "done") toast.success(`Completed "${task.title}"`);
      else if (status === "in_progress") toast.success("Moved to in progress");
      else toast("Task reopened");
      void refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update task");
    }
  }

  async function deleteTask(task: Task) {
    try {
      await apiSend("/api/tasks", "DELETE", { id: task.id });
      toast.success("Task deleted");
      void refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete task");
    }
  }

  const canSubmit = title.trim().length > 0;

  async function submitTask() {
    setSaving(true);
    try {
      const dueAt = date
        ? new Date(`${date}T${time || "23:59"}`).toISOString()
        : null;
      await apiSend("/api/tasks", "POST", {
        title: title.trim(),
        assigneeId: assignee === "none" ? null : assignee,
        dueAt,
        priority,
        category: category.trim() || null,
        recurring: recurring === "none" ? null : recurring,
      });
      toast.success("Task added");
      setAddOpen(false);
      void refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add task");
    } finally {
      setSaving(false);
    }
  }

  if (loading && !data) {
    return (
      <div className="space-y-4">
        <ViewTitle title="Tasks" sub="Everything the household needs to get done" />
        <PageLoader label="Loading tasks…" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <ViewTitle title="Tasks" sub="Everything the household needs to get done" />
        <EmptyState icon={<TriangleAlert className="h-10 w-10" />} title="Couldn't load" sub={error} />
        <Button variant="outline" onClick={() => void refresh()}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ViewTitle
        title="Tasks"
        sub="Everything the household needs to get done"
        right={
          writable ? (
            <Button
              size="sm"
              className="brand-gradient border-0 text-white shadow-md"
              onClick={openAdd}
            >
              <Plus className="size-4" /> Add Task
            </Button>
          ) : (
            <ViewOnlyChip />
          )
        }
      />

      {/* Filters + stats */}
      <GlassCard className="p-3 sm:px-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                aria-pressed={statusFilter === f.key}
                onClick={() => setStatusFilter(f.key)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-semibold transition-all",
                  statusFilter === f.key
                    ? "brand-gradient border-0 text-white shadow-md"
                    : "border-white/40 text-muted-foreground hover:text-foreground dark:border-white/10"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
              <SelectTrigger size="sm" className="w-[150px] sm:w-[170px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All members</SelectItem>
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">{pendingCount}</span> pending{" • "}
          <span className="font-semibold text-foreground">{inProgressCount}</span> in progress{" • "}
          <span className="font-semibold text-foreground">{doneCount}</span> done
          {overdueCount > 0 ? (
            <>
              {" • "}
              <span className="font-semibold text-red-500">{overdueCount} overdue</span>
            </>
          ) : null}
        </p>
      </GlassCard>

      {/* Task list */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<ListChecks className="h-10 w-10" />}
          title="No tasks here"
          sub="Add a task or change the filters to see more."
        />
      ) : (
        <div className="max-h-96 space-y-2 overflow-y-auto pr-1 scrollbar-slim">
          {filtered.map((t) => {
            const done = t.status === "done";
            const assignee = t.assigneeId ? memberById.get(t.assigneeId) : undefined;
            const due = dueInfo(t);
            return (
              <GlassCard
                key={t.id}
                className={cn("group flex items-start gap-3 p-3 sm:px-4", done && "opacity-60")}
              >
                <Checkbox
                  checked={done}
                  className="mt-0.5"
                  disabled={!writable}
                  aria-label={done ? `Reopen ${t.title}` : `Complete ${t.title}`}
                  onCheckedChange={(v) => void patchStatus(t, v === true ? "done" : "pending")}
                />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <PriorityDot priority={t.priority} />
                    <p
                      className={cn(
                        "truncate text-sm font-medium",
                        done && "line-through decoration-2"
                      )}
                    >
                      {t.title}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {due ? (
                      <Chip tone={due.tone}>
                        <CalendarDays className="h-3 w-3" /> {due.text}
                      </Chip>
                    ) : null}
                    {t.status === "in_progress" ? (
                      <Chip tone="warning">
                        <Clock className="h-3 w-3" /> In progress
                      </Chip>
                    ) : null}
                    {t.category ? <Chip>{t.category}</Chip> : null}
                    {t.recurring ? (
                      <Chip tone="brand">
                        <RotateCcw className="h-3 w-3" /> {t.recurring}
                      </Chip>
                    ) : null}
                  </div>
                  {t.description ? (
                    <p className="truncate text-xs text-muted-foreground">{t.description}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {assignee ? (
                    <span className="flex items-center gap-1.5">
                      <MemberAvatar
                        name={assignee.name}
                        color={assignee.color}
                        role={assignee.role}
                        size={24}
                        title={assignee.name}
                      />
                      <span className="hidden max-w-[72px] truncate text-xs text-muted-foreground sm:inline">
                        {assignee.name}
                      </span>
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">Unassigned</span>
                  )}
                  {writable ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 text-muted-foreground"
                          aria-label={`Actions for ${t.title}`}
                        >
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {t.status === "in_progress" ? (
                          <DropdownMenuItem onClick={() => void patchStatus(t, "pending")}>
                            <Undo2 className="size-4" /> Mark pending
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => void patchStatus(t, "in_progress")}>
                            <Play className="size-4" /> Mark in progress
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-red-600 focus:text-red-600 dark:text-red-400 dark:focus:text-red-400"
                          onClick={() => void deleteTask(t)}
                        >
                          <Trash2 className="size-4" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                </div>
              </GlassCard>
            );
          })}
        </div>
      )}

      {/* Add Task dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Task</DialogTitle>
            <DialogDescription>Assign a chore, errand or reminder to anyone.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1 scrollbar-slim">
            <div className="space-y-1.5">
              <Label htmlFor="task-title">Title *</Label>
              <Input
                id="task-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Water the plants"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Assignee</Label>
                <Select value={assignee} onValueChange={setAssignee}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
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
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p} className="capitalize">
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="task-date">Due date</Label>
                <Input
                  id="task-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="task-time">Time</Label>
                <Input
                  id="task-time"
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="task-category">Category</Label>
                <Input
                  id="task-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="Optional"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Repeats</Label>
                <Select value={recurring} onValueChange={setRecurring}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RECURRING.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button
              className="brand-gradient border-0 text-white shadow-md"
              disabled={!canSubmit || saving}
              onClick={() => void submitTask()}
            >
              {saving ? "Adding…" : "Add Task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
