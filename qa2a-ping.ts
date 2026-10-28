import { db } from "./src/lib/db";
async function main() {
  const u = await db.appUser.findUnique({ where: { email: "qa2a@test.local" } });
  const m = await db.member.findFirst({ where: { userId: u!.id } });
  await db.locationPing.create({ data: { familyId: m!.familyId, memberId: m!.id, lat: 13.08, lng: 80.27, capturedAt: new Date(), receivedAt: new Date() } });
  const count = await db.locationPing.count({ where: { memberId: m!.id } });
  console.log("pings now:", count);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
