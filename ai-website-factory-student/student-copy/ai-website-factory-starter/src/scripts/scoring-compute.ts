/**
 * P1 — Daily composite score compute.
 *
 * Iterates every connected site, computes all six scores via
 * `computeAllScores()`, and upserts rows into `site_scores` keyed by
 * (siteId, scoreKey, snapshotDate). Idempotent: re-running on the same
 * day overwrites that day's value.
 *
 * Usage:
 *   npm run scoring:compute                # every active site
 *   npm run scoring:compute -- --site=slug # one site
 *
 * Cron: 04:45 UTC (after sync:gsc 04:00, before sync:ga4 04:30 has
 * propagated traffic_snapshots, so we run at 04:45).
 */
import { eq, sql } from "drizzle-orm";
import { db, ensureSchema } from "../db/client";
import { siteScores, sites } from "../db/schema";
import { computeAllScores } from "../lib/scoring";

function arg(name: string): string | undefined {
  const flag = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(flag));
  return hit ? hit.slice(flag.length) : undefined;
}

async function computeForSite(site: { id: string; slug: string; domain: string }, snapshotDate: string) {
  const scores = await computeAllScores(site.id, site.domain, new Date());
  for (const s of scores) {
    await db()
      .insert(siteScores)
      .values({
        siteId: site.id,
        scoreKey: s.key,
        value: s.value,
        inputs: s.inputs,
        snapshotDate,
      })
      .onConflictDoUpdate({
        target: [siteScores.siteId, siteScores.scoreKey, siteScores.snapshotDate],
        set: {
          value: s.value,
          inputs: s.inputs,
        },
      });
  }
  return scores;
}

async function main() {
  await ensureSchema();
  const onlySlug = arg("site");
  const snapshotDate = arg("date") ?? new Date().toISOString().slice(0, 10);

  const rows = onlySlug
    ? await db().select().from(sites).where(eq(sites.slug, onlySlug))
    : await db().select().from(sites);

  if (rows.length === 0) {
    console.warn(onlySlug ? `[scoring] site '${onlySlug}' not found` : "[scoring] no active sites — nothing to do");
    return;
  }

  let okCount = 0;
  let failCount = 0;
  for (const site of rows) {
    try {
      const scores = await computeForSite(site, snapshotDate);
      okCount++;
      const summary = scores.map((s) => `${s.key.split("_")[0]}=${s.value}`).join(" ");
      console.log(`[scoring] ${site.slug}  ${summary}`);
    } catch (err) {
      failCount++;
      console.error(`[scoring] ${site.slug} — failed:`, err instanceof Error ? err.message : err);
    }
  }
  console.log(`[scoring] done — ${okCount} ok, ${failCount} failed, date=${snapshotDate}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[scoring] fatal", err);
    process.exit(1);
  });
