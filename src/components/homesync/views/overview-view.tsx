"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import {
  Building2,
  Briefcase,
  CalendarDays,
  CalendarOff,
  CalendarPlus,
  Clock,
  CloudSun,
  Coffee,
  Compass,
  Drumstick,
  Footprints,
  GraduationCap,
  HeartPulse,
  Leaf,
  ListChecks,
  MapPin,
  MapPinOff,
  MapPinned,
  Milk,
  Package,
  Pencil,
  Pill,
  Plus,
  ReceiptText,
  RotateCcw,
  Satellite,
  Scissors,
  ShoppingBag,
  ShoppingBasket,
  Sparkles,
  SprayCan,
  Stethoscope,
  Store,
  TriangleAlert,
  UsersRound,
  UtensilsCrossed,
  Wheat,
  Wrench,
  Shirt,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { apiSend, fmtTime, timeAgo, useResource } from "@/lib/homesync/api";
import { useAppStore } from "@/lib/homesync/store";
import { canWrite } from "@/lib/homesync/roles";
import { useSession } from "@/lib/homesync/session";
import type {
  CalendarEvent,
  DashboardResponse,
  GroceryItem,
  NearbyStore,
  WeatherData,
} from "@/lib/homesync/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Chip,
  EmptyState,
  GlassCard,
  MemberAvatar,
  PageLoader,
  SectionHeader,
  StatTile,
} from "@/components/homesync/glass";
import { AnimatedPin, CheckDraw, LivePing, RadarSweep, SparkleFloat, WeatherAnimated } from "@/components/homesync/icons";
import { memberPinsFrom, placePins, SAVED_PLACES } from "@/components/homesync/family-map-data";

const FamilyMap = dynamic(() => import("@/components/homesync/family-map").then((m) => m.FamilyMap), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center">
      <span className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
    </div>
  ),
});

/* ---------- hydration-safe mounted flag ---------- */
const subscribeNoop = () => () => {};
function useMounted() {
  return useSyncExternalStore(subscribeNoop, () => true, () => false);
}

/* ---------- meta tables (emoji-free, monochrome — categories read by icon + label) ---------- */

const EVENT_META: Record<string, LucideIcon> = {
  personal: Sparkles,
  family: UsersRound,
  school: GraduationCap,
  work: Briefcase,
  health: HeartPulse,
  errand: ShoppingBag,
  bill: ReceiptText,
};

const GROCERY_ICON: Record<string, LucideIcon> = {
  Dairy: Milk,
  Vegetables: Leaf,
  Meat: Drumstick,
  Groceries: Wheat,
  Household: SprayCan,
  Other: Package,
};

const STORE_ICON: Record<string, LucideIcon> = {
  grocery: Store,
  supermarket: Building2,
  restaurant: UtensilsCrossed,
  cafe: Coffee,
  pharmacy: Pill,
  barber: Scissors,
  salon: Sparkles,
  stationery: Pencil,
  clinic: Stethoscope,
  hardware: Wrench,
  laundry: Shirt,
};

