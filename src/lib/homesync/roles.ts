// HOME SYNC — role-based access control (server-enforced for writes; this shapes the UI)

import type { ViewKey } from "./types";

export const ALL_VIEWS: ViewKey[] = [
  "overview",
  "calendar",
  "tasks",
  "groceries",
  "care",
  "map",
  "nearby",
  "members",
  "bills",
  "documents",
  "inventory",
  "assistant",
  "settings",
];

export const FAMILY_ROLES = [
  "Family Admin",
  "Parent",
  "Senior Member",
  "Child",
  "Caregiver",
  "Member",
] as const;

/**
 * Which sections each role can open. The SERVER independently enforces the
 * sensitive operations — this only shapes navigation.
 * - Family Admin: everything
 * - Parent: everything except family admin settings
 * - Caregiver: daily care + household basics
 * - Senior Member: daily life sections, no bills/documents/settings
 * - Child: kid-safe basics
 * - Member: household basics
 */
export const ROLE_VIEWS: Record<string, ViewKey[]> = {
  "Family Admin": ALL_VIEWS,
  Parent: [
    "overview",
    "calendar",
    "tasks",
    "groceries",
    "care",
    "map",
    "nearby",
    "members",
    "bills",
    "documents",
    "inventory",
    "assistant",
  ],
  Caregiver: [
    "overview",
    "calendar",
    "tasks",
    "groceries",
    "care",
    "map",
    "nearby",
    "assistant",
  ],
  "Senior Member": [
    "overview",
    "calendar",
    "tasks",
    "groceries",
    "care",
    "map",
    "nearby",
    "members",
    "inventory",
    "assistant",
  ],
  Member: [
    "overview",
    "calendar",
    "tasks",
    "groceries",
    "care",
    "map",
    "nearby",
    "assistant",
  ],
  Child: ["overview", "calendar", "tasks", "groceries", "map", "nearby", "assistant"],
};

/** Roles that can only look, not modify (no add buttons / check-offs). */
const READ_ONLY_ROLES = new Set(["Child"]);

export function canAccess(role: string | undefined, view: ViewKey): boolean {
  const allowed = ROLE_VIEWS[role ?? "Member"] ?? ROLE_VIEWS.Member;
  return allowed.includes(view);
}

export function allowedViews(role: string | undefined): ViewKey[] {
  return ROLE_VIEWS[role ?? "Member"] ?? ROLE_VIEWS.Member;
}

export function canWrite(role: string | undefined): boolean {
  return !READ_ONLY_ROLES.has(role ?? "Member");
}

export function roleBadge(role: string | undefined): string {
  switch (role) {
    case "Family Admin":
      return "Full access";
    case "Parent":
      return "Co-admin access";
    case "Caregiver":
      return "Care-focused access";
    case "Senior Member":
      return "Home & care access";
    case "Child":
      return "Kid-safe access";
    default:
      return "Household access";
  }
}
