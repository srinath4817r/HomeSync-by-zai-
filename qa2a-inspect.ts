import { db } from "./src/lib/db";
async function main() {
  const fams = await db.family.findMany({ include: { members: true, memberships: true } });
  for (const f of fams) {
    console.log(JSON.stringify({ id: f.id, name: f.name, homeLabel: f.homeLabel, homeLat: f.homeLat, capacity: f.capacity, members: f.members.map(m => m.name), memberships: f.memberships.map(m => ({ role: m.role, status: m.status })) }));
  }
  const users = await db.appUser.findMany({ select: { email: true, name: true } });
  console.log("users:", JSON.stringify(users));
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
