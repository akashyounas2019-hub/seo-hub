/**
 * Weekly health-sweep cron — queues one audit:network_health job per site.
 *
 * Mac worker drains the queue, runs the orchestrator on the operator's
 * Claude Code subscription (zero API spend), and POSTs the resulting JSON
 * to /api/health/ingest-run. The digest cron runs a few hours later.
 *
 * Suggested cron entry (gyl-platform/deploy/crontab):
 *   0 6 * * MON  cd /app && npm run health:sweep >> /var/log/gyl/health-sweep.log 2>&1
 */
import { and, eq } from "drizzle-orm";
import { ensureSchema, db } from "../db/client";
import { claudeJobs, sites, sitePages } from "../db/schema";
import { inferPageType } from "../lib/section-schema";

async function main() {
  await ensureSchema();
  const all = await db().select().from(sites);
  if (all.length === 0) {
    console.log("[health-sweep] no sites — nothing to queue");
    process.exit(0);
  }

  // One job per site (so failures + retries are isolated).
  let sectionWatchQueued = 0;
  for (const s of all) {
    await db().insert(claudeJobs).values({
      kind: "audit:network_health",
      title: `Weekly audit · ${s.name}`,
      input: { sites: s.domain, siteIds: [s.id], cron: true },
      status: "pending",
      priority: "normal",
      preferWorker: "mac",
      createdBy: null,
    });

    // Also queue a Section Watch ($0 vision) job per site: pick one
    // representative published page per inferred page-type so the worker only
    // captures a handful of pages, not the whole site.
    const pages = await db()
      .select({ url: sitePages.url, postType: sitePages.postType })
      .from(sitePages)
      .where(and(eq(sitePages.siteId, s.id), eq(sitePages.status, "publish")));
    const byType = new Map<string, { url: string; pageType: string }>();
    for (const p of pages) {
      const pageType = inferPageType(p.url, p.postType);
      if (pageType === "other") continue;
      if (!byType.has(pageType)) byType.set(pageType, { url: p.url, pageType });
    }
    const reps = byType.size > 0
      ? Array.from(byType.values())
      : [{ url: `https://${s.domain}/`, pageType: "home" }];
    await db().insert(claudeJobs).values({
      kind: "audit:section_watch",
      title: `Section watch — ${s.slug}`,
      siteId: s.id,
      input: { siteId: s.id, pages: reps, cron: true },
      status: "pending",
      priority: "normal",
      preferWorker: "mac",
      createdBy: null,
    });
    sectionWatchQueued += 1;
  }

  console.log(`[health-sweep] queued ${all.length} audit job(s) + ${sectionWatchQueued} section-watch job(s)`);
}

main().catch((err) => {
  console.error("[health-sweep] fatal:", err);
  process.exit(1);
});
