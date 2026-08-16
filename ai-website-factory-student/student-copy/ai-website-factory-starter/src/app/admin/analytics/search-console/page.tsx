/**
 * /admin/analytics/search-console — GSC drilldown.
 *
 * Data from gsc_query_snapshots + gsc_page_snapshots. We compute:
 *   - 28-day totals + prior-28-day deltas for clicks/impressions/ctr/position
 *   - 12-week clicks + impressions series (weekly buckets), plus weekly CTR
 *   - Movers: CTR increased/decreased vs prior 28d, and query position drops
 *   - Top ranking keywords, top performing pages
 *   - Devices + top countries (from trafficSnapshots.detail for source='gsc')
 */
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { gscPageSnapshots, gscQuerySnapshots, trafficSnapshots } from "@/db/schema";
import { requireAdmin } from "@/lib/server-auth";
import { SearchConsoleDrill, type GSCDrillProps } from "./SearchConsoleDrill";

export const dynamic = "force-dynamic";

function iso(d: Date) { return d.toISOString().slice(0, 10); }
function pctDelta(cur: number, prev: number): number {
  if (prev <= 0) return cur > 0 ? 100 : 0;
  return Math.round(((cur - prev) / prev) * 1000) / 10;
}

export default async function SearchConsolePage() {
  await ensureSchema();
  await requireAdmin();
  const d = db();
  const now = new Date();
  const cutoff28 = new Date(now.getTime() - 28 * 24 * 3600_000);
  const prev28 = new Date(now.getTime() - 56 * 24 * 3600_000);
  const cutoff12w = new Date(now.getTime() - 12 * 7 * 24 * 3600_000);

  const [qRows, pRows, gscTraffic] = await Promise.all([
    d.select().from(gscQuerySnapshots).where(gte(gscQuerySnapshots.snapshotDate, iso(prev28))),
    d.select().from(gscPageSnapshots).where(gte(gscPageSnapshots.snapshotDate, iso(cutoff28))),
    d.select({ snapshotDate: trafficSnapshots.snapshotDate, detail: trafficSnapshots.detail, metrics: trafficSnapshots.metrics })
      .from(trafficSnapshots).where(and(eq(trafficSnapshots.source, "gsc"), gte(trafficSnapshots.snapshotDate, iso(cutoff12w)))),
  ]);

  // 28d totals from queries table
  let clicks = 0, impr = 0, posSum = 0, posN = 0;
  let clicksPrev = 0, imprPrev = 0, posSumPrev = 0, posNPrev = 0;
  const queryAgg = new Map<string, { clicks: number; impressions: number; ctrSum: number; posSum: number; n: number; prevCtrSum: number; prevN: number; prevPosSum: number }>();
  for (const r of qRows) {
    const d0 = new Date(r.snapshotDate + "T00:00:00Z");
    const inCur = d0 >= cutoff28 && d0 <= now;
    const inPrev = d0 >= prev28 && d0 < cutoff28;
    if (!inCur && !inPrev) continue;
    const e = queryAgg.get(r.query) ?? { clicks: 0, impressions: 0, ctrSum: 0, posSum: 0, n: 0, prevCtrSum: 0, prevN: 0, prevPosSum: 0 };
    if (inCur) {
      clicks += r.clicks; impr += r.impressions;
      posSum += Number(r.position ?? 0); posN += 1;
      e.clicks += r.clicks; e.impressions += r.impressions; e.ctrSum += Number(r.ctr ?? 0); e.posSum += Number(r.position ?? 0); e.n += 1;
    } else if (inPrev) {
      clicksPrev += r.clicks; imprPrev += r.impressions;
      posSumPrev += Number(r.position ?? 0); posNPrev += 1;
      e.prevCtrSum += Number(r.ctr ?? 0); e.prevN += 1; e.prevPosSum += Number(r.position ?? 0);
    }
    queryAgg.set(r.query, e);
  }
  const ctrCur = impr > 0 ? clicks / impr : 0;
  const ctrPrev = imprPrev > 0 ? clicksPrev / imprPrev : 0;
  const posCur = posN > 0 ? posSum / posN : 0;
  const posPrev = posNPrev > 0 ? posSumPrev / posNPrev : 0;

  // Sparklines for the 4 hero cards (12w daily → weekly buckets)
  const clicksByDay = new Map<string, number>();
  const imprByDay = new Map<string, number>();
  const posByDay = new Map<string, number[]>();
  const ctrByDay = new Map<string, { c: number; i: number }>();
  const qAll = await d.select().from(gscQuerySnapshots).where(gte(gscQuerySnapshots.snapshotDate, iso(cutoff12w)));
  for (const r of qAll) {
    clicksByDay.set(r.snapshotDate, (clicksByDay.get(r.snapshotDate) ?? 0) + r.clicks);
    imprByDay.set(r.snapshotDate, (imprByDay.get(r.snapshotDate) ?? 0) + r.impressions);
    const pArr = posByDay.get(r.snapshotDate) ?? [];
    pArr.push(Number(r.position ?? 0));
    posByDay.set(r.snapshotDate, pArr);
    const cAgg = ctrByDay.get(r.snapshotDate) ?? { c: 0, i: 0 };
    cAgg.c += r.clicks; cAgg.i += r.impressions;
    ctrByDay.set(r.snapshotDate, cAgg);
  }
  const clicksSpark = weeklyBuckets(clicksByDay);
  const imprSpark   = weeklyBuckets(imprByDay);
  const posSpark    = weeklyBucketsAvg(posByDay);
  const ctrSpark    = weeklyBucketsFromCTR(ctrByDay);

  // Weekly Clicks vs Impressions chart + CTR overlay (12w)
  const weeks = Array.from(new Set([...clicksByDay.keys(), ...imprByDay.keys()])).sort();
  const weekAgg = new Map<string, { clicks: number; impressions: number }>();
  for (const day of weeks) {
    const wk = weekKey(new Date(day + "T00:00:00Z"));
    const e = weekAgg.get(wk) ?? { clicks: 0, impressions: 0 };
    e.clicks += clicksByDay.get(day) ?? 0;
    e.impressions += imprByDay.get(day) ?? 0;
    weekAgg.set(wk, e);
  }
  const chartWeekly = [...weekAgg.entries()]
    .sort()
    .slice(-12)
    .map(([label, v]) => ({ label, clicks: v.clicks, impressions: v.impressions, ctr: v.impressions > 0 ? v.clicks / v.impressions : 0 }));

  // Movers
  const ctrRising: { query: string; delta: number }[] = [];
  const ctrDropping: { query: string; delta: number }[] = [];
  const posDropping: { query: string; from: number; to: number }[] = [];
  for (const [q, e] of queryAgg) {
    const curCTR = e.n > 0 ? e.ctrSum / e.n : 0;
    const prvCTR = e.prevN > 0 ? e.prevCtrSum / e.prevN : 0;
    if (prvCTR > 0 && curCTR > 0) {
      const delta = (curCTR - prvCTR) / prvCTR * 100;
      if (delta > 5) ctrRising.push({ query: q, delta });
      if (delta < -5) ctrDropping.push({ query: q, delta });
    }
    const curPos = e.n > 0 ? e.posSum / e.n : 0;
    const prvPos = e.prevN > 0 ? e.prevPosSum / e.prevN : 0;
    if (prvPos > 0 && curPos > prvPos + 1) {
      posDropping.push({ query: q, from: prvPos, to: curPos });
    }
  }
  ctrRising.sort((a, b) => b.delta - a.delta);
  ctrDropping.sort((a, b) => a.delta - b.delta);
  posDropping.sort((a, b) => (b.to - b.from) - (a.to - a.from));

  // Top queries + pages
  const topQueries = [...queryAgg.entries()]
    .map(([query, e]) => ({
      query,
      clicks: e.clicks,
      ctr: e.n > 0 ? e.ctrSum / e.n : 0,
      position: e.n > 0 ? e.posSum / e.n : 0,
      trend: e.prevN > 0 && e.n > 0 ? ((e.ctrSum / e.n) - (e.prevCtrSum / e.prevN)) : 0,
    }))
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, 12);

  const pageAgg = new Map<string, { clicks: number; impressions: number; ctrSum: number; posSum: number; n: number }>();
  for (const r of pRows) {
    const e = pageAgg.get(r.page) ?? { clicks: 0, impressions: 0, ctrSum: 0, posSum: 0, n: 0 };
    e.clicks += r.clicks; e.impressions += r.impressions;
    e.ctrSum += Number(r.ctr ?? 0); e.posSum += Number(r.position ?? 0); e.n += 1;
    pageAgg.set(r.page, e);
  }
  const topPages = [...pageAgg.entries()]
    .map(([page, e]) => ({
      page, clicks: e.clicks, impressions: e.impressions,
      ctr: e.n > 0 ? e.ctrSum / e.n : 0,
      position: e.n > 0 ? e.posSum / e.n : 0,
    }))
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, 10);

  // Devices + countries from GSC traffic detail
  const devices = new Map<string, number>();
  const countries = new Map<string, number>();
  for (const r of gscTraffic) {
    const det = (r.detail ?? {}) as Record<string, unknown>;
    for (const [k, v] of Object.entries((det.devices ?? {}) as Record<string, number>))    devices.set(k,   (devices.get(k)   ?? 0) + Number(v));
    for (const [k, v] of Object.entries((det.countries ?? {}) as Record<string, number>))  countries.set(k, (countries.get(k) ?? 0) + Number(v));
  }

  const props: GSCDrillProps = {
    empty: qRows.length === 0 && pRows.length === 0,
    hero: {
      clicks:      { value: clicks, delta: pctDelta(clicks, clicksPrev), spark: clicksSpark },
      impressions: { value: impr,   delta: pctDelta(impr, imprPrev),     spark: imprSpark },
      ctr:         { value: ctrCur, delta: pctDelta(ctrCur, ctrPrev),    spark: ctrSpark },
      position:    { value: posCur, delta: Math.round((posPrev - posCur) * 10) / 10, spark: posSpark, inverted: true },
    },
    chartWeekly,
    ctrRising: ctrRising.slice(0, 5),
    ctrDropping: ctrDropping.slice(0, 5),
    posDropping: posDropping.slice(0, 5),
    topQueries,
    topPages,
    devices: [...devices.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
    topCountries: [...countries.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 6),
  };

  return <SearchConsoleDrill {...props} />;
}

