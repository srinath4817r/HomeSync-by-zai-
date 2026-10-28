import { db } from "./src/lib/db";
async function main() {
  const u = await db.appUser.findUnique({ where: { email: "qa2a@test.local" } });
  if (!u) throw new Error("no user");
  const fam = await db.family.findFirst({ where: { name: "QA2A Home Sweet" } });
  await db.notification.createMany({ data: [
    { userId: u.id, familyId: fam!.id, title: "Welcome home", body: "Your family space is ready.", link: "members" },
    { userId: u.id, familyId: fam!.id, title: "Bill reminder", body: "Internet bill is due tomorrow.", link: null },
  ]});
  console.log("inserted");
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
