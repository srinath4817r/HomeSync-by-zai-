"use client";

import { useSyncExternalStore } from "react";
import { AuroraBackground } from "@/components/homesync/aurora";
import { Shell, LockedView } from "@/components/homesync/shell";
import { LoginScreen } from "@/components/homesync/login-screen";
import { OverviewView } from "@/components/homesync/views/overview-view";
import { CalendarView } from "@/components/homesync/views/calendar-view";
import { TasksView } from "@/components/homesync/views/tasks-view";
import { GroceriesView } from "@/components/homesync/views/groceries-view";
import { CareView } from "@/components/homesync/views/care-view";
import { MapView } from "@/components/homesync/views/map-view";
import { NearbyView } from "@/components/homesync/views/nearby-view";
import { MembersView } from "@/components/homesync/views/members-view";
import { BillsView } from "@/components/homesync/views/bills-view";
import { DocumentsView } from "@/components/homesync/views/documents-view";
import { InventoryView } from "@/components/homesync/views/inventory-view";
import { AssistantView } from "@/components/homesync/views/assistant-view";
import { SettingsView } from "@/components/homesync/views/settings-view";
import { useAppStore } from "@/lib/homesync/store";
import { useSession } from "@/lib/homesync/session";
import { canAccess } from "@/lib/homesync/roles";

const subscribeNoop = () => () => {};
function useMounted() {
  return useSyncExternalStore(subscribeNoop, () => true, () => false);
}

function Splash() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <span className="h-9 w-9 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
    </div>
  );
}

function ActiveView() {
  const view = useAppStore((s) => s.view);
  const user = useSession((s) => s.user);

  // role-based access: who is using the app decides what they can open
  if (user && !canAccess(user.role, view)) {
    return <LockedView view={view} />;
  }

  switch (view) {
    case "calendar":
      return <CalendarView />;
    case "tasks":
      return <TasksView />;
    case "groceries":
      return <GroceriesView />;
    case "care":
      return <CareView />;
    case "map":
      return <MapView />;
    case "nearby":
      return <NearbyView />;
    case "members":
      return <MembersView />;
    case "bills":
      return <BillsView />;
    case "documents":
      return <DocumentsView />;
    case "inventory":
      return <InventoryView />;
    case "assistant":
      return <AssistantView />;
    case "settings":
      return <SettingsView />;
    case "overview":
    default:
      return <OverviewView />;
  }
}

export default function Home() {
  const mounted = useMounted();
  const user = useSession((s) => s.user);

  if (!mounted) {
    return <Splash />;
  }

  // gate: no session -> liquid glass login (with guest path)
  if (!user) {
    return (
      <>
        <AuroraBackground />
        <LoginScreen />
      </>
    );
  }

  return (
    <>
      <AuroraBackground />
      <Shell>
        <div className="pop-in">
          <ActiveView />
        </div>
      </Shell>
    </>
  );
}
