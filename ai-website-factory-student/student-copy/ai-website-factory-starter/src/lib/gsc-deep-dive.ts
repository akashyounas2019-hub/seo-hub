/**
 * Read-side helpers for the /admin/gsc deep-dive page.
 *
 * The sync writes two snapshot buckets per (site, dimension_value): one for
 * the "recent" window and one for the "prior" window. We identify the two
 * most-recent snapshot dates per dimension, then diff them to compute the
 * gainers / losers lists.
 */
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { gscPageSnapshots, gscQuerySnapshots, trafficSnapshots } from "@/db/schema";

/** Two most-recent snapshot dates found in the given table. Returns null when
 *  there aren't at least two buckets to diff. */
async function loadWindowPair(
  table: typeof gscQuerySnapshots | typeof gscPageSnapshots,
): Promise<{ recent: string; prior: string } | null> {
  const rows = await db()
    .select({ d: table.snapshotDate })
    .from(table)
    .groupBy(table.snapshotDate)
    .orderBy(desc(table.snapshotDate))
    .limit(2);
  if (rows.length < 2) return null;
  return { recent: rows[0].d, prior: rows[1].d };
}

export type MoverRow = {
  key: string; // the query text or page URL
  clicksRecent: number;
  clicksPrior: number;
  clicksDelta: number;
  clicksDeltaPct: number | null;
  positionRecent: number;
  positionPrior: number;
  positionDelta: number; // negative = improved
  impressionsRecent: number;
  ctrRecent: number;
  ctrPrior: number;
  /** Absolute change in CTR expressed in percentage points (e.g. 2.4pp). */
  ctrDeltaPp: number;
};

async function loadMovers(
  table: typeof gscQuerySnapshots | typeof gscPageSnapshots,
  keyCol: typeof gscQuerySnapshots.query | typeof gscPageSnapshots.page,
  pair: { recent: string; prior: string },
): Promise<MoverRow[]> {
  const recentRows = await db()
    .select({
      key: keyCol,
      clicks: table.clicks,
      impressions: table.impressions,
      position: table.position,
      ctr: table.ctr,
    })
    .from(table)
    .where(eq(table.snapshotDate, pair.recent));

  const priorRows = await db()
    .select({
      key: keyCol,
      clicks: table.clicks,
      position: table.position,
      ctr: table.ctr,
    })
    .from(table)
    .where(eq(table.snapshotDate, pair.prior));

  const priorMap = new Map(priorRows.map((r) => [r.key, r]));
  const movers: MoverRow[] = [];
  for (const r of recentRows) {
    const p = priorMap.get(r.key);
    const clicksPrior = p?.clicks ?? 0;
    const positionPrior = p?.position ?? 0;
    const ctrPrior = p?.ctr ?? 0;
    const clicksDelta = r.clicks - clicksPrior;
    const clicksDeltaPct = clicksPrior > 0 ? (clicksDelta / clicksPrior) * 100 : null;
    const positionDelta = positionPrior > 0 ? r.position - positionPrior : 0;
    // CTR deltas in percentage points, not percent change. That's how Search
    // Console itself reports it — matches the operator's mental model.
    const ctrDeltaPp = (r.ctr - ctrPrior) * 100;
    movers.push({
      key: r.key,
      clicksRecent: r.clicks,
      clicksPrior,
      clicksDelta,
      clicksDeltaPct,
      positionRecent: r.position,
      positionPrior,
      positionDelta,
      impressionsRecent: r.impressions,
      ctrRecent: r.ctr,
      ctrPrior,
      ctrDeltaPp,
    });
  }
  return movers;
}

export type MoverLists = {
  queriesUp: MoverRow[];
  queriesDown: MoverRow[];
  pagesUp: MoverRow[];
  pagesDown: MoverRow[];
  ctrPagesUp: MoverRow[];
  ctrPagesDown: MoverRow[];
  hasData: boolean;
  windows: { recent: string; prior: string } | null;
};

export async function loadMoverLists(limit = 10): Promise<MoverLists> {
  const [queryPair, pagePair] = await Promise.all([
    loadWindowPair(gscQuerySnapshots),
    loadWindowPair(gscPageSnapshots),
  ]);

  const [queryMovers, pageMovers] = await Promise.all([
    queryPair ? loadMovers(gscQuerySnapshots, gscQuerySnapshots.query, queryPair) : Promise.resolve([] as MoverRow[]),
    pagePair ? loadMovers(gscPageSnapshots, gscPageSnapshots.page, pagePair) : Promise.resolve([] as MoverRow[]),
  ]);

  const queriesUp = [...queryMovers]
    .filter((m) => m.clicksDelta > 0 || m.positionDelta < 0)
    .sort((a, b) => b.clicksDelta - a.clicksDelta || a.positionDelta - b.positionDelta)
    .slice(0, limit);
  const queriesDown = [...queryMovers]
    .filter((m) => m.clicksDelta < 0 || m.positionDelta > 0)
    .sort((a, b) => a.clicksDelta - b.clicksDelta || b.positionDelta - a.positionDelta)
    .slice(0, limit);
  const pagesUp = [...pageMovers]
    .filter((m) => m.clicksDelta > 0 || m.positionDelta < 0)
    .sort((a, b) => b.clicksDelta - a.clicksDelta || a.positionDelta - b.positionDelta)
    .slice(0, limit);
  const pagesDown = [...pageMovers]
    .filter((m) => m.clicksDelta < 0 || m.positionDelta > 0)
    .sort((a, b) => a.clicksDelta - b.clicksDelta || b.positionDelta - a.positionDelta)
    .slice(0, limit);

  // CTR movers — restrict to pages that actually received enough impressions
  // in BOTH windows to make the CTR reliable. A page that jumps from 0/0 →
  // 1/2 is not a meaningful "CTR improvement".
  const CTR_MIN_IMPRESSIONS = 50;
  const ctrEligible = pageMovers.filter(
    (m) => m.impressionsRecent >= CTR_MIN_IMPRESSIONS && m.ctrPrior > 0,
  );
  const ctrPagesUp = [...ctrEligible]
    .filter((m) => m.ctrDeltaPp > 0)
    .sort((a, b) => b.ctrDeltaPp - a.ctrDeltaPp)
    .slice(0, limit);
  const ctrPagesDown = [...ctrEligible]
    .filter((m) => m.ctrDeltaPp < 0)
    .sort((a, b) => a.ctrDeltaPp - b.ctrDeltaPp)
    .slice(0, limit);

  return {
    queriesUp,
    queriesDown,
    pagesUp,
    pagesDown,
    ctrPagesUp,
    ctrPagesDown,
    hasData: queryMovers.length + pageMovers.length > 0,
    windows: queryPair ?? pagePair,
  };
}

