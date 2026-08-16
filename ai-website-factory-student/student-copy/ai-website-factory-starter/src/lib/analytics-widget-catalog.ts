/**
 * Analytics widget catalog — server-only data computation.
 *
 * The shared types + client-safe catalog live in `analytics-widget-types.ts`
 * so client components can import them without dragging drizzle / pg into
 * the browser bundle. This file has the server-side data source in
 * `computeWidgetData()` and re-exports the types for existing callers.
 */
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { gscPageSnapshots, gscQuerySnapshots, trafficSnapshots } from "@/db/schema";
import {
  WIDGET_CATALOG,
  findWidgetCatalogEntry,
  type EmptyWidgetData,
  type WidgetData,
  type WidgetKind,
} from "./analytics-widget-types";

export { WIDGET_CATALOG, findWidgetCatalogEntry } from "./analytics-widget-types";
export type {
  EmptyWidgetData,
  KpiWidgetData,
  ListWidgetData,
  SparklineWidgetData,
  WidgetCatalogEntry,
  WidgetData,
  WidgetKind,
} from "./analytics-widget-types";

/** ISO day for a Date. */
function iso(d: Date): string { return d.toISOString().slice(0, 10); }

function fmtShort(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return Math.round(n).toLocaleString();
}

function pctDelta(cur: number, prev: number): number {
  if (prev <= 0) return cur > 0 ? 100 : 0;
  return Math.round(((cur - prev) / prev) * 1000) / 10;
}