function weekKey(d: Date): string {
  const jan1 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const days = Math.floor((d.getTime() - jan1.getTime()) / 86_400_000);
  const wk = Math.floor((days + jan1.getUTCDay()) / 7) + 1;
  return `${d.getUTCFullYear()}-W${String(wk).padStart(2, "0")}`;
}

function weeklyBuckets(map: Map<string, number>): number[] {
  const now = new Date();
  const out: number[] = [];
  for (let w = 11; w >= 0; w--) {
    let sum = 0;
    for (let dd = 0; dd < 7; dd++) {
      const day = new Date(now.getTime() - (w * 7 + dd) * 24 * 3600_000);
      sum += map.get(day.toISOString().slice(0, 10)) ?? 0;
    }
    out.push(sum);
  }
  return out;
}
function weeklyBucketsAvg(map: Map<string, number[]>): number[] {
  const now = new Date();
  const out: number[] = [];
  for (let w = 11; w >= 0; w--) {
    let sum = 0, n = 0;
    for (let dd = 0; dd < 7; dd++) {
      const day = new Date(now.getTime() - (w * 7 + dd) * 24 * 3600_000);
      for (const v of map.get(day.toISOString().slice(0, 10)) ?? []) { sum += v; n += 1; }
    }
    out.push(n > 0 ? sum / n : 0);
  }
  return out;
}
function weeklyBucketsFromCTR(map: Map<string, { c: number; i: number }>): number[] {
  const now = new Date();
  const out: number[] = [];
  for (let w = 11; w >= 0; w--) {
    let c = 0, i = 0;
    for (let dd = 0; dd < 7; dd++) {
      const day = new Date(now.getTime() - (w * 7 + dd) * 24 * 3600_000);
      const e = map.get(day.toISOString().slice(0, 10));
      if (e) { c += e.c; i += e.i; }
    }
    out.push(i > 0 ? c / i : 0);
  }
  return out;
}