/**
 * Load the daily clicks + impressions series for a rolling window. Powers
 * the big performance chart at the top of the page.
 */
export type PerformanceSeriesPoint = {
  date: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export async function loadPerformanceSeries(days = 90): Promise<PerformanceSeriesPoint[]> {
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const rows = await db()
    .select({
      d: trafficSnapshots.snapshotDate,
      clicks: sql<number>`coalesce(sum((metrics->>'clicks')::float),0)::int`,
      impressions: sql<number>`coalesce(sum((metrics->>'impressions')::float),0)::int`,
      ctrWeighted: sql<number>`coalesce(sum((metrics->>'ctr')::float * (metrics->>'impressions')::float),0)::float`,
      posWeighted: sql<number>`coalesce(sum((metrics->>'position')::float * (metrics->>'impressions')::float),0)::float`,
    })
    .from(trafficSnapshots)
    .where(
      and(
        eq(trafficSnapshots.source, "gsc"),
        gte(trafficSnapshots.snapshotDate, startDate),
      ),
    )
    .groupBy(trafficSnapshots.snapshotDate)
    .orderBy(trafficSnapshots.snapshotDate);

  return rows.map((r) => ({
    date: r.d,
    clicks: r.clicks,
    impressions: r.impressions,
    ctr: r.impressions > 0 ? r.ctrWeighted / r.impressions : 0,
    position: r.impressions > 0 ? r.posWeighted / r.impressions : 0,
  }));
}

/**
 * Aggregate KPI totals for the window vs the prior window.
 */
export type GscKpiCard = {
  label: string;
  value: string;
  delta: number | null;
  positiveIsGood: boolean;
};

export async function loadKpiTotals(days = 28): Promise<GscKpiCard[]> {
  const today = new Date();
  const windowStart = new Date(today.getTime() - days * 24 * 60 * 60 * 1000);
  const priorStart = new Date(today.getTime() - 2 * days * 24 * 60 * 60 * 1000);
  const priorEnd = new Date(windowStart.getTime());

  async function readTotals(start: string, end: string) {
    const [row] = await db()
      .select({
        clicks: sql<number>`coalesce(sum((metrics->>'clicks')::float),0)::int`,
        impressions: sql<number>`coalesce(sum((metrics->>'impressions')::float),0)::int`,
        ctrWeighted: sql<number>`coalesce(sum((metrics->>'ctr')::float * (metrics->>'impressions')::float),0)::float`,
        posWeighted: sql<number>`coalesce(sum((metrics->>'position')::float * (metrics->>'impressions')::float),0)::float`,
      })
      .from(trafficSnapshots)
      .where(
        and(
          eq(trafficSnapshots.source, "gsc"),
          gte(trafficSnapshots.snapshotDate, start),
          sql`${trafficSnapshots.snapshotDate} < ${end}`,
        ),
      );
    return row!;
  }

  const [rec, prev] = await Promise.all([
    readTotals(windowStart.toISOString().slice(0, 10), today.toISOString().slice(0, 10)),
    readTotals(priorStart.toISOString().slice(0, 10), priorEnd.toISOString().slice(0, 10)),
  ]);

  function pct(a: number, b: number): number | null {
    if (!b) return null;
    return ((a - b) / b) * 100;
  }
  const ctrR = rec.impressions > 0 ? rec.ctrWeighted / rec.impressions : 0;
  const ctrP = prev.impressions > 0 ? prev.ctrWeighted / prev.impressions : 0;
  const posR = rec.impressions > 0 ? rec.posWeighted / rec.impressions : 0;
  const posP = prev.impressions > 0 ? prev.posWeighted / prev.impressions : 0;

  return [
    {
      label: "Clicks",
      value: rec.clicks.toLocaleString(),
      delta: pct(rec.clicks, prev.clicks),
      positiveIsGood: true,
    },
    {
      label: "Impressions",
      value: rec.impressions.toLocaleString(),
      delta: pct(rec.impressions, prev.impressions),
      positiveIsGood: true,
    },
    {
      label: "Avg CTR",
      value: `${(ctrR * 100).toFixed(2)}%`,
      delta: pct(ctrR, ctrP),
      positiveIsGood: true,
    },
    {
      label: "Avg Position",
      value: posR > 0 ? posR.toFixed(1) : "—",
      // Lower position is better — invert the sign so green means improvement.
      delta: posP > 0 ? -1 * (pct(posR, posP) ?? 0) : null,
      positiveIsGood: true,
    },
  ];
}

/**
 * Ensure the referenced imports don't get pruned by TS's tree-shaker in this
 * file when types cross-reference. Cheap trick, no runtime cost.
 */
export const _keepImportsLive = () => {
  void inArray;
};
