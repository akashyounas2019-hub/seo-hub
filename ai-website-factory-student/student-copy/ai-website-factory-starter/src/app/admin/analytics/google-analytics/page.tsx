/**
 * /admin/analytics/google-analytics — full GA4 drilldown.
 *
 * Data from traffic_snapshots (source='ga4'). Metrics jsonb blob is expected
 * to hold: { sessions, users, engagement_time_avg, conversions, revenue,
 * bounce_rate, pages_per_session, new_users, returning_users, key_events }.
 * detail jsonb may hold: { channels, devices, top_pages, top_countries,
 * rising_pages, dropping_pages, engagement_alerts }.
 */
import { and, desc, eq, gte } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { trafficSnapshots } from "@/db/schema";
import { requireAdmin } from "@/lib/server-auth";
import { GoogleAnalyticsDrill, type GADrillProps } from "./GoogleAnalyticsDrill";

export const dynamic = "force-dynamic";

function iso(d: Date) { return d.toISOString().slice(0, 10); }
function pctDelta(cur: number, prev: number): number {
  if (prev <= 0) return cur > 0 ? 100 : 0;
  return Math.round(((cur - prev) / prev) * 1000) / 10;
}

export default async function GoogleAnalyticsPage({
  searchParams = {},
}: {
  searchParams?: { range?: string };
}) {
  await ensureSchema();
  await requireAdmin();
  const d = db();
  const range = (searchParams.range as GADrillProps["range"]) ?? "28d";
  const rangeDays = { "7d": 7, "14v14": 14, "28d": 28, "3m": 90, "6m": 180, "12m": 365 }[range] ?? 28;

  const now = new Date();
  const cutoff = new Date(now.getTime() - rangeDays * 24 * 3600_000);
  const prevCutoff = new Date(now.getTime() - rangeDays * 2 * 24 * 3600_000);

  const rows = await d
    .select({
      snapshotDate: trafficSnapshots.snapshotDate,
      metrics: trafficSnapshots.metrics,
      detail: trafficSnapshots.detail,
    })
    .from(trafficSnapshots)
    .where(and(eq(trafficSnapshots.source, "ga4"), gte(trafficSnapshots.snapshotDate, iso(prevCutoff))));

  // Aggregations
  let sessions = 0, sessionsPrev = 0;
  let users = 0, usersPrev = 0;
  let convs = 0, convsPrev = 0;
  let revenue = 0, revenuePrev = 0;
  let newUsers = 0, returningUsers = 0;
  let keyEvents = 0, keyEventsPrev = 0;
  let engSum = 0, engCount = 0, engSumPrev = 0, engCountPrev = 0;
  let bounceSum = 0, bounceCount = 0;
  let pagesSum = 0, pagesCount = 0;

  const weeklySessions = new Map<string, number>();
  const weeklyUsers = new Map<string, number>();
  const channelTotals = new Map<string, number>();
  const deviceTotals = new Map<string, number>();
  const topPagesAcc = new Map<string, { views: number; sessions: number }>();
  const countryTotals = new Map<string, number>();
  const rising: { page: string; delta: number }[] = [];
  const dropping: { page: string; delta: number }[] = [];
  const engagementAlerts: string[] = [];

  for (const r of rows) {
    const d0 = new Date(r.snapshotDate + "T00:00:00Z");
    const inCurrent = d0 >= cutoff && d0 <= now;
    const inPrior = d0 >= prevCutoff && d0 < cutoff;
    const m = r.metrics as Record<string, number>;
    const det = (r.detail ?? {}) as Record<string, unknown>;

    const s = Number(m.sessions ?? 0);
    const u = Number(m.users ?? 0);
    const c = Number(m.conversions ?? 0);
    const rev = Number(m.revenue ?? 0);
    const nu = Number(m.new_users ?? 0);
    const ru = Number(m.returning_users ?? 0);
    const ke = Number(m.key_events ?? 0);
    const eng = Number(m.engagement_time_avg ?? 0);
    const bounce = Number(m.bounce_rate ?? 0);
    const pps = Number(m.pages_per_session ?? 0);

    if (inCurrent) {
      sessions += s; users += u; convs += c; revenue += rev;
      newUsers += nu; returningUsers += ru; keyEvents += ke;
      if (eng > 0) { engSum += eng; engCount += 1; }
      if (bounce > 0) { bounceSum += bounce; bounceCount += 1; }
      if (pps > 0) { pagesSum += pps; pagesCount += 1; }

      const wk = weekKey(d0);
      weeklySessions.set(wk, (weeklySessions.get(wk) ?? 0) + s);
      weeklyUsers.set(wk, (weeklyUsers.get(wk) ?? 0) + u);

      for (const [k, v] of Object.entries((det.channels ?? {}) as Record<string, number>)) {
        channelTotals.set(k, (channelTotals.get(k) ?? 0) + Number(v));
      }
      for (const [k, v] of Object.entries((det.devices ?? {}) as Record<string, number>)) {
        deviceTotals.set(k, (deviceTotals.get(k) ?? 0) + Number(v));
      }
      for (const p of ((det.top_pages ?? []) as { page: string; views: number; sessions: number }[])) {
        const t = topPagesAcc.get(p.page) ?? { views: 0, sessions: 0 };
        t.views += Number(p.views ?? 0);
        t.sessions += Number(p.sessions ?? 0);
        topPagesAcc.set(p.page, t);
      }
      for (const [k, v] of Object.entries((det.top_countries ?? {}) as Record<string, number>)) {
        countryTotals.set(k, (countryTotals.get(k) ?? 0) + Number(v));
      }
      for (const rp of ((det.rising_pages ?? []) as { page: string; delta: number }[])) rising.push(rp);
      for (const dp of ((det.dropping_pages ?? []) as { page: string; delta: number }[])) dropping.push(dp);
      for (const a of ((det.engagement_alerts ?? []) as string[])) engagementAlerts.push(a);
    }
    if (inPrior) {
      sessionsPrev += s; usersPrev += u; convsPrev += c; revenuePrev += rev; keyEventsPrev += ke;
      if (eng > 0) { engSumPrev += eng; engCountPrev += 1; }
    }
  }

  const avgEng = engCount > 0 ? engSum / engCount : 0;
  const avgEngPrev = engCountPrev > 0 ? engSumPrev / engCountPrev : 0;
  const bounceRate = bounceCount > 0 ? bounceSum / bounceCount : 0;
  const pagesPerSession = pagesCount > 0 ? pagesSum / pagesCount : 0;

  const weeks = Array.from(new Set([...weeklySessions.keys(), ...weeklyUsers.keys()])).sort();
  const chartWeekly = weeks.map((wk) => ({
    label: wk,
    sessions: weeklySessions.get(wk) ?? 0,
    users: weeklyUsers.get(wk) ?? 0,
  }));

  const topChannels = [...channelTotals.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);
  const devices = [...deviceTotals.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
  const topPages = [...topPagesAcc.entries()]
    .map(([page, v]) => ({ page, views: v.views, sessions: v.sessions }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 10);
  const topCountries = [...countryTotals.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  const risingTop = dedupePagesByAbsDelta(rising, false).slice(0, 5);
  const droppingTop = dedupePagesByAbsDelta(dropping, true).slice(0, 5);
  const engagementAlertsTop = Array.from(new Set(engagementAlerts)).slice(0, 5);

  const empty = rows.length === 0;

  return (
    <GoogleAnalyticsDrill
      range={range}
      empty={empty}
      hero={{
        sessions: { value: sessions, delta: pctDelta(sessions, sessionsPrev) },
        users:    { value: users,    delta: pctDelta(users, usersPrev) },
        avgEngagement: { value: avgEng, delta: pctDelta(avgEng, avgEngPrev) },
        conversions:   { value: convs,  delta: pctDelta(convs, convsPrev) },
      }}
      secondary={{
        revenue: revenue,
        revenueDelta: pctDelta(revenue, revenuePrev),
        bounceRate,
        pagesPerSession,
        newUsers,
        returningUsers,
        keyEvents,
        keyEventsDelta: pctDelta(keyEvents, keyEventsPrev),
      }}
      chartWeekly={chartWeekly}
      risingPages={risingTop}
      droppingPages={droppingTop}
      engagementAlerts={engagementAlertsTop}
      topChannels={topChannels}
      devices={devices}
      topPages={topPages}
      topCountries={topCountries}
    />
  );
}

function weekKey(d: Date): string {
  const jan1 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const days = Math.floor((d.getTime() - jan1.getTime()) / 86_400_000);
  const wk = Math.floor((days + jan1.getUTCDay()) / 7) + 1;
  return `${d.getUTCFullYear()}-W${String(wk).padStart(2, "0")}`;
}

function dedupePagesByAbsDelta(list: { page: string; delta: number }[], negative: boolean) {
  const map = new Map<string, number>();
  for (const r of list) {
    const cur = map.get(r.page);
    if (cur == null || Math.abs(r.delta) > Math.abs(cur)) map.set(r.page, r.delta);
  }
  const arr = [...map.entries()].map(([page, delta]) => ({ page, delta }));
  return arr.sort((a, b) => (negative ? a.delta - b.delta : b.delta - a.delta));
}
