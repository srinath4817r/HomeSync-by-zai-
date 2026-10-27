"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  CalendarDays,
  Compass,
  FolderLock,
  LayoutDashboard,
  ListChecks,
  MapPinned,
  Package,
  Pill,
  ReceiptText,
  Settings,
  ShoppingBasket,
  Sparkles,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import type { ViewKey } from "./types";

export type QuickAddKind =
  | "task"
  | "grocery"
  | "medicine"
  | "event"
  | "bill"
  | "doc"
  | "inventory"
  | null;

interface AppState {
  view: ViewKey;
  setView: (v: ViewKey) => void;
  quickAdd: QuickAddKind;
  /** navigate to a view and auto-open its add dialog once */
  requestQuickAdd: (view: ViewKey, kind: NonNullable<QuickAddKind>) => void;
  consumeQuickAdd: () => QuickAddKind;
  elderlyMode: boolean;
  setElderlyMode: (on: boolean) => void;
  assistantOpen: boolean;
  setAssistantOpen: (open: boolean) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      view: "overview",
      setView: (view) => set({ view }),
      quickAdd: null,
      requestQuickAdd: (view, kind) => set({ view, quickAdd: kind }),
      consumeQuickAdd: () => {
        const k = get().quickAdd;
        if (k) set({ quickAdd: null });
        return k;
      },
      elderlyMode: false,
      setElderlyMode: (elderlyMode) => set({ elderlyMode }),
      assistantOpen: false,
      setAssistantOpen: (assistantOpen) => set({ assistantOpen }),
    }),
    {
      name: "homesync-app",
      partialize: (s) => ({ elderlyMode: s.elderlyMode }),
    }
  )
);

export const NAV_ITEMS: { key: ViewKey; label: string; icon: LucideIcon }[] = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "calendar", label: "Calendar", icon: CalendarDays },
  { key: "tasks", label: "Tasks", icon: ListChecks },
  { key: "groceries", label: "Groceries", icon: ShoppingBasket },
  { key: "care", label: "Care & Medicine", icon: Pill },
  { key: "map", label: "Family Map", icon: MapPinned },
  { key: "nearby", label: "Nearby Services", icon: Compass },
  { key: "members", label: "Family Members", icon: UsersRound },
  { key: "bills", label: "Bills & Expenses", icon: ReceiptText },
  { key: "documents", label: "Documents", icon: FolderLock },
  { key: "inventory", label: "Home Inventory", icon: Package },
  { key: "assistant", label: "AI Assistant", icon: Sparkles },
  { key: "settings", label: "Settings", icon: Settings },
];
