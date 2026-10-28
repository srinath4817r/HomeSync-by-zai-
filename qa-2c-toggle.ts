/* Temporary state toggler for honest-state verification. */
import { db } from "./src/lib/db";

const mode = process.argv[2] ?? "strip";

const user = await db.appUser.findUnique({ where: { email: "qa2c@test.local" } });
if (!user) throw new Error("qa2c user missing");
const family = await db.family.findFirst({ where: { name: "QA2C Home" } });
if (!family) throw new Error("QA2C family missing");

if (mode === "strip") {
  // No-family state for assistant 403 test.
  await db.membership.deleteMany({ where: { userId: user.id, familyId: family.id } });
  // No-home-coords state for weather 404 test.
  await db.family.update({ where: { id: family.id }, data: { homeLat: null, homeLng: null } });
  console.log("stripped: membership + home coords removed");
} else {
  await db.membership.create({
    data: { userId: user.id, familyId: family.id, role: "Family Admin", status: "active" },
  });
  await db.family.update({
    where: { id: family.id },
    data: { homeLat: 13.0827, homeLng: 80.2707 },
  });
  console.log("restored: membership + home coords back");
}
process.exit(0);
