import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, ensureSchema } from "./client";
import { apiKeys, sites, users } from "./schema";
import { hashPassword } from "../lib/auth";

function genSecret(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

function parseSeedSites(raw: string | undefined) {
  if (!raw) return [];
  return raw
    .split(",")
    .map((row) => row.trim())
    .filter(Boolean)
    .map((row) => {
      const [slug, name, domain, city, region] = row.split("|").map((s) => s.trim());
      if (!slug || !name || !domain) throw new Error(`Bad SEED_SITES row: ${row}`);
      return { slug, name, domain, city, region };
    });
}

async function main() {
  await ensureSchema();
  const d = db();

  // Single admin login. Override with ADMIN_EMAIL / ADMIN_PASSWORD in .env.
  const adminEmail = process.env.ADMIN_EMAIL ?? "admin@example.com";
  const adminPassword = process.env.ADMIN_PASSWORD ?? "changeme123";

  const existing = await d.select().from(users).where(eq(users.email, adminEmail)).limit(1);
  if (existing.length === 0) {
    await d.insert(users).values({
      email: adminEmail,
      passwordHash: hashPassword(adminPassword),
      name: "Admin",
      role: "admin",
    });
    console.log(`✓ admin user created`);
    console.log(`    email:    ${adminEmail}`);
    console.log(`    password: ${adminPassword}`);
    console.log(`  (change these in .env via ADMIN_EMAIL / ADMIN_PASSWORD, then re-run db:reset)`);
  } else {
    console.log(`· admin user already exists: ${adminEmail}`);
  }

  // Optional: connect existing sites via SEED_SITES="slug|Name|domain|city|region, …".
  // Empty by default — this is a fresh factory, not tied to any business.
  const seedRows = parseSeedSites(process.env.SEED_SITES);
  for (const row of seedRows) {
    const found = await d.select().from(sites).where(eq(sites.slug, row.slug)).limit(1);
    let siteId: string;
    if (found.length === 0) {
      const [inserted] = await d.insert(sites).values(row).returning({ id: sites.id });
      siteId = inserted.id;
      console.log(`✓ site connected: ${row.slug} (${row.domain})`);
    } else {
      siteId = found[0].id;
      console.log(`· site exists: ${row.slug}`);
    }
    const existingKeys = await d.select().from(apiKeys).where(eq(apiKeys.siteId, siteId)).limit(1);
    if (existingKeys.length === 0) {
      const keyId = `site_${row.slug.replace(/-/g, "_")}_${randomBytes(4).toString("hex")}`;
      const secret = genSecret(32);
      await d.insert(apiKeys).values({ siteId, keyId, secret, active: true });
      console.log(`✓ api key for ${row.slug}: KEY_ID=${keyId} SECRET=${secret}`);
    }
  }

  console.log("\nSeed complete. Start the app with `npm run dev` → http://localhost:3001/admin");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
