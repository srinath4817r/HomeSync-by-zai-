"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import {
  Bell,
  CalendarPlus,
  Command,
  Compass,
  Home as HomeIcon,
  ListChecks,
  Lock,
  LogOut,
  MapPinned,
  Menu,
  Moon,
  Pill,
  ReceiptText,
  Search,
  ShoppingBasket,
  Sparkles,
  Sun,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { NAV_ITEMS, useAppStore } from "@/lib/homesync/store";
import { useSession } from "@/lib/homesync/session";
import { allowedViews, canWrite, roleBadge } from "@/lib/homesync/roles";
import { useResource, fmtDate, timeAgo } from "@/lib/homesync/api";
import type { ActivityEntry, Member, ViewKey } from "@/lib/homesync/types";
import { cn } from "@/lib/utils";
import { GlassCard, MemberAvatar } from "./glass";
import { HomeSyncMark, ShieldUserIcon } from "./icons";
import { SAVED_PLACES } from "./family-map-data";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";

/* ---------------- hydration-safe mounted flag ---------------- */

const subscribeNoop = () => () => {};

/** Derived from the family map data — no hardcoded address in the chrome. */
const HOME_PLACE = SAVED_PLACES.find((p) => p.id === "place-home");

/* ---------------- Logo ---------------- */

function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <HomeSyncMark size={40} />
      {!compact && (
        <div className="leading-tight">
          <p className="text-sm font-extrabold tracking-wide">HOME SYNC</p>
          <p className="text-[10px] font-medium text-muted-foreground">One Home. One Family.</p>
        </div>
      )}
    </div>
  );
}

/* ---------------- Theme toggle ---------------- */

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribeNoop, () => true, () => false);
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Toggle theme"
      className="rounded-full glass hover:bg-transparent"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
    >
      {mounted && theme === "dark" ? <Sun className="h-4.5 w-4.5" /> : <Moon className="h-4.5 w-4.5" />}
    </Button>
  );
}

/* ---------------- Notifications ---------------- */

function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const { data } = useResource<ActivityEntry[]>(open ? "/api/activity" : null);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Notifications"
          className="relative rounded-full glass hover:bg-transparent"
        >
          <Bell className="h-4.5 w-4.5" />
          <span className="brand-gradient absolute right-1.5 top-1.5 h-2 w-2 rounded-full" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[320px] sm:w-[380px] glass-strong border-white/40 dark:border-white/10">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" /> Family activity
          </SheetTitle>
        </SheetHeader>
        <div className="px-4 pb-6">
          <ScrollArea className="h-[calc(100vh-8rem)] pr-3">
            {!data ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
            ) : data.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No recent activity.</p>
            ) : (
              <ul className="space-y-1">
                {data.map((a) => (
                  <li key={a.id} className="rounded-xl px-3 py-2.5 transition-colors hover:bg-accent/60">
                    <p className="text-[13px] leading-snug">
                      <span className="font-semibold">{a.actor}</span> {a.action}{" "}
                      <span className="font-medium text-primary">{a.target}</span>
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{timeAgo(a.createdAt)}</p>
                  </li>
                ))}
              </ul>
            )}
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ---------------- User menu ---------------- */

