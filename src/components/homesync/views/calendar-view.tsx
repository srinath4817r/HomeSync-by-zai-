"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addDays,
  addMonths,
  addWeeks,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Eye,
  MapPin,
  Plus,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";

import { apiSend, fmtTime, useResource } from "@/lib/homesync/api";
import { canWrite } from "@/lib/homesync/roles";
import { useSession } from "@/lib/homesync/session";
import { useAppStore } from "@/lib/homesync/store";
import type { CalendarEvent, Member } from "@/lib/homesync/types";
import { cn } from "@/lib/utils";
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
  SectionHeader,
  ViewTitle,
} from "@/components/homesync/glass";

type ViewMode = "day" | "week" | "month";

const MODES: ViewMode[] = ["day", "week", "month"];

const EVENT_TYPES: { key: string; label: string }[] = [
  { key: "personal", label: "Personal" },
  { key: "family", label: "Family" },
  { key: "school", label: "School" },
  { key: "work", label: "Work" },
  { key: "health", label: "Health" },
  { key: "errand", label: "Errand" },
  { key: "bill", label: "Bill" },
];

function typeStyle(type: string) {
  return EVENT_TYPES.find((t) => t.key === type) ?? EVENT_TYPES[1];
}

/** Single neutral event-type marker (categories read by label, not color). */
const TYPE_DOT = "bg-foreground/45";
const TYPE_CHIP =
  "border-foreground/15 bg-foreground/5 dark:border-white/15 dark:bg-white/10";

/** Shown where mutation controls would be, for read-only roles. */
function ViewOnlyChip() {
  return (
    <Chip tone="default">
      <Eye className="h-3 w-3" /> View-only for your role
    </Chip>
  );
}

const WEEKDAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function CalendarView() {
  const { data, loading, error, refresh } = useResource<CalendarEvent[]>("/api/events");
  const { data: membersData } = useResource<Member[]>("/api/members");
  const quickAdd = useAppStore((s) => s.quickAdd);
  const consumeQuickAdd = useAppStore((s) => s.consumeQuickAdd);
  const user = useSession((s) => s.user);
  const writable = canWrite(user?.role);

  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const selectedDateRef = useRef(selectedDate);
  selectedDateRef.current = selectedDate;

  // Add-event dialog state
  const [addOpen, setAddOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("18:00");
  const [type, setType] = useState("family");
  const [location, setLocation] = useState("");
  const [saving, setSaving] = useState(false);

  const events = useMemo(() => data ?? [], [data]);
  const members = useMemo(() => membersData ?? [], [membersData]);
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  // Group events by local day key once
  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      const key = format(new Date(ev.startAt), "yyyy-MM-dd");
      const arr = map.get(key);
      if (arr) arr.push(ev);
      else map.set(key, [ev]);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => a.startAt.localeCompare(b.startAt));
    }
    return map;
  }, [events]);

  const eventsOn = useCallback(
    (d: Date) => byDay.get(format(d, "yyyy-MM-dd")) ?? [],
    [byDay]
  );

  const monthCells = useMemo(() => {
    const start = startOfWeek(startOfMonth(selectedDate), { weekStartsOn: 1 });
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [selectedDate]);

  const weekDays = useMemo(() => {
    const start = startOfWeek(selectedDate, { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [selectedDate]);

  const selectedEvents = useMemo(() => eventsOn(selectedDate), [eventsOn, selectedDate]);

  const openAdd = useCallback(() => {
    setTitle("");
    setLocation("");
    setDate(format(selectedDateRef.current, "yyyy-MM-dd"));
    setTime("18:00");
    setType("family");
    setAddOpen(true);
  }, []);

  // Global quick-add signal (ignored for read-only roles)
  useEffect(() => {
    if (quickAdd === "event") {
      consumeQuickAdd();
      if (writable) openAdd();
    }
  }, [quickAdd, consumeQuickAdd, openAdd, writable]);

  function shift(dir: -1 | 1) {
    if (viewMode === "month") setSelectedDate((d) => addMonths(d, dir));
    else if (viewMode === "week") setSelectedDate((d) => addWeeks(d, dir));
    else setSelectedDate((d) => addDays(d, dir));
  }

  async function doDelete(id: string) {
    try {
      await apiSend("/api/events", "DELETE", { id });
      toast.success("Event deleted");
      void refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete event");
    }
  }

  function confirmDelete(ev: CalendarEvent) {
    toast(`Delete "${ev.title}"?`, {
      description: "This removes the event for the whole family.",
      action: { label: "Delete", onClick: () => void doDelete(ev.id) },
    });
  }

  const canSubmit = title.trim().length > 0 && date.length > 0 && time.length > 0;

  async function submitEvent() {
    const start = new Date(`${date}T${time}`);
    if (Number.isNaN(start.getTime())) {
      toast.error("Please pick a valid date and time");
      return;
    }
    setSaving(true);
    try {
      await apiSend("/api/events", "POST", {
        title: title.trim(),
        startAt: start.toISOString(),
        type,
        location: location.trim() || null,
      });
      toast.success("Event added");
      setAddOpen(false);
      void refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add event");
    } finally {
      setSaving(false);
    }
  }

  const headerLabel =
    viewMode === "month"
      ? format(selectedDate, "MMMM yyyy")
      : viewMode === "week"
        ? `${format(weekDays[0], "d MMM")} – ${format(weekDays[6], "d MMM yyyy")}`
        : format(selectedDate, "EEEE, d MMM yyyy");

  if (loading && !data) {
    return (
      <div className="space-y-4">
        <ViewTitle title="Calendar" sub="Family events, school runs & special days" />
        <PageLoader label="Loading calendar…" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <ViewTitle title="Calendar" sub="Family events, school runs & special days" />
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
        title="Calendar"
        sub="Family events, school runs & special days"
        right={
          writable ? (
            <Button
              size="sm"
              className="brand-gradient border-0 text-white shadow-md"
              onClick={openAdd}
            >
              <Plus className="size-4" /> Add Event
            </Button>
          ) : (
            <ViewOnlyChip />
          )
        }
      />

      {/* Toolbar */}
      <GlassCard className="p-3 sm:px-4">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="glass-inset flex rounded-xl p-1">
            {MODES.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={viewMode === m}
                onClick={() => setViewMode(m)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-all",
                  viewMode === m
                    ? "brand-gradient text-white shadow-md"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {m}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              aria-label="Previous"
              onClick={() => shift(-1)}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => setSelectedDate(new Date())}
            >
              Today
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              aria-label="Next"
              onClick={() => shift(1)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
          <span className="ml-auto text-sm font-bold sm:text-base">{headerLabel}</span>
        </div>
        {/* Type legend */}
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          {EVENT_TYPES.map((t) => (
            <span
              key={t.key}
              className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground"
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", TYPE_DOT)} />
              {t.label}
            </span>
          ))}
        </div>
      </GlassCard>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_320px]">
        {/* Main calendar surface */}
        <GlassCard className="p-3 sm:p-4">
          {viewMode === "month" ? (
            <div>
              <div className="mb-2 grid grid-cols-7 gap-1 text-center">
                {WEEKDAY_HEADERS.map((d) => (
                  <div
                    key={d}
                    className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                  >
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {monthCells.map((day) => {
                  const dayEvents = eventsOn(day);
                  const inMonth = isSameMonth(day, selectedDate);
                  const selected = isSameDay(day, selectedDate);
                  const today = isToday(day);
                  return (
                    <button
                      key={day.toISOString()}
                      type="button"
                      onClick={() => setSelectedDate(day)}
                      className={cn(
                        "flex min-h-[72px] flex-col gap-1 rounded-xl border p-1.5 text-left transition sm:min-h-[92px]",
                        inMonth
                          ? "border-white/50 hover:bg-white/40 dark:border-white/10 dark:hover:bg-white/5"
                          : "border-transparent opacity-40",
                        selected && "border-primary/50 bg-primary/10",
                        today && "ring-2 ring-primary/60"
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
                          today
                            ? "brand-gradient text-white shadow"
                            : selected
                              ? "bg-primary/20 text-primary"
                              : ""
                        )}
                      >
                        {format(day, "d")}
                      </span>
                      <div className="min-w-0 flex-1 space-y-0.5">
                        {dayEvents.slice(0, 3).map((ev) => (
                          <span
                            key={ev.id}
                            className={cn(
                              "flex items-center gap-1 truncate rounded-md border px-1 py-0.5 text-[10px] font-medium leading-none",
                              TYPE_CHIP
                            )}
                          >
                            <span className="truncate">{ev.title}</span>
                          </span>
                        ))}
                        {dayEvents.length > 3 ? (
                          <span className="pl-1 text-[10px] font-medium text-muted-foreground">
                            +{dayEvents.length - 3} more
                          </span>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : viewMode === "week" ? (
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
              {weekDays.map((day) => {
                const dayEvents = eventsOn(day);
                const today = isToday(day);
                return (
                  <div
                    key={day.toISOString()}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedDate(day)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedDate(day);
                      }
                    }}
                    className={cn(
                      "cursor-pointer rounded-xl border p-2.5 transition hover:bg-white/40 dark:hover:bg-white/5",
                      today
                        ? "border-primary/40 bg-primary/5"
                        : "border-white/50 dark:border-white/10"
                    )}
                  >
                    <div className="mb-1.5 flex items-baseline justify-between gap-1">
                      <span className="text-xs font-semibold">{format(day, "EEE")}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {format(day, "d MMM")}
                      </span>
                    </div>
                    {dayEvents.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground">No events</p>
                    ) : (
                      <ul className="space-y-1">
                        {dayEvents.map((ev) => (
                          <li key={ev.id} className="flex items-center gap-1.5 text-[11px]">
                            <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", TYPE_DOT)} />
                            <span className="shrink-0 font-medium tabular-nums">
                              {fmtTime(ev.startAt)}
                            </span>
                            <span className="truncate text-muted-foreground">{ev.title}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-2">
              {selectedEvents.length === 0 ? (
                <EmptyState
                  icon={<CalendarDays className="h-10 w-10" />}
                  title="Nothing scheduled"
                  sub="Enjoy the free day — or add an event."
                />
              ) : (
                selectedEvents.map((ev) => {
                  const owner = ev.ownerId ? memberById.get(ev.ownerId) : undefined;
                  return (
                    <div
                      key={ev.id}
                      className="group flex items-center gap-3 rounded-xl border border-white/50 bg-white/30 p-3 dark:border-white/10 dark:bg-white/5"
                    >
                      <span className="brand-gradient shrink-0 rounded-lg px-2 py-1 text-[11px] font-bold tabular-nums text-white shadow-sm">
                        {fmtTime(ev.startAt)}
                      </span>
                      <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", TYPE_DOT)} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{ev.title}</p>
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                          <span className="capitalize">{typeStyle(ev.type).label}</span>
                          {ev.location ? (
                            <span className="flex min-w-0 items-center gap-1">
                              <MapPin className="size-3 shrink-0" />
                              <span className="truncate">{ev.location}</span>
                            </span>
                          ) : null}
                        </div>
                      </div>
                      {owner ? (
                        <MemberAvatar
                          name={owner.name}
                          color={owner.color}
                          role={owner.role}
                          size={28}
                          title={owner.name}
                        />
                      ) : null}
                      {writable ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Delete ${ev.title}`}
                          className="h-8 w-8 shrink-0 text-muted-foreground opacity-0 transition hover:text-red-500 focus-visible:opacity-100 group-hover:opacity-100"
                          onClick={() => confirmDelete(ev)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </GlassCard>

        {/* Selected-day summary */}
        <GlassCard className="p-4 sm:p-5">
          <SectionHeader
            icon={<CalendarDays className="h-4 w-4" />}
            title={format(selectedDate, "EEEE, d MMM")}
            sub={`${selectedEvents.length} event${selectedEvents.length === 1 ? "" : "s"} planned`}
          />
          <div className="mt-3 max-h-72 space-y-2 overflow-y-auto scrollbar-slim">
            {selectedEvents.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border/70 px-3 py-6 text-center text-xs text-muted-foreground">
                No events this day
              </p>
            ) : (
              selectedEvents.map((ev) => (
                <div
                  key={ev.id}
                  className="flex items-center gap-2 rounded-xl border border-white/50 bg-white/30 px-2.5 py-2 dark:border-white/10 dark:bg-white/5"
                >
                  <span className={cn("h-2 w-2 shrink-0 rounded-full", TYPE_DOT)} />
                  <span className="w-16 shrink-0 text-[11px] font-bold tabular-nums text-muted-foreground">
                    {fmtTime(ev.startAt)}
                  </span>
                  <span className="truncate text-xs font-medium">{ev.title}</span>
                </div>
              ))
            )}
          </div>
        </GlassCard>
      </div>

      {/* Add Event dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Event</DialogTitle>
            <DialogDescription>
              New family event — it appears on the calendar instantly.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1 scrollbar-slim">
            <div className="space-y-1.5">
              <Label htmlFor="ev-title">Title *</Label>
              <Input
                id="ev-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Dentist appointment"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ev-date">Date *</Label>
                <Input
                  id="ev-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ev-time">Time *</Label>
                <Input
                  id="ev-time"
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EVENT_TYPES.map((t) => (
                      <SelectItem key={t.key} value={t.key}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ev-location">Location</Label>
                <Input
                  id="ev-location"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Optional"
                />
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
              onClick={() => void submitEvent()}
            >
              {saving ? "Adding…" : "Add Event"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
