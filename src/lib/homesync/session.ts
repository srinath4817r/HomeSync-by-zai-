"use client";

import { create } from "zustand";
import type { FamilyInfo, SessionUser } from "./types";

interface SessionState {
  user: SessionUser | null;
  family: FamilyInfo | null;
  /** True once GET /api/auth/me has answered at least once. */
  hydrated: boolean;
  /** Pull the server-verified session (single source of truth). */
  hydrate: () => Promise<void>;
  /** Used right after Google sign-in to seed the cache (server already set the cookie). */
  applyAuth: (payload: {
    user: { id: string; name: string; email: string; photoUrl: string | null };
    membership: { role: string; status: string; familyId: string } | null;
  }) => void;
  setFamily: (family: FamilyInfo | null) => void;
  /** Patch the signed-in user (e.g. after editing their own profile). */
  updateUser: (patch: Partial<SessionUser>) => void;
  /** Real sign-out — invalidates the server session, then clears the cache. */
  logout: () => Promise<void>;
}

function toSessionUser(
  u: { id: string; name: string; email: string; photoUrl: string | null },
  membership: { role: string; status: string; familyId: string } | null
): SessionUser {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    photoUrl: u.photoUrl,
    role: membership?.status === "active" ? membership.role : "None",
    relation: "Member",
    color: "#64748b",
    memberId: null,
    familyId: membership?.familyId ?? null,
    status: (membership?.status as SessionUser["status"]) ?? "none",
    isGuest: false,
    provider: "google",
    profileLocked: false,
  };
}

export const useSession = create<SessionState>()((set) => ({
  user: null,
  family: null,
  hydrated: false,

  hydrate: async () => {
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as {
        user: { id: string; name: string; email: string; photoUrl: string | null } | null;
        membership: { role: string; status: string; familyId: string } | null;
        family: FamilyInfo | null;
      };
      if (data.user) {
        set({
          user: toSessionUser(data.user, data.membership),
          family: data.family,
          hydrated: true,
        });
        // Resolve the linked household profile id (for self-service actions).
        if (data.family) {
          void fetch("/api/members", { cache: "no-store" })
            .then((r) => (r.ok ? r.json() : null))
            .then((d: { id: string; userId: string | null }[] | null) => {
              const mine = Array.isArray(d) ? d.find((m) => m.userId === data.user!.id) : undefined;
              if (mine) set((s) => (s.user ? { user: { ...s.user, memberId: mine.id } } : s));
            })
            .catch(() => undefined);
        }
      } else {
        set({ user: null, family: null, hydrated: true });
      }
    } catch {
      set({ hydrated: true });
    }
  },

  applyAuth: (payload) => {
    set({
      user: toSessionUser(payload.user, payload.membership),
      family: null,
      hydrated: true,
    });
  },

  setFamily: (family) => {
    set((s) => ({
      family,
      user: family
        ? s.user
          ? { ...s.user, familyId: family.id, status: "active", role: s.user.role === "None" ? "Family Admin" : s.user.role }
          : s.user
        : s.user,
    }));
  },

  updateUser: (patch) => set((s) => (s.user ? { user: { ...s.user, ...patch } } : s)),

  logout: async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      /* clear locally regardless */
    }
    set({ user: null, family: null, hydrated: true });
  },
}));
