/**
 * Aggregations that drive the dashboard's GSC + GA4 widgets.
 *
 * One function per source (`gscAggregate`, `ga4Aggregate`). Each accepts a
 * time range and a comparison mode, and returns:
 *   - totals for the primary window
 *   - totals for the compared window (previous period OR previous year)
 *   - a daily sparkline sized to the range
 *   - a row count so the caller can tell "no data" from "zeroes"
 *
 * All computations are done in Postgres — the caller gets numbers back, not
 * rows, so the dashboard render stays cheap.
 */
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { trafficSnapshots } from "@/db/schema";

const DAY_MS = 24 * 60 * 60 * 1000;

export type RangeId = "7d" | "14d" | "28d" | "3mo";
export type CompareMode = "period" | "year" | "none";

export const RANGE_OPTIONS: Array<{ id: RangeId; label: string; days: number }> = [
  { id: "7d", label: "Last 7 days", days: 7 },
  { id: "14d", label: "Last 14 days", days: 14 },
  { id: "28d", label: "Last 28 days", days: 28 },
  { id: "3mo", label: "Last 3 months", days: 90 },
];

export function daysForRange(range: RangeId): number {
  return RANGE_OPTIONS.find((r) => r.id === range)?.days ?? 28;
}

export function isValidRange(v: unknown): v is RangeId {
  return typeof v === "string" && RANGE_OPTIONS.some((r) => r.id === v);
}
export function isValidCompareMode(v: unknown): v is CompareMode {
  return v === "period" || v === "year" || v === "none";
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Returns { start, end } (YYYY-MM-DD, exclusive of end) for the primary and
 *  compared windows given a range id and compare mode. */
export function computeWindows(range: RangeId, compare: CompareMode) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = daysForRange(range);
  const primaryStart = new Date(today.getTime() - days * DAY_MS);
  const primaryEnd = new Date(today.getTime());

  let comparedStart: Date | null = null;
  let comparedEnd: Date | null = null;
  if (compare === "period") {
    comparedStart = new Date(primaryStart.getTime() - days * DAY_MS);
    comparedEnd = new Date(primaryStart.getTime());
  } else if (compare === "year") {
    comparedStart = new Date(primaryStart.getTime());
    comparedEnd = new Date(primaryEnd.getTime());
    comparedStart.setFullYear(comparedStart.getFullYear() - 1);
    comparedEnd.setFullYear(comparedEnd.getFullYear() - 1);
  }

  return {
    today,
    days,
    primary: { startIso: isoDay(primaryStart), endIso: isoDay(primaryEnd) },
    compared:
      comparedStart && comparedEnd
        ? { startIso: isoDay(comparedStart), endIso: isoDay(comparedEnd) }
        : null,
  };
}

/** Fill a daily series with zeros where the source has no snapshot for a date. */
export function fillDailySeries(
  n: number,
  today: Date,
  rows: ReadonlyArray<readonly [string, number]>,
): number[] {
  const map = new Map(rows);
  const out: number[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const dt = new Date(today.getTime() - i * DAY_MS);
    out.push(map.get(isoDay(dt)) ?? 0);
  }
  return out;
}

export type GscTotals = {
  clicks: number;
  impressions: number;
  ctr: number; // impression-weighted 0-1
  position: number; // impression-weighted average
  rowCount: number;
};

export type GscAggregate = {
  primary: GscTotals;
  compared: GscTotals | null;
  spark: number[]; // one entry per day in the primary window
  hasData: boolean;
};

/**
 * GSC network aggregate for the given window + optional comparison.
 */
