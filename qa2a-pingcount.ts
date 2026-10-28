import { db } from "./src/lib/db";
async function main() {
  const u = await db.appUser.findUnique({ where: { email: "qa2a@test.local" } });
  const m = await db.member.findFirst({ where: { userId: u!.id } });
  console.log("pings:", await db.locationPing.count({ where: { memberId: m!.id } }));
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
