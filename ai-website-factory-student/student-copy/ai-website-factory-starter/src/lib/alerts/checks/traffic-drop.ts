/**
 * traffic_drop — flags sites whose latest day's GSC clicks dropped well below
 * their 7-day median. Relies on `traffic_snapshots` populated by the GSC sync
 * worker (see CLAUDE.md Phase 4).
 *
 * Severity:
 *   - drop ≥ 50% vs median → critical
 *   - drop ≥ 30% → error
 *   - drop ≥ 15% → warn
 */
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { sites, trafficSnapshots } from "@/db/schema";
import type { CheckResult, AlertCandidate } from "../check-engine";
import { getRuleConfig } from "../check-engine";

const LOOKBACK_DAYS = 7;

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export async function run(): Promise<CheckResult> {
  const startedAt = Date.now();
  const candidates: AlertCandidate[] = [];
  const allSites = await db().select({ id: sites.id, name: sites.name, slug: sites.slug }).from(sites);

  const sinceDate = new Date(Date.now() - (LOOKBACK_DAYS + 1) * 24 * 3600_000)
    .toISOString()
    .slice(0, 10);

  for (const s of allSites) {
    const { config } = await getRuleConfig("traffic_drop", s.id);
    const warnPct = Number(config.warnPct);
    const errorPct = Number(config.errorPct);
    const criticalPct = Number(config.criticalPct);

    const rows = await db()
      .select({ snapshotDate: trafficSnapshots.snapshotDate, metrics: trafficSnapshots.metrics })
      .from(trafficSnapshots)
      .where(
        and(
          eq(trafficSnapshots.siteId, s.id),
          eq(trafficSnapshots.source, "gsc"),
          gte(trafficSnapshots.snapshotDate, sinceDate),
        ),
      );

    if (rows.length < 3) continue; // not enough history yet

    const byDay = new Map<string, number>();
    for (const r of rows) {
      const clicks = Number((r.metrics as Record<string, number>)?.clicks ?? 0);
      byDay.set(r.snapshotDate, (byDay.get(r.snapshotDate) ?? 0) + clicks);
    }
    const days = [...byDay.keys()].sort();
    if (days.length < 3) continue;

    const yesterday = days[days.length - 1];
    const recent = byDay.get(yesterday) ?? 0;
    const prior = days.slice(0, -1).map((d) => byDay.get(d) ?? 0);
    const baseline = median(prior);

    if (baseline <= 5) continue; // too low to be meaningful
    const dropPct = ((baseline - recent) / baseline) * 100;
    if (dropPct < warnPct) continue; // within normal noise

    let severity: AlertCandidate["severity"] = "warn";
    if (dropPct >= criticalPct) severity = "critical";
    else if (dropPct >= errorPct) severity = "error";

    candidates.push({
      kind: "traffic_drop",
      siteId: s.id,
      entity: `${s.slug}:${yesterday}`,
      severity,
      title: `${s.name}: traffic ↓ ${dropPct.toFixed(0)}% vs 7-day median`,
      body: `${yesterday} GSC clicks: ${recent}; 7-day median: ${baseline.toFixed(0)}. Investigate GSC for indexing/ranking changes.`,
      payload: { date: yesterday, clicks: recent, baseline, dropPct },
    });
  }

  return {
    candidates,
    durationMs: Date.now() - startedAt,
    observed: `${allSites.length} sites checked (GSC, ${LOOKBACK_DAYS}d lookback)`,
  };
}
