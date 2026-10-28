import { db } from "@/lib/db";
import type { Member as DbMember, LocationPing } from "@prisma/client";

/**
 * Shared server-side helpers for family-scoped resources.
 * Every route: authenticate → scope by familyId → serialize in the shape
 * the frontend expects. The server is the only source of truth.
 */

export type MemberWithExtras = DbMember & { lastPing?: LocationPing | null };

/** Serialize a household profile into the client `Member` shape. */
export function serializeMember(m: MemberWithExtras) {
  return {
    id: m.id,
    name: m.name,
    relation: m.relation,
    role: m.role,
    color: m.color,
    isAdmin: m.isAdmin,
    locationSharing: m.locationSharing,
    locationLabel: m.placeLabel,
    locationUpdatedAt: m.lastPing?.capturedAt?.toISOString() ?? null,
    photoUrl: m.photoUrl,
    userId: m.userId,
    lastPing: m.lastPing
      ? {
          lat: m.lastPing.lat,
          lng: m.lastPing.lng,
          accuracyM: m.lastPing.accuracyM,
          capturedAt: m.lastPing.capturedAt.toISOString(),
          receivedAt: m.lastPing.receivedAt.toISOString(),
        }
      : null,
    createdAt: m.createdAt.toISOString(),
  };
}

/** Latest real GPS ping per member (consent already applied by caller). */
export async function latestPingsByMember(
  memberIds: string[]
): Promise<Map<string, LocationPing>> {
  const map = new Map<string, LocationPing>();
  if (memberIds.length === 0) return map;
  const pings = await db.locationPing.findMany({
    where: { memberId: { in: memberIds } },
    orderBy: { capturedAt: "desc" },
    take: 400,
  });
  for (const p of pings) {
    if (!map.has(p.memberId)) map.set(p.memberId, p);
  }
  return map;
}

/** Fetch the caller's household profiles for a family. */
export async function familyMembers(familyId: string) {
  const members = await db.member.findMany({
    where: { familyId },
    orderBy: { createdAt: "asc" },
  });
  const pings = await latestPingsByMember(members.map((m) => m.id));
  return members.map((m) => serializeMember({ ...m, lastPing: pings.get(m.id) ?? null }));
}

/** Append to the family activity feed (actor always from the server session). */
export async function logActivity(
  familyId: string,
  actor: { id: string; name: string },
  action: string,
  target: string
) {
  await db.activityLog.create({
    data: { familyId, actorId: actor.id, actor: actor.name, action, target },
  });
}

const MUTED_COLORS = ["#64748b", "#8f7a99", "#6f9a80", "#a89462", "#6889a8", "#a8836a"];

/** Pick a stable muted color for new profiles. */
export function pickColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return MUTED_COLORS[h % MUTED_COLORS.length];
}
