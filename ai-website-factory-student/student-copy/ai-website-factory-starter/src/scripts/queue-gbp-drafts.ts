/**
 * One-shot: queue a gbp:draft_posts job for a single site.
 *
 * Usage: npm run gbp:queue -- --site=<domain> [--weeks=4]
 *
 * The Mac worker picks it up, drafts the posts via Claude CLI, and POSTs
 * them to /api/gbp/ingest-drafts. They land at /admin/gbp as drafts.
 */
import { eq } from "drizzle-orm";
import { db, ensureSchema } from "../db/client";
import { claudeJobs, sites } from "../db/schema";

function parseFlag(flag: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`--${flag}=`));
  return arg?.slice(flag.length + 3);
}

async function main() {
  await ensureSchema();
  const site = parseFlag("site");
  const weekCount = Number(parseFlag("weeks") ?? "4");
  if (!site) {
    console.error("usage: npm run gbp:queue -- --site=<domain> [--weeks=N]");
    process.exit(1);
  }
  const [row] = await db().select({ id: sites.id, domain: sites.domain })
    .from(sites).where(eq(sites.domain, site)).limit(1);
  if (!row) {
    console.error(`no site matched domain=${site}`);
    process.exit(1);
  }
  const [job] = await db().insert(claudeJobs).values({
    kind: "gbp:draft_posts",
    title: `GBP drafts · ${row.domain} · ${weekCount}w`,
    input: { siteId: row.id, domain: row.domain, weekCount },
    status: "pending",
    priority: "normal",
    preferWorker: "mac",
  }).returning();
  console.log(`[gbp:queue] queued job ${job.id} for ${row.domain} (${weekCount} weeks)`);
}

main().catch((err) => {
  console.error("[gbp:queue] failed:", err);
  process.exit(1);
});
