/**
 * Weekly keyword-rank sweep.
 *
 * For each enabled tracked_keywords row grouped by site, drops one
 * track:keyword_ranks job (preferWorker='mac'). Run from cron Monday 7am.
 *
 * After the worker reports back via /api/keyword-ranks/ingest, the
 * recommender flips the worst offenders into fix_proposals.
 */
import { eq, sql } from "drizzle-orm";
import { db, ensureSchema } from "../db/client";
import { claudeJobs, keywordRankSnapshots, sites, trackedKeywords } from "../db/schema";
import { recommendKeywordRefreshes } from "../lib/keyword-refresh-recommender";
import { resolveRanksViaSiteKit } from "../lib/sitekit-rank-resolver";

function isoMonday(d = new Date()): string {
  const day = d.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day; // back to Mon
  const mon = new Date(d.getTime() + diff * 86400000);
  return mon.toISOString().slice(0, 10);
}

async function main() {
  await ensureSchema();
  const weekOf = isoMonday();

  const rows = await db()
    .select({
      siteId: trackedKeywords.siteId,
      id: trackedKeywords.id,
      keyword: trackedKeywords.keyword,
      targetUrl: trackedKeywords.targetUrl,
      location: trackedKeywords.location,
      device: trackedKeywords.device,
      domain: sites.domain,
    })
    .from(trackedKeywords)
    .leftJoin(sites, eq(sites.id, trackedKeywords.siteId))
    .where(eq(trackedKeywords.enabled, true));

  if (rows.length === 0) {
    console.log("[rank-sweep] no enabled tracked keywords");
    return;
  }

  const bySite = new Map<string, typeof rows>();
  for (const r of rows) {
    if (!bySite.has(r.siteId)) bySite.set(r.siteId, []);
    bySite.get(r.siteId)!.push(r);
  }

  let queued = 0;
  let siteKitWritten = 0;
  for (const [siteId, kws] of bySite) {
    const domain = kws[0].domain;

    if (domain) {
      // Try Site Kit (via gyl-bookings plugin) first. If the plugin can't
      // resolve (Site Kit missing, GSC not connected on that site, HTTP
      // failure), fall back to the worker DDG scrape.
      const sk = await resolveRanksViaSiteKit({
        siteId,
        domain,
        keywords: kws.map((k) => ({ id: k.id, keyword: k.keyword, targetUrl: k.targetUrl })),
      });
      if (sk.ok) {
        for (const r of sk.readings) {
          await db().insert(keywordRankSnapshots).values({
            trackedKeywordId: r.trackedKeywordId,
            siteId,
            weekOf,
            position: r.position == null ? null : String(r.position),
            url: r.url,
            source: r.source,
            raw: r.raw as never,
          }).onConflictDoUpdate({
            target: [keywordRankSnapshots.trackedKeywordId, keywordRankSnapshots.weekOf],
            set: {
              position: r.position == null ? null : String(r.position),
              url: r.url,
              source: r.source,
              raw: r.raw as never,
              capturedAt: new Date(),
            },
          });

          const pos = r.position;
          await db().update(trackedKeywords).set({
            lastCheckedAt: new Date(),
            lastPosition: pos == null ? null : String(pos),
            weeksOffP1: sql`CASE WHEN ${pos ?? 999} <= 10 THEN 0 ELSE weeks_off_p1 + 1 END`,
            weeksOffP2: sql`CASE WHEN ${pos ?? 999} <= 20 THEN 0 ELSE weeks_off_p2 + 1 END`,
            weeksOffP3: sql`CASE WHEN ${pos ?? 999} <= 30 THEN 0 ELSE weeks_off_p3 + 1 END`,
          }).where(eq(trackedKeywords.id, r.trackedKeywordId));
          siteKitWritten++;
        }
        console.log(`[rank-sweep] ${domain}: Site Kit resolved ${sk.readings.length} keywords`);
        continue;
      }
      console.log(`[rank-sweep] ${domain}: Site Kit unavailable (${sk.reason}); falling back to DDG`);
    }

    // Fall back to worker DDG scrape.
    await db().insert(claudeJobs).values({
      kind: "track:keyword_ranks",
      title: `Rank sweep · ${domain ?? siteId} · ${weekOf}`,
      input: {
        siteId,
        weekOf,
        host: domain,
        keywords: kws.map((k) => ({
          id: k.id,
          keyword: k.keyword,
          targetUrl: k.targetUrl,
          location: k.location,
          device: k.device,
        })),
      },
      status: "pending",
      priority: "normal",
      preferWorker: "mac",
    });
    queued++;
  }
  console.log(`[rank-sweep] week ${weekOf}: Site Kit wrote ${siteKitWritten} readings, queued ${queued} DDG worker jobs`);

  // After sweep, the recommender will fire on next cron tick once readings land.
  const { proposed } = await recommendKeywordRefreshes();
  console.log(`[rank-sweep] recommender proposed ${proposed} refresh job(s)`);
}

main().catch((err) => {
  console.error("[rank-sweep] failed:", err);
  process.exit(1);
});
