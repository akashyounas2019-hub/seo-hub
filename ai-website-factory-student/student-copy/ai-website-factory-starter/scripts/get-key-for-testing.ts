import { eq } from "drizzle-orm";
import { db, ensureSchema } from "../src/db/client";
import { apiKeys, sites } from "../src/db/schema";

async function main() {
  await ensureSchema();
  const slug = process.argv[2] ?? "aiwebfactory";
  const [site] = await db().select().from(sites).where(eq(sites.slug, slug)).limit(1);
  if (!site) {
    console.error(`site ${slug} not found`);
    process.exit(1);
  }
  const keys = await db()
    .select({ keyId: apiKeys.keyId, secret: apiKeys.secret, active: apiKeys.active })
    .from(apiKeys)
    .where(eq(apiKeys.siteId, site.id));
  console.log(JSON.stringify({ slug, siteId: site.id, keys }, null, 2));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
