// HOME SYNC — role-based access control (who is using the app decides what they see)

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

/**
 * Which sections each role can open.
 * - Family Admin: everything (settings included)
 * - Parent (Co-Admin): everything except app Settings
 * - Senior Member: daily life sections, no bills/documents/settings
 * - Child: school + home basics only
 * - Guest: read-only preview (overview, map, nearby, assistant)
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
  Child: ["overview", "calendar", "tasks", "groceries", "map", "nearby", "assistant"],
  Guest: ["overview", "map", "nearby", "assistant"],
};

/** Roles that can only look, not modify (no add buttons / check-offs). */
const READ_ONLY_ROLES = new Set(["Child", "Guest"]);

export function canAccess(role: string | undefined, view: ViewKey): boolean {
  const allowed = ROLE_VIEWS[role ?? "Guest"] ?? ROLE_VIEWS.Guest;
  return allowed.includes(view);
}

export function allowedViews(role: string | undefined): ViewKey[] {
  return ROLE_VIEWS[role ?? "Guest"] ?? ROLE_VIEWS.Guest;
}

export function canWrite(role: string | undefined): boolean {
  return !READ_ONLY_ROLES.has(role ?? "Guest");
}

export function roleBadge(role: string | undefined): string {
  switch (role) {
    case "Family Admin":
      return "Full access";
    case "Parent":
      return "Co-admin access";
    case "Senior Member":
      return "Home & care access";
    case "Child":
      return "Kid-safe access";
    default:
      return "Preview only";
  }
}
