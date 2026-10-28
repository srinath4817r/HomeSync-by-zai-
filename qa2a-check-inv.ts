import { db } from "./src/lib/db";
async function main() {
  const invs = await db.invitation.findMany();
  console.log("invitations:", JSON.stringify(invs.map((i) => ({ code: i.code, revokedAt: i.revokedAt, expiresAt: i.expiresAt }))));
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
