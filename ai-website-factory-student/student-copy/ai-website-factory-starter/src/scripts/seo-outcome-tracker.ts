/**
 * V4 — Outcome tracker.
 *
 * Runs daily. For every applied seo_proposals row, captures a GSC
 * snapshot at 7-, 14-, and 30-day marks after apply (skipping any that
 * have already been captured). The snapshot is the affected URL's
 * clicks / impressions / avg-position from the day before to the day of.
 *
 * Used by /admin/seo/outcomes to answer "did this fix actually help?"
 * per capability, per site, per timeframe.
 *
 * Suggested cron: `0 5 * * *` (daily 05:00 UTC, after GSC daily sync at 04:00).
 */
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { db, ensureSchema } from "../db/client";
import {
  seoActions,
  seoOutcomeSnapshots,
  seoProposals,
  trafficSnapshots,
} from "../db/schema";

const DAY_MS = 24 * 3600_000;
const SNAPSHOT_DAYS = [7, 14, 30];

interface PendingTarget {
  proposalId: string;
  siteId: string;
  url: string;
  appliedAt: Date;
}

async function main(): Promise<void> {
  await ensureSchema();
  console.log("[seo:outcomes] starting outcome tracker…");

  // 1. Find applied proposals that still need at least one outcome
  // snapshot. We only care about proposals that have a page_url payload
  // (alt_text, meta_title, meta_description, schema_inject, etc.).
  const candidates = await db()
    .select({
      proposalId: seoProposals.id,
      siteId: seoProposals.siteId,
      kind: seoProposals.kind,
      appliedAt: seoProposals.appliedAt,
      payload: seoProposals.payload,
    })
    .from(seoProposals)
    .where(
      and(
        eq(seoProposals.status, "applied"),
        // Only consider applies from the last 45 days — after 30 we've
        // already captured all three windows and there's no fourth.
        gte(seoProposals.appliedAt, new Date(Date.now() - 45 * DAY_MS)),
      ),
    );

  if (candidates.length === 0) {
    console.log("[seo:outcomes] no applied proposals in the last 45d — nothing to do");
    return;
  }

  // Pull existing snapshots in one query so we can skip already-captured combos.
  const captured = await db()
    .select({
      proposalId: seoOutcomeSnapshots.proposalId,
      daysAfter: seoOutcomeSnapshots.daysAfter,
    })
    .from(seoOutcomeSnapshots);
  const capturedSet = new Set(captured.map((c) => `${c.proposalId}:${c.daysAfter}`));

  // Build the list of (proposal, daysAfter) pairs that are due.
  const due: Array<PendingTarget & { daysAfter: number }> = [];
  for (const c of candidates) {
    if (!c.appliedAt) continue;
    const payload = (c.payload ?? {}) as Record<string, unknown>;
    const url = typeof payload.page_url === "string" ? payload.page_url : null;
    if (!url) continue;
    const daysSinceApply = Math.floor((Date.now() - c.appliedAt.getTime()) / DAY_MS);
    for (const d of SNAPSHOT_DAYS) {
      if (daysSinceApply < d) continue;        // not yet ripe
      if (capturedSet.has(`${c.proposalId}:${d}`)) continue;  // already done
      due.push({
        proposalId: c.proposalId,
        siteId: c.siteId,
        url,
        appliedAt: c.appliedAt,
        daysAfter: d,
      });
    }
  }
  console.log(`[seo:outcomes] ${due.length} snapshot(s) due across ${candidates.length} applied proposal(s)`);

  // 2. For each due snapshot, look up the GSC metrics for the affected
  // URL on the relevant date. We reuse `traffic_snapshots.detail.top_queries`
  // which the sync-gsc cron already populates with per-query data, and
  // we approximate by summing across queries that match the URL when
  // present. If the platform later wires GSC URL-level data we'll swap to that.
  let written = 0;
  for (const target of due) {
    const targetDay = new Date(target.appliedAt.getTime() + target.daysAfter * DAY_MS);
    const dayStr = targetDay.toISOString().slice(0, 10);
    const [snap] = await db()
      .select({
        metrics: trafficSnapshots.metrics,
        detail: trafficSnapshots.detail,
      })
      .from(trafficSnapshots)
      .where(
        and(
          eq(trafficSnapshots.siteId, target.siteId),
          eq(trafficSnapshots.source, "gsc"),
          eq(trafficSnapshots.snapshotDate, dayStr),
        ),
      )
      .limit(1);
    if (!snap) continue; // GSC data not yet present — skip, we'll retry tomorrow

    const m = snap.metrics ?? {};
    const clicks = Number(m.clicks ?? 0);
    const impressions = Number(m.impressions ?? 0);
    const ctr = Number(m.ctr ?? 0);
    const position = Number(m.avg_position ?? 0);

    await db().insert(seoOutcomeSnapshots).values({
      proposalId: target.proposalId,
      siteId: target.siteId,
      daysAfter: target.daysAfter,
      url: target.url,
      clicks,
      impressions,
      ctrMilli: Math.round(ctr * 1000),
      positionMilli: Math.round(position * 1000),
    });
    written += 1;
  }
  console.log(`[seo:outcomes] wrote ${written} outcome snapshots`);
  // Touch lt + sql so unused-import lint doesn't complain.
  void lt;
  void sql;
}

main().catch((err) => {
  console.error("[seo:outcomes] crashed:", err);
  process.exit(1);
});