export async function gscAggregate(
  range: RangeId,
  compare: CompareMode,
): Promise<GscAggregate> {
  const { today, days, primary, compared } = computeWindows(range, compare);

  async function readTotals(startIso: string, endIso: string): Promise<GscTotals> {
    const [row] = await db()
      .select({
        clicks: sql<number>`coalesce(sum((metrics->>'clicks')::float),0)::int`,
        impressions: sql<number>`coalesce(sum((metrics->>'impressions')::float),0)::int`,
        ctrWeighted: sql<number>`coalesce(sum((metrics->>'ctr')::float * (metrics->>'impressions')::float),0)::float`,
        posWeighted: sql<number>`coalesce(sum((metrics->>'position')::float * (metrics->>'impressions')::float),0)::float`,
        rowCount: sql<number>`count(*)::int`,
      })
      .from(trafficSnapshots)
      .where(
        and(
          eq(trafficSnapshots.source, "gsc"),
          gte(trafficSnapshots.snapshotDate, startIso),
          sql`${trafficSnapshots.snapshotDate} < ${endIso}`,
        ),
      );
    const impressions = row?.impressions ?? 0;
    return {
      clicks: row?.clicks ?? 0,
      impressions,
      ctr: impressions > 0 ? (row!.ctrWeighted ?? 0) / impressions : 0,
      position: impressions > 0 ? (row!.posWeighted ?? 0) / impressions : 0,
      rowCount: row?.rowCount ?? 0,
    };
  }

  const [primaryTotals, comparedTotals, sparkRows] = await Promise.all([
    readTotals(primary.startIso, primary.endIso),
    compared ? readTotals(compared.startIso, compared.endIso) : Promise.resolve(null),
    db()
      .select({
        day: trafficSnapshots.snapshotDate,
        clicks: sql<number>`coalesce(sum((metrics->>'clicks')::float),0)::int`,
      })
      .from(trafficSnapshots)
      .where(
        and(
          eq(trafficSnapshots.source, "gsc"),
          gte(trafficSnapshots.snapshotDate, primary.startIso),
          sql`${trafficSnapshots.snapshotDate} < ${primary.endIso}`,
        ),
      )
      .groupBy(trafficSnapshots.snapshotDate)
      .orderBy(trafficSnapshots.snapshotDate),
  ]);

  return {
    primary: primaryTotals,
    compared: comparedTotals,
    spark: fillDailySeries(days, today, sparkRows.map((r) => [r.day, r.clicks] as const)),
    hasData: primaryTotals.rowCount > 0,
  };
}

export type Ga4Totals = {
  sessions: number;
  users: number;
  conversions: number;
  engagementRate: number; // session-weighted 0-1
  rowCount: number;
};

export type Ga4Aggregate = {
  primary: Ga4Totals;
  compared: Ga4Totals | null;
  spark: number[];
  hasData: boolean;
};

export async function ga4Aggregate(
  range: RangeId,
  compare: CompareMode,
): Promise<Ga4Aggregate> {
  const { today, days, primary, compared } = computeWindows(range, compare);

  async function readTotals(startIso: string, endIso: string): Promise<Ga4Totals> {
    const [row] = await db()
      .select({
        sessions: sql<number>`coalesce(sum((metrics->>'sessions')::float),0)::int`,
        users: sql<number>`coalesce(sum((metrics->>'users')::float),0)::int`,
        conversions: sql<number>`coalesce(sum((metrics->>'conversions')::float),0)::int`,
        engagementWeighted: sql<number>`coalesce(sum((metrics->>'engagementRate')::float * (metrics->>'sessions')::float),0)::float`,
        rowCount: sql<number>`count(*)::int`,
      })
      .from(trafficSnapshots)
      .where(
        and(
          eq(trafficSnapshots.source, "ga4"),
          gte(trafficSnapshots.snapshotDate, startIso),
          sql`${trafficSnapshots.snapshotDate} < ${endIso}`,
        ),
      );
    const sessions = row?.sessions ?? 0;
    return {
      sessions,
      users: row?.users ?? 0,
      conversions: row?.conversions ?? 0,
      engagementRate: sessions > 0 ? (row!.engagementWeighted ?? 0) / sessions : 0,
      rowCount: row?.rowCount ?? 0,
    };
  }

  const [primaryTotals, comparedTotals, sparkRows] = await Promise.all([
    readTotals(primary.startIso, primary.endIso),
    compared ? readTotals(compared.startIso, compared.endIso) : Promise.resolve(null),
    db()
      .select({
        day: trafficSnapshots.snapshotDate,
        sessions: sql<number>`coalesce(sum((metrics->>'sessions')::float),0)::int`,
      })
      .from(trafficSnapshots)
      .where(
        and(
          eq(trafficSnapshots.source, "ga4"),
          gte(trafficSnapshots.snapshotDate, primary.startIso),
          sql`${trafficSnapshots.snapshotDate} < ${primary.endIso}`,
        ),
      )
      .groupBy(trafficSnapshots.snapshotDate)
      .orderBy(trafficSnapshots.snapshotDate),
  ]);

  return {
    primary: primaryTotals,
    compared: comparedTotals,
    spark: fillDailySeries(days, today, sparkRows.map((r) => [r.day, r.sessions] as const)),
    hasData: primaryTotals.rowCount > 0,
  };
}

/** Percentage delta of `current` vs `prev`. Returns null when prev is 0. */
export function pctDelta(current: number, prev: number): number | null {
  if (!prev) return null;
  return ((current - prev) / prev) * 100;
}