function fmtDistance(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

/* ================================================================ */

export function OverviewView() {
  const mounted = useMounted();
  const setView = useAppStore((s) => s.setView);
  const requestQuickAdd = useAppStore((s) => s.requestQuickAdd);
  const user = useSession((s) => s.user);
  const family = useSession((s) => s.family);
  const writable = canWrite(user?.role);
  const [activePinId, setActivePinId] = useState<string | null>(null);

  const homeLat = family?.homeLat ?? null;
  const homeLng = family?.homeLng ?? null;
  const hasHomeCoords = homeLat != null && homeLng != null;

  const dash = useResource<DashboardResponse>("/api/dashboard");
  // Weather is only fetched when the family has real home coordinates — without
  // them we show an honest setup prompt instead of any made-up forecast.
  const weatherRes = useResource<WeatherData>(
    hasHomeCoords ? `/api/weather?lat=${homeLat}&lng=${homeLng}` : null
  );
  const groceriesRes = useResource<GroceryItem[]>("/api/groceries");
  const storesRes = useResource<{ categories: { key: string; label: string; count: number }[]; stores: NearbyStore[] }>("/api/stores");

  const data = dash.data;
  const stats = data?.stats;
  const members = data?.members ?? [];
  const todayEvents = data?.todayEvents ?? [];
  const activity = data?.activity ?? [];

  const needed = (groceriesRes.data ?? []).filter((g) => g.status === "needed").slice(0, 5);
  const topStores = (storesRes.data?.stores ?? []).slice(0, 3);

  const nextEvent =
    todayEvents.find((e) => new Date(e.endAt ?? e.startAt).getTime() >= Date.now()) ?? todayEvents[0] ?? null;

  const memberPins = useMemo(() => memberPinsFrom(members), [members]);
  const livePins = useMemo(() => [...placePins(), ...memberPins], [memberPins]);
  const allConnected = stats ? stats.checkIns === stats.membersTotal : false;

  async function markPurchased(g: GroceryItem) {
    try {
      await apiSend("/api/groceries", "PATCH", { id: g.id, status: "purchased" });
      toast.success(`${g.name} marked purchased`);
      dash.refresh();
      groceriesRes.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update the item");
    }
  }

  /* ---------- loading / error ---------- */
  if (dash.loading && !dash.data) {
    return <PageLoader label="Bringing your home together…" />;
  }
  if (dash.error && !dash.data) {
    return (
      <div className="space-y-3">
        <EmptyState title="Couldn't load your dashboard" sub={dash.error} />
        <div className="flex justify-center">
          <Button className="brand-gradient text-white" onClick={() => dash.refresh()}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  const heroDate = mounted
    ? new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })
    : "";

  const homePlace = SAVED_PLACES.find((p) => p.id === "place-home");
  const homeCenter: [number, number] =
    homeLat != null && homeLng != null
      ? [homeLat, homeLng]
      : [homePlace?.lat ?? 13.0904, homePlace?.lng ?? 80.2119];

  type QuickAction = { label: string; icon: LucideIcon; onClick: () => void };
  const quickActions: QuickAction[] = [
    ...(writable
      ? ([
          { label: "Add Task", icon: ListChecks, onClick: () => requestQuickAdd("tasks", "task") },
          { label: "Add Grocery", icon: ShoppingBasket, onClick: () => requestQuickAdd("groceries", "grocery") },
          { label: "Add Medicine", icon: Pill, onClick: () => requestQuickAdd("care", "medicine") },
          { label: "Add Event", icon: CalendarPlus, onClick: () => requestQuickAdd("calendar", "event") },
        ] as QuickAction[])
      : []),
    { label: "Find Nearby", icon: Compass, onClick: () => setView("nearby") },
  ];

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* ============ HERO ============ */}
      <GlassCard strong specular className="relative overflow-hidden p-5 sm:p-7">
        <div aria-hidden className="pointer-events-none absolute -right-20 -top-28 h-80 w-80 rounded-full bg-foreground/10 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-24 right-40 h-56 w-56 rounded-full bg-foreground/5 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute right-6 top-8 hidden select-none lg:block">
          <AnimatedPin color="#71717a" className="scale-[1.8] opacity-70" />
        </div>

        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground" suppressHydrationWarning>
              {heroDate}
            </p>
            <h1 className="text-gradient mt-1.5 text-2xl font-extrabold tracking-tight sm:text-[28px]">
              A good day starts together.
              <SparkleFloat className="ml-1.5 inline-block align-[-2px] text-primary" size={26} />
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Here&apos;s what&apos;s happening around your home today.
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              {writable && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button className="brand-gradient rounded-full text-white shadow-lg">
                      <Plus className="h-4 w-4" /> Add to your day
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56">
                    <DropdownMenuItem onClick={() => requestQuickAdd("tasks", "task")}>
                      <ListChecks className="h-4 w-4" /> Task
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => requestQuickAdd("calendar", "event")}>
                      <CalendarDays className="h-4 w-4" /> Event
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => requestQuickAdd("groceries", "grocery")}>
                      <ShoppingBasket className="h-4 w-4" /> Grocery item
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => requestQuickAdd("care", "medicine")}>
                      <Pill className="h-4 w-4" /> Medicine dose
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => requestQuickAdd("bills", "bill")}>
                      <ReceiptText className="h-4 w-4" /> Bill
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>

          {/* Weather widget — real Open-Meteo data or honest states, never invented */}
          <GlassCard className="w-full max-w-sm shrink-0 p-4 glass-inset">
            {!hasHomeCoords ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden
                    className="glass-inset flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-foreground/70"
                  >
                    <MapPinOff className="h-5 w-5" />
                  </span>
                  <div className="leading-tight">
                    <p className="text-sm font-semibold">No home location yet</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Set your home location in Settings to see live weather.
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-fit rounded-xl"
                  onClick={() => setView("settings")}
                >
                  <MapPin className="h-4 w-4" /> Open Settings
                </Button>
              </div>
            ) : weatherRes.error ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden
                    className="glass-inset flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-foreground/70"
                  >
                    <CloudSun className="h-5 w-5" />
                  </span>
                  <div className="leading-tight">
                    <p className="text-sm font-semibold">Weather unavailable</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{weatherRes.error}</p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-fit rounded-xl"
                  onClick={() => void weatherRes.refresh()}
                >
                  <RotateCcw className="h-4 w-4" /> Retry
                </Button>
              </div>
            ) : !weatherRes.data ? (
              <div className="flex items-center gap-3">
                <span className="h-10 w-10 animate-pulse rounded-full bg-muted" />
                <div className="space-y-1.5">
                  <span className="block h-4 w-24 animate-pulse rounded bg-muted" />
                  <span className="block h-3 w-32 animate-pulse rounded bg-muted" />
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <WeatherAnimated icon={weatherRes.data.icon} />
                    <div className="leading-tight">
                      <p className="text-2xl font-bold">{weatherRes.data.tempC}°C</p>
                      <p className="text-xs text-muted-foreground">{weatherRes.data.condition}</p>
                    </div>
                  </div>
                  <div className="text-right leading-tight">
                    <p className="flex items-center justify-end gap-1 text-sm font-semibold">
                      <MapPin className="h-3.5 w-3.5 text-primary" /> {weatherRes.data.city}
                    </p>
                    <p className="flex items-center justify-end gap-1.5 text-[10px] font-medium text-muted-foreground">
                      <LivePing className="h-2 w-2" /> Live weather
                    </p>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-4 gap-1.5">
                  {weatherRes.data.forecast.map((f) => (
                    <div key={f.day} className="rounded-xl bg-background/40 px-1.5 py-1.5 text-center dark:bg-white/5">
                      <p className="text-[10px] font-semibold text-muted-foreground">{f.day}</p>
                      <WeatherAnimated icon={f.icon} className="mx-auto h-6 w-6" />
                      <p className="text-[10px] font-medium">{f.highC}° <span className="text-muted-foreground">{f.lowC}°</span></p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </GlassCard>
        </div>
      </GlassCard>

      {/* ============ FAMILY STRIP ============ */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <GlassCard className="p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <SectionHeader icon={<UsersRound className="h-4 w-4" />} title="Your family" sub={`${members.length} member${members.length === 1 ? "" : "s"} • ${family?.homeLabel ?? homePlace?.label ?? "Home"}`} />
          </div>
          <div className="scrollbar-slim mt-4 flex gap-4 overflow-x-auto pb-1 sm:gap-5">
            {members.map((m) => (
              <button
                key={m.id}
                onClick={() => setView("members")}
                className="group flex w-14 shrink-0 flex-col items-center gap-1.5 sm:w-16"
                aria-label={`${m.name} (${m.relation})`}
              >
                <MemberAvatar
                  name={m.name}
                  color={m.color}
                  role={m.role}
                  size={54}
                  ring={m.locationSharing}
                  className="transition-transform group-hover:-translate-y-0.5 group-hover:scale-105"
                />
                <span className="text-[11px] font-semibold leading-tight">{m.relation === "Me" ? "Me" : m.name}</span>
                <span className="-mt-0.5 text-[9px] leading-none text-muted-foreground">{m.relation === "Me" ? m.name : m.relation}</span>
              </button>
            ))}
            <button
              onClick={() => setView("members")}
              className="flex w-14 shrink-0 flex-col items-center gap-1.5 sm:w-16"
              aria-label="Invite a family member"
            >
              <span className="flex h-[54px] w-[54px] items-center justify-center rounded-full border-2 border-dashed border-primary/50 text-primary transition-colors hover:bg-primary/10">
                <Plus className="h-5 w-5" />
              </span>
              <span className="text-[11px] font-semibold text-primary">Invite</span>
            </button>
          </div>
        </GlassCard>

        <GlassCard
          hover
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setView("map");
            }
          }}
          onClick={() => setView("map")}
          className="cursor-pointer p-4 sm:p-5"
        >
          <SectionHeader
            icon={<MapPinned className="h-4 w-4" />}
            title="Family Location"
            sub="Tap to open the family map"
          />
          <div className="mt-3 flex items-center gap-3">
            <div className="min-w-0 flex-1 leading-tight">
              <p className="flex items-center gap-1.5 text-xs font-medium">
                <LivePing color={allConnected ? "#10b981" : "#f59e0b"} />
                {stats ? (allConnected ? "All connected" : `${stats.checkIns} of ${stats.membersTotal} sharing`) : "—"}
              </p>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Consent-based sharing • members can pause any time
              </p>
              <Chip tone="brand" className="mt-2 whitespace-nowrap">Live map →</Chip>
            </div>
            <div className="h-24 w-32 shrink-0 sm:h-28 sm:w-40">
              <FamilyMap
                pins={memberPins.filter((p) => p.kind === "member")}
                interactive={false}
                mapStyle="satellite"
                zoom={15}
                center={homeCenter}
                className="h-full w-full"
              />
            </div>
          </div>
        </GlassCard>
      </div>

      {/* ============ QUICK ACTIONS ============ */}
      <div className="flex flex-wrap gap-2.5 sm:gap-3">
        {quickActions.map((a) => (
          <button
            key={a.label}
            onClick={a.onClick}
            className="glass glass-hover flex items-center gap-2.5 rounded-2xl px-3.5 py-2.5 transition-all active:scale-95"
          >
            <span
              aria-hidden
              className="glass-inset flex h-9 w-9 items-center justify-center rounded-xl text-foreground/70"
            >
              <a.icon className="h-4.5 w-4.5" />
            </span>
            <span className="text-xs font-semibold">{a.label}</span>
          </button>
        ))}
      </div>

      {/* ============ STATS ============ */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatTile icon={<CalendarDays className="h-4 w-4" />} label="Today's Events" value={stats?.todayEvents ?? "—"} sub={stats ? (stats.todayEvents === 0 ? "Nothing scheduled today" : stats.nextEventLabel) : "Loading…"} onClick={() => setView("calendar")} />
        <StatTile icon={<ListChecks className="h-4 w-4" />} label="Tasks" value={stats?.tasksPending ?? "—"} sub={stats ? (stats.tasksPending === 0 ? "All caught up" : "pending now") : "Loading…"} onClick={() => setView("tasks")} />
        <StatTile icon={<ShoppingBasket className="h-4 w-4" />} label="Grocery Items" value={stats?.groceryToBuy ?? "—"} sub={stats ? (stats.groceryToBuy === 0 ? "List is clear" : "to buy") : "Loading…"} onClick={() => setView("groceries")} />
        <StatTile icon={<Pill className="h-4 w-4" />} label="Medicine" value={stats?.medicinesToday ?? "—"} sub={stats ? (stats.medicinesToday === 0 ? "No doses today" : "doses today") : "Loading…"} onClick={() => setView("care")} />
        <StatTile icon={<ReceiptText className="h-4 w-4" />} label="Bills Due" value={stats?.billsDue ?? "—"} sub={stats ? (stats.billsDue === 0 ? "All paid up" : "awaiting payment") : "Loading…"} onClick={() => setView("bills")} />
        <StatTile
          icon={<MapPinned className="h-4 w-4" />}
          label="Family Check-In"
          value={stats ? `${stats.checkIns}/${stats.membersTotal}` : "—"}
          sub={allConnected ? "all sharing" : "sharing location"}
          onClick={() => setView("map")}
        />
      </div>

      {/* ============ MAIN 3-COL ============ */}
      <div className="grid gap-4 xl:grid-cols-3">
        {/* ---- Today's Schedule ---- */}
        <GlassCard className="flex flex-col p-4 sm:p-5">
          <SectionHeader
            icon={<CalendarDays className="h-4 w-4" />}
            title="Today's Schedule"
            sub={`${todayEvents.length} event${todayEvents.length === 1 ? "" : "s"} today`}
            action={
              <Button variant="ghost" size="sm" className="text-primary" onClick={() => setView("calendar")}>
                Full calendar →
              </Button>
            }
          />
          {todayEvents.length === 0 ? (
            <div className="mt-4">
              <EmptyState title="No events today" sub="Enjoy the free day — plan one from the calendar." icon={<CalendarOff />} />
            </div>
          ) : (
            <ol className="scrollbar-slim mt-4 max-h-[400px] space-y-1.5 overflow-y-auto pr-1">
              {todayEvents.map((e: CalendarEvent) => {
                const EventIcon = EVENT_META[e.type] ?? Sparkles;
                const isNext = nextEvent?.id === e.id;
                return (
                  <li
                    key={e.id}
                    className={cn(
                      "flex items-center gap-3 rounded-xl p-2.5 transition-colors",
                      isNext ? "glass-inset ring-1 ring-primary/30" : "hover:bg-accent/50"
                    )}
                  >
                    <div className="w-16 shrink-0 text-right leading-tight">
                      <p className="text-[11px] font-bold">{fmtTime(e.startAt)}</p>
                      {e.endAt && <p className="text-[10px] text-muted-foreground">{fmtTime(e.endAt)}</p>}
                    </div>
                    <span
                      aria-hidden
                      className="glass-inset flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-foreground/70"
                    >
                      <EventIcon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1 leading-tight">
                      <p className="flex items-center gap-2 truncate text-[13px] font-semibold">
                        <span className="truncate">{e.title}</span>
                        {isNext && <Chip tone="brand" className="shrink-0">UP NEXT</Chip>}
                      </p>
                      {e.location && (
                        <p className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                          <MapPin className="h-3 w-3 shrink-0" />
                          <span className="truncate">{e.location}</span>
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </GlassCard>

        {/* ---- Live Family Location ---- */}
        <GlassCard className="flex flex-col p-4 sm:p-5">
          <SectionHeader
            icon={<Satellite className="h-4 w-4" />}
            title="Live Family Location"
            sub="Consent-based • updates as members move"
            action={
              <Button variant="ghost" size="sm" className="text-primary" onClick={() => setView("map")}>
                View all →
              </Button>
            }
          />
          <div className="mt-4 h-52 w-full sm:h-60">
            <FamilyMap
              pins={livePins}
              activePinId={activePinId}
              onPinClick={(p) => setActivePinId((cur) => (cur === p.id ? null : p.id))}
              mapStyle="hybrid"
              className="h-full w-full"
            />
          </div>
          <ul className="scrollbar-slim mt-3 max-h-40 space-y-0.5 overflow-y-auto pr-1">
            {members.map((m) => (
              <li key={m.id} className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 transition-colors hover:bg-accent/50">
                <MemberAvatar name={m.name} color={m.color} role={m.role} size={28} ring={m.locationSharing} />
                <div className="min-w-0 flex-1 leading-tight">
                  <p className="truncate text-xs font-semibold">
                    {m.name} <span className="font-normal text-muted-foreground">• {m.relation}</span>
                  </p>
                  <p className="flex items-center gap-1 truncate text-[10px] text-muted-foreground">
                    {m.locationSharing && <LivePing color="#10b981" className="h-2 w-2 shrink-0" />}
                    {m.locationSharing ? m.locationLabel ?? "Location sharing on" : "Sharing paused"}
                  </p>
                </div>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {m.locationSharing ? timeAgo(m.locationUpdatedAt) : "—"}
                </span>
              </li>
            ))}
          </ul>
        </GlassCard>

        {/* ---- Grocery + Nearby ---- */}
        <div className="flex flex-col gap-4">
          <GlassCard className="p-4 sm:p-5">
            <SectionHeader
              icon={<ShoppingBasket className="h-4 w-4" />}
              title="Grocery List"
              sub={`${needed.length} item${needed.length === 1 ? "" : "s"} to buy`}
              action={
                <Button variant="ghost" size="sm" className="text-primary" onClick={() => setView("groceries")}>
                  Open list →
                </Button>
              }
            />
            {groceriesRes.loading && !groceriesRes.data ? (
              <div className="mt-3 space-y-2">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex items-center gap-2.5 rounded-xl px-2 py-1.5">
                    <span className="h-5 w-5 animate-pulse rounded-full bg-muted" />
                    <span className="h-3.5 w-28 animate-pulse rounded bg-muted" />
                  </div>
                ))}
              </div>
            ) : groceriesRes.error ? (
              <div className="mt-3">
                <EmptyState title="Couldn't load the grocery list" sub={groceriesRes.error} icon={<TriangleAlert />} />
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2 w-full rounded-xl"
                  onClick={() => void groceriesRes.refresh()}
                >
                  <RotateCcw className="h-4 w-4" /> Try again
                </Button>
              </div>
            ) : needed.length === 0 ? (
              <div className="mt-3">
                <EmptyState title="All purchased!" sub="The grocery list is clear for now." icon={<CheckDraw size={44} />} />
              </div>
            ) : (
              <ul className="mt-3 space-y-0.5">
                {needed.map((g) => {
                  const GIcon = GROCERY_ICON[g.category] ?? Package;
                  return (
                    <li key={g.id} className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 transition-colors hover:bg-accent/50">
                      <Checkbox
                        className="h-5 w-5"
                        checked={false}
                        disabled={!writable}
                        onCheckedChange={() => markPurchased(g)}
                        aria-label={`Mark ${g.name} as purchased`}
                      />
                      <div className="min-w-0 flex-1 leading-tight">
                        <p className="truncate text-[13px] font-medium">
                          {g.name} <span className="text-[11px] text-muted-foreground">{g.quantity}</span>
                        </p>
                      </div>
                      <Chip className="shrink-0">
                        <GIcon className="h-3 w-3" /> {g.category}
                      </Chip>
                    </li>
                  );
                })}
              </ul>
            )}
            {writable && (
              <Button
                variant="outline"
                size="sm"
                className="mt-3 w-full rounded-xl border-primary/40 text-primary hover:bg-primary/10"
                onClick={() => requestQuickAdd("groceries", "grocery")}
              >
                <Plus className="h-4 w-4" /> Add item
              </Button>
            )}
          </GlassCard>

          <GlassCard className="p-4 sm:p-5">
            <SectionHeader
              icon={<Store className="h-4 w-4" />}
              title="Nearby Stores"
              sub={storesRes.data ? `${storesRes.data.stores.length} places around home` : "Loading places…"}
              action={
                <Button variant="ghost" size="sm" className="text-primary" onClick={() => setView("nearby")}>
                  View all →
                </Button>
              }
            />
            {storesRes.loading && !storesRes.data ? (
              <ul className="mt-3 space-y-2">
                {[0, 1, 2].map((i) => (
                  <li key={i} className="glass-inset flex items-center gap-3 rounded-xl p-2.5">
                    <span className="h-9 w-9 animate-pulse rounded-xl bg-muted" />
                    <div className="flex-1 space-y-1.5">
                      <span className="block h-3 w-24 animate-pulse rounded bg-muted" />
                      <span className="block h-2.5 w-32 animate-pulse rounded bg-muted" />
                    </div>
                  </li>
                ))}
              </ul>
            ) : storesRes.error ? (
              <div className="mt-3">
                <EmptyState title="Couldn't load nearby places" sub={storesRes.error} icon={<TriangleAlert />} />
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2 w-full rounded-xl"
                  onClick={() => void storesRes.refresh()}
                >
                  <RotateCcw className="h-4 w-4" /> Try again
                </Button>
              </div>
            ) : storesRes.data && topStores.length === 0 ? (
              <div className="mt-3">
                <EmptyState title="No places found" sub="Try a wider radius in Nearby Services." icon={<RadarSweep />} />
              </div>
            ) : (
              <ul className="mt-3 space-y-2">
                {topStores.map((s) => {
                  const SIcon = STORE_ICON[s.category] ?? Store;
                  return (
                    <li key={s.id} className="glass-inset flex items-center gap-3 rounded-xl p-2.5">
                      <span
                        aria-hidden
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-background/60 text-foreground/70"
                      >
                        <SIcon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1 leading-tight">
                        <p className="truncate text-[13px] font-semibold">{s.name}</p>
                        <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          {fmtDistance(s.distanceKm)} away • <Footprints className="h-3 w-3 shrink-0" /> {s.etaMins} min
                        </p>
                      </div>
                      <Chip tone={s.openNow === true ? "success" : s.openNow === false ? "danger" : "default"} className="shrink-0">
                        {s.openNow === true ? "Open" : s.openNow === false ? "Closed" : "—"}
                      </Chip>
                    </li>
                  );
                })}
              </ul>
            )}
          </GlassCard>
        </div>
      </div>

      {/* ============ RECENT ACTIVITY ============ */}
      <GlassCard className="p-4 sm:p-5">
        <SectionHeader
          icon={<Clock className="h-4 w-4" />}
          title="Recent family activity"
          sub="Everything happening across your home"
        />
        {activity.length === 0 ? (
          <div className="mt-3">
            <EmptyState title="No activity yet" sub="Family activity will appear here." />
          </div>
        ) : (
          <ul className="scrollbar-slim mt-3 grid max-h-52 gap-1 overflow-y-auto pr-1 sm:grid-cols-2">
            {activity.slice(0, 8).map((a) => (
              <li key={a.id} className="rounded-xl px-3 py-2 transition-colors hover:bg-accent/50">
                <p className="text-[13px] leading-snug">
                  <span className="font-semibold">{a.actor}</span> {a.action}{" "}
                  <span className="font-medium text-primary">{a.target}</span>
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{timeAgo(a.createdAt)}</p>
              </li>
            ))}
          </ul>
        )}
      </GlassCard>
    </div>
  );
}
