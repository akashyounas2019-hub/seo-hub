import { eq } from "drizzle-orm";
import { db, ensureSchema } from "../src/db/client";
import { users, sessions } from "../src/db/schema";
import { hashPassword } from "../src/lib/auth";

async function main() {
  const email = process.env.ADMIN_EMAIL ?? "admin@example.com";
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    console.error("ADMIN_PASSWORD env var required");
    process.exit(1);
  }

  await ensureSchema();
  const d = db();
  const result = await d
    .update(users)
    .set({ passwordHash: hashPassword(password) })
    .where(eq(users.email, email))
    .returning({ id: users.id, email: users.email });

  if (result.length === 0) {
    console.error(`no user found with email ${email}`);
    process.exit(1);
  }

  // revoke any open sessions so the old password can't be reused
  await d.delete(sessions).where(eq(sessions.userId, result[0].id));
  console.log(`✓ password updated for ${result[0].email}; sessions revoked`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
