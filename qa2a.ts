import { db } from "./src/lib/db";
import { createHash, randomBytes } from "crypto";
async function main() {
  const user = await db.appUser.upsert({ where: { email: "qa2a@test.local" }, update: {}, create: { email: "qa2a@test.local", googleId: "qa2a", name: "QA Two A" } });
  const fam = await db.family.create({ data: { name: "QA2A Home", createdById: user.id, capacity: 8, homeLabel: null, homeLat: 13.08, homeLng: 80.27 } });
  await db.membership.create({ data: { userId: user.id, familyId: fam.id, role: "Family Admin", status: "active" } });
  await db.member.create({ data: { familyId: fam.id, userId: user.id, name: "QA Two A", relation: "Me", role: "Family Admin", color: "#64748b", isAdmin: true } });
  const token = randomBytes(32).toString("hex");
  await db.session.create({ data: { tokenHash: createHash("sha256").update(token).digest("hex"), userId: user.id, expiresAt: new Date(Date.now() + 3600_000) } });
  console.log(token);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