function UserMenu() {
  const user = useSession((s) => s.user);
  const logout = useSession((s) => s.logout);
  const setView = useAppStore((s) => s.setView);
  if (!user) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center gap-2.5 rounded-full glass py-1.5 pl-1.5 pr-3 text-left transition-all hover:bg-accent/60 sm:pl-1.5"
          aria-label={`Signed in as ${user.name}`}
        >
          <MemberAvatar name={user.name} color={user.color} role={user.role} photoUrl={user.photoUrl} size={30} />
          <span className="hidden leading-tight sm:block">
            <span className="block text-xs font-semibold">{user.name}</span>
            <span className="block text-[10px] text-muted-foreground">{user.role}</span>
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="flex items-center gap-2.5">
          <MemberAvatar name={user.name} color={user.color} role={user.role} photoUrl={user.photoUrl} size={36} />
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-semibold">{user.name}</p>
            <p className="truncate text-[11px] font-normal text-muted-foreground">
              {user.isGuest ? "Exploring as guest" : user.email}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="py-1.5">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
            <ShieldUserIcon size={12} /> {user.role} — {roleBadge(user.role)}
          </span>
        </DropdownMenuLabel>
        {!user.isGuest && (
          <DropdownMenuItem onClick={() => setView("settings")}>
            <UserRound className="h-4 w-4" /> Profile &amp; settings
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={() => {
            logout();
            toast("Signed out — see you soon");
          }}
        >
          <LogOut className="h-4 w-4" /> {user.isGuest ? "Exit guest mode" : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ---------------- Command palette ---------------- */

function CommandPalette() {
  const [open, setOpen] = useState(false);
  const setView = useAppStore((s) => s.setView);
  const requestQuickAdd = useAppStore((s) => s.requestQuickAdd);
  const user = useSession((s) => s.user);
  const views = allowedViews(user?.role);
  const writable = canWrite(user?.role);
  const { data: members } = useResource<Member[]>("/api/members");

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const run = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  const QUICK_ICONS = { task: ListChecks, grocery: ShoppingBasket, event: CalendarPlus, medicine: Pill, bill: ReceiptText };

  return (
    <>
      <Button
        variant="ghost"
        onClick={() => setOpen(true)}
        className="h-10 w-10 justify-center rounded-full glass p-0 hover:bg-transparent sm:h-10 sm:w-64 sm:justify-start sm:gap-2 sm:px-4"
        aria-label="Search"
      >
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="hidden text-sm text-muted-foreground sm:inline">Search your home…</span>
        <kbd className="ml-auto hidden items-center gap-0.5 rounded-md border bg-muted/60 px-1.5 font-mono text-[10px] text-muted-foreground sm:flex">
          <Command className="h-2.5 w-2.5" />K
        </kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Search pages, quick actions, people…" />
        <CommandList className="scrollbar-slim">
          <CommandEmpty>No results found.</CommandEmpty>
          {writable && (
            <CommandGroup heading="Quick actions">
              <CommandItem onSelect={() => run(() => requestQuickAdd("tasks", "task"))}>
                <QUICK_ICONS.task className="h-4 w-4 text-foreground/70" /> Add a task
              </CommandItem>
              <CommandItem onSelect={() => run(() => requestQuickAdd("groceries", "grocery"))}>
                <QUICK_ICONS.grocery className="h-4 w-4 text-foreground/70" /> Add grocery item
              </CommandItem>
              <CommandItem onSelect={() => run(() => requestQuickAdd("calendar", "event"))}>
                <QUICK_ICONS.event className="h-4 w-4 text-foreground/70" /> Add event
              </CommandItem>
              <CommandItem onSelect={() => run(() => requestQuickAdd("care", "medicine"))}>
                <QUICK_ICONS.medicine className="h-4 w-4 text-foreground/70" /> Add medicine
              </CommandItem>
              <CommandItem onSelect={() => run(() => requestQuickAdd("bills", "bill"))}>
                <QUICK_ICONS.bill className="h-4 w-4 text-foreground/70" /> Add bill
              </CommandItem>
              <CommandItem onSelect={() => run(() => setView("assistant"))}>
                <Sparkles className="h-4 w-4 text-primary" /> Ask the AI assistant
              </CommandItem>
            </CommandGroup>
          )}
          <CommandGroup heading="Pages">
            {NAV_ITEMS.filter((n) => views.includes(n.key)).map((n) => (
              <CommandItem key={n.key} onSelect={() => run(() => setView(n.key))}>
                <n.icon className="h-4 w-4 text-primary" /> {n.label}
              </CommandItem>
            ))}
          </CommandGroup>
          {members && members.length > 0 && (
            <CommandGroup heading="Family">
              {members.map((m) => (
                <CommandItem key={m.id} onSelect={() => run(() => setView("members"))}>
                  <MemberAvatar name={m.name} color={m.color} role={m.role} size={20} />
                  {m.name}
                  <span className="ml-1 text-xs text-muted-foreground">({m.relation} • {m.role})</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}

/* ---------------- Sidebar ---------------- */

function SidebarNav() {
  const view = useAppStore((s) => s.view);
  const setView = useAppStore((s) => s.setView);
  const user = useSession((s) => s.user);
  const { data: members } = useResource<Member[]>("/api/members");
  const views = allowedViews(user?.role);

  return (
    <aside className="fixed inset-y-3 left-3 z-40 hidden w-[240px] flex-col rounded-3xl glass-strong p-4 lg:flex">
      <Logo />
      <Separator className="my-3 opacity-60" />
      <nav aria-label="Primary" className="scrollbar-slim -mr-1 flex-1 space-y-1 overflow-y-auto pr-1">
        {NAV_ITEMS.filter((item) => views.includes(item.key)).map((item) => {
          const active = view === item.key;
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              onClick={() => setView(item.key)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all",
                active
                  ? "brand-gradient text-white shadow-md"
                  : "text-foreground/80 hover:bg-accent/70"
              )}
            >
              <Icon
                className={cn(
                  "h-4 w-4 shrink-0 transition-transform group-hover:scale-110",
                  active && "drop-shadow"
                )}
              />
              {item.label}
            </button>
          );
        })}
      </nav>
      <Separator className="my-3 opacity-60" />
      <GlassCard className="flex items-center gap-3 p-3">
        <div className="flex -space-x-2">
          {(members ?? []).slice(0, 5).map((m) => (
            <MemberAvatar key={m.id} name={m.name} color={m.color} role={m.role} size={28} />
          ))}
        </div>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-xs font-semibold">Our Home</p>
          <p className="truncate text-[10px] text-muted-foreground">
            {members?.length ?? 0} members • {HOME_PLACE?.sublabel ?? "One address"}
          </p>
        </div>
      </GlassCard>
    </aside>
  );
}

/* ---------------- Topbar ---------------- */

function Topbar() {
  const today = new Date();
  return (
    <header className="sticky top-0 z-30 -mx-1 mb-4 flex items-center gap-2 rounded-b-2xl px-1 pb-2 pt-3 backdrop-blur-xl lg:mt-3" style={{ background: "color-mix(in oklab, var(--background) 55%, transparent)" }}>
      <div className="lg:hidden">
        <MobileMore />
      </div>
      <div className="hidden min-w-0 leading-tight md:block">
        <p className="text-sm font-semibold">{fmtDate(today.toISOString())}</p>
        <p className="text-[11px] text-muted-foreground">Your family, in sync</p>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <CommandPalette />
        <ThemeToggle />
        <NotificationsBell />
        <UserMenu />
      </div>
    </header>
  );
}

/* ---------------- Mobile bottom nav + more sheet ---------------- */

/** Bottom nav per spec: Home, AI, Map, Nearby Services (+ More). */
const PRIMARY_MOBILE: { key: ViewKey; label: string; icon: typeof HomeIcon }[] = [
  { key: "overview", label: "Home", icon: HomeIcon },
  { key: "assistant", label: "AI", icon: Sparkles },
  { key: "map", label: "Map", icon: MapPinned },
  { key: "nearby", label: "Nearby", icon: Compass },
];

function MobileMore({
  side = "left",
  trigger = "icon",
}: {
  side?: "left" | "bottom";
  trigger?: "icon" | "inline";
}) {
  const [open, setOpen] = useState(false);
  const view = useAppStore((s) => s.view);
  const setView = useAppStore((s) => s.setView);
  const user = useSession((s) => s.user);
  const views = allowedViews(user?.role);
  const items = NAV_ITEMS.filter((n) => views.includes(n.key) && !PRIMARY_MOBILE.some((p) => p.key === n.key));

  const list = (
    <nav aria-label="All sections" className={cn(side === "left" ? "scrollbar-slim h-[calc(100vh-7rem)] space-y-1 overflow-y-auto pr-1" : "grid grid-cols-3 gap-2 pt-2")}>
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.key}
            onClick={() => {
              setView(item.key);
              setOpen(false);
            }}
            className={cn(
              side === "left"
                ? "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all"
                : "flex flex-col items-center gap-1.5 rounded-2xl border border-white/40 p-3 text-[11px] font-medium dark:border-white/10",
              view === item.key ? "bg-primary/15 text-primary" : "hover:bg-accent/60"
            )}
          >
            <Icon className={cn(side === "left" ? "h-4 w-4" : "h-5 w-5 text-primary")} />
            <span className={side === "left" ? "" : "text-center leading-tight"}>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {trigger === "icon" ? (
          <Button variant="ghost" size="icon" aria-label="All sections" className="rounded-full glass hover:bg-transparent">
            <Menu className="h-5 w-5" />
          </Button>
        ) : (
          <button
            className={cn(
              "flex min-w-[56px] flex-col items-center gap-0.5 rounded-2xl px-2 py-1.5 text-[10px] font-medium text-muted-foreground transition-all",
              !PRIMARY_MOBILE.some((p) => p.key === view) && "text-primary"
            )}
            aria-label="All sections"
          >
            <Menu className="h-5 w-5" />
            More
          </button>
        )}
      </SheetTrigger>
      <SheetContent
        side={side}
        className={cn(
          "glass-strong border-white/40 dark:border-white/10",
          side === "left" ? "w-[280px] p-4" : "rounded-t-4xl px-4 pb-8 pt-4"
        )}
      >
        <SheetHeader className="p-0 pb-3">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" /> All sections
          </SheetTitle>
        </SheetHeader>
        {list}
      </SheetContent>
    </Sheet>
  );
}

function MobileBottomNav() {
  const view = useAppStore((s) => s.view);
  const setView = useAppStore((s) => s.setView);
  const user = useSession((s) => s.user);
  const views = allowedViews(user?.role);
  return (
    <nav
      aria-label="Primary mobile"
      className="fixed inset-x-3 bottom-3 z-40 flex items-center justify-between rounded-3xl glass-strong px-3 py-2 lg:hidden"
      style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
    >
      {PRIMARY_MOBILE.filter((p) => views.includes(p.key)).map(({ key, label, icon: Icon }) => {
        const active = view === key;
        return (
          <button
            key={key}
            onClick={() => setView(key)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-w-[56px] flex-col items-center gap-0.5 rounded-2xl px-2 py-1.5 text-[10px] font-medium transition-all",
              active ? "text-primary" : "text-muted-foreground"
            )}
          >
            <Icon className={cn("h-5 w-5", active && "drop-shadow")} />
            {label}
            {active && <span className="h-1 w-4 rounded-full brand-gradient" />}
          </button>
        );
      })}
      <MobileMore side="bottom" trigger="inline" />
    </nav>
  );
}

/* ---------------- Locked view ---------------- */

export function LockedView({ view }: { view: ViewKey }) {
  const setView = useAppStore((s) => s.setView);
  const item = NAV_ITEMS.find((n) => n.key === view);
  return (
    <GlassCard className="mx-auto mt-10 max-w-md p-8 text-center">
      <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl glass-inset text-primary">
        <Lock className="h-6 w-6" />
      </span>
      <h2 className="text-lg font-bold">{item?.label ?? "This section"} is limited</h2>
      <p className="mx-auto mt-1.5 max-w-xs text-sm text-muted-foreground">
        Your role doesn&apos;t include access here. Ask the Family Admin, or head back to your overview.
      </p>
      <Button className="brand-gradient mt-5 rounded-full text-white" onClick={() => setView("overview")}>
        Back to Overview
      </Button>
    </GlassCard>
  );
}

/* ---------------- Shell ---------------- */

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <SidebarNav />
      <div className="flex min-h-screen flex-col px-3 pb-24 sm:px-5 lg:ml-[252px] lg:pb-4">
        <Topbar />
        <main className="mx-auto w-full max-w-[1400px] flex-1">{children}</main>
        <footer className="mx-auto mt-auto w-full max-w-[1400px] pb-1 pt-8">
          <p className="text-center text-[11px] text-muted-foreground">
            HOME SYNC • One Home. One Family.
          </p>
        </footer>
      </div>
      <MobileBottomNav />
    </div>
  );
}
