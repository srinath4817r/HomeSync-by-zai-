"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SessionUser } from "./types";

interface SessionState {
  user: SessionUser | null;
  login: (user: SessionUser) => void;
  loginGuest: () => void;
  /** Patch the signed-in user (e.g. after editing their own profile). */
  updateUser: (patch: Partial<SessionUser>) => void;
  logout: () => void;
}

/**
 * Persisted client session — who is using the app.
 * Real accounts come from POST /api/auth/login or /api/auth/google; guests are local-only.
 */
export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      user: null,
      login: (user) => set({ user }),
      loginGuest: () =>
        set({
          user: {
            id: "guest",
            name: "Guest",
            email: null,
            role: "Guest",
            relation: "Guest",
            color: "#94a3b8",
            photoUrl: null,
            memberId: null,
            isGuest: true,
            provider: "guest",
            profileLocked: true,
          },
        }),
      updateUser: (patch) =>
        set((s) => (s.user ? { user: { ...s.user, ...patch } } : s)),
      logout: () => set({ user: null }),
    }),
    { name: "homesync-session" }
  )
);