/** Compute the server-side render payload for one widget. */
export async function computeWidgetData(
  kind: WidgetKind,
  _settings: Record<string, unknown>,
): Promise<WidgetData> {
  const now = new Date();
  const cutoff28 = new Date(now.getTime() - 28 * 24 * 3600_000);
  const prev28 = new Date(now.getTime() - 56 * 24 * 3600_000);

  const d = db();

  switch (kind) {
    case "ga_sessions_28d": {
      const rows = await d
        .select({
          snapshotDate: trafficSnapshots.snapshotDate,
          metrics: trafficSnapshots.metrics,
        })
        .from(trafficSnapshots)
        .where(and(eq(trafficSnapshots.source, "ga4"), gte(trafficSnapshots.snapshotDate, iso(prev28))));
      if (rows.length === 0) return emptyForKind(kind);
      let cur = 0, prev = 0;
      for (const r of rows) {
        const d0 = new Date(r.snapshotDate + "T00:00:00Z");
        const s = Number((r.metrics as Record<string, number>).sessions ?? 0);
        if (d0 >= cutoff28) cur += s;
        else if (d0 >= prev28) prev += s;
      }
      return {
        type: "kpi",
        value: fmtShort(cur),
        delta: pctDelta(cur, prev),
        sub: `vs ${fmtShort(prev)} prior 28d`,
      };
    }
    case "ga_conversions_28d": {
      const rows = await d
        .select({
          snapshotDate: trafficSnapshots.snapshotDate,
          metrics: trafficSnapshots.metrics,
        })
        .from(trafficSnapshots)
        .where(and(eq(trafficSnapshots.source, "ga4"), gte(trafficSnapshots.snapshotDate, iso(prev28))));
      if (rows.length === 0) return emptyForKind(kind);
      let cur = 0, prev = 0;
      for (const r of rows) {
        const d0 = new Date(r.snapshotDate + "T00:00:00Z");
        const s = Number((r.metrics as Record<string, number>).conversions ?? 0);
        if (d0 >= cutoff28) cur += s;
        else if (d0 >= prev28) prev += s;
      }
      return {
        type: "kpi",
        value: fmtShort(cur),
        delta: pctDelta(cur, prev),
        sub: `vs ${fmtShort(prev)} prior 28d`,
      };
    }
    case "gsc_top_queries": {
      const rows = await d
        .select({
          query: gscQuerySnapshots.query,
          clicks: sql<number>`sum(${gscQuerySnapshots.clicks})::int`,
          impressions: sql<number>`sum(${gscQuerySnapshots.impressions})::int`,
        })
        .from(gscQuerySnapshots)
        .where(gte(gscQuerySnapshots.snapshotDate, iso(cutoff28)))
        .groupBy(gscQuerySnapshots.query)
        .orderBy(desc(sql`sum(${gscQuerySnapshots.clicks})`))
        .limit(5);
      if (rows.length === 0) return emptyForKind(kind);
      return {
        type: "list",
        rows: rows.map((r) => ({
          primary: r.query,
          secondary: `${fmtShort(Number(r.clicks))} clicks · ${fmtShort(Number(r.impressions))} impressions`,
        })),
      };
    }
    case "gsc_top_pages": {
      const rows = await d
        .select({
          page: gscPageSnapshots.page,
          clicks: sql<number>`sum(${gscPageSnapshots.clicks})::int`,
          impressions: sql<number>`sum(${gscPageSnapshots.impressions})::int`,
        })
        .from(gscPageSnapshots)
        .where(gte(gscPageSnapshots.snapshotDate, iso(cutoff28)))
        .groupBy(gscPageSnapshots.page)
        .orderBy(desc(sql`sum(${gscPageSnapshots.clicks})`))
        .limit(5);
      if (rows.length === 0) return emptyForKind(kind);
      return {
        type: "list",
        rows: rows.map((r) => ({
          primary: r.page,
          secondary: `${fmtShort(Number(r.clicks))} clicks · ${fmtShort(Number(r.impressions))} impressions`,
        })),
      };
    }
    case "gsc_position_trend": {
      const cutoff12w = new Date(now.getTime() - 12 * 7 * 24 * 3600_000);
      const rows = await d
        .select({
          snapshotDate: gscQuerySnapshots.snapshotDate,
          avgPos: sql<number>`avg(${gscQuerySnapshots.position})::float`,
        })
        .from(gscQuerySnapshots)
        .where(gte(gscQuerySnapshots.snapshotDate, iso(cutoff12w)))
        .groupBy(gscQuerySnapshots.snapshotDate)
        .orderBy(gscQuerySnapshots.snapshotDate);
      if (rows.length === 0) return emptyForKind(kind);
      // Bucket into 12 weekly averages.
      const buckets: number[][] = Array.from({ length: 12 }, () => []);
      for (const r of rows) {
        const day = new Date(r.snapshotDate + "T00:00:00Z");
        const daysAgo = Math.floor((now.getTime() - day.getTime()) / (24 * 3600_000));
        const bucket = 11 - Math.min(11, Math.floor(daysAgo / 7));
        if (bucket >= 0 && bucket < 12) buckets[bucket].push(Number(r.avgPos));
      }
      const points = buckets.map((arr) =>
        arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0,
      );
      const latest = points.filter((p) => p > 0).at(-1);
      return {
        type: "sparkline",
        points,
        latest: latest != null ? latest.toFixed(1) : "—",
        label: "avg position (lower is better)",
      };
    }
    case "gbp_calls_28d": {
      const rows = await d
        .select({
          snapshotDate: trafficSnapshots.snapshotDate,
          metrics: trafficSnapshots.metrics,
        })
        .from(trafficSnapshots)
        .where(and(eq(trafficSnapshots.source, "gbp"), gte(trafficSnapshots.snapshotDate, iso(prev28))));
      if (rows.length === 0) return emptyForKind(kind);
      let cur = 0, prev = 0;
      for (const r of rows) {
        const d0 = new Date(r.snapshotDate + "T00:00:00Z");
        const s = Number((r.metrics as Record<string, number>).calls ?? 0);
        if (d0 >= cutoff28) cur += s;
        else if (d0 >= prev28) prev += s;
      }
      return {
        type: "kpi",
        value: fmtShort(cur),
        delta: pctDelta(cur, prev),
        sub: `vs ${fmtShort(prev)} prior 28d`,
      };
    }
  }
}

function emptyForKind(kind: WidgetKind): EmptyWidgetData {
  const entry = WIDGET_CATALOG.find((w) => w.kind === kind);
  return { type: "empty", message: entry?.emptyLabel ?? "No data yet." };
}
