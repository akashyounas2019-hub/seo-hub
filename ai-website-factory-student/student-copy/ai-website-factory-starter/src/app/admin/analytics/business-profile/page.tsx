/**
 * /admin/analytics/business-profile — GBP drilldown.
 *
 * Data from traffic_snapshots (source='gbp'). metrics jsonb blob:
 *   { profile_views, calls, directions, reviews, website_visits, messages,
 *     photo_views_owner, photo_views_customer, avg_rating }
 * detail jsonb:
 *   { top_queries: [{ query, views, actions }], recent_reviews:
 *     [{ name, rating, date, text }], search_queries: [...] }
 */
import { and, desc, eq, gte } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { trafficSnapshots } from "@/db/schema";
import { requireAdmin } from "@/lib/server-auth";
import { BusinessProfileDrill, type BPDrillProps } from "./BusinessProfileDrill";

export const dynamic = "force-dynamic";

function iso(d: Date) { return d.toISOString().slice(0, 10); }
function pctDelta(cur: number, prev: number): number {
  if (prev <= 0) return cur > 0 ? 100 : 0;
  return Math.round(((cur - prev) / prev) * 1000) / 10;
}

export default async function BusinessProfilePage() {
  await ensureSchema();
  await requireAdmin();
  const d = db();
  const now = new Date();
  const cutoff28 = new Date(now.getTime() - 28 * 24 * 3600_000);
  const prev28 = new Date(now.getTime() - 56 * 24 * 3600_000);

  const rows = await d
    .select({
      snapshotDate: trafficSnapshots.snapshotDate,
      metrics: trafficSnapshots.metrics,
      detail: trafficSnapshots.detail,
    })
    .from(trafficSnapshots)
    .where(and(eq(trafficSnapshots.source, "gbp"), gte(trafficSnapshots.snapshotDate, iso(prev28))));

  let views = 0, viewsPrev = 0;
  let calls = 0, callsPrev = 0;
  let directions = 0, directionsPrev = 0;
  let reviews = 0, reviewsPrev = 0;
  let websiteVisits = 0, messages = 0;
  let photoOwner = 0, photoCustomer = 0;
  let ratingSum = 0, ratingCount = 0;

  const weeklyViews = new Map<string, number>();
  const weeklyCalls = new Map<string, number>();
  const queryAgg = new Map<string, { views: number; actions: number }>();
  const recentReviews: { name: string; rating: number; date: string; text: string }[] = [];

  for (const r of rows) {
    const d0 = new Date(r.snapshotDate + "T00:00:00Z");
    const inCur = d0 >= cutoff28 && d0 <= now;
    const inPrev = d0 >= prev28 && d0 < cutoff28;
    const m = r.metrics as Record<string, number>;
    const det = (r.detail ?? {}) as Record<string, unknown>;

    if (inCur) {
      views += Number(m.profile_views ?? 0);
      calls += Number(m.calls ?? 0);
      directions += Number(m.directions ?? 0);
      reviews += Number(m.reviews ?? 0);
      websiteVisits += Number(m.website_visits ?? 0);
      messages += Number(m.messages ?? 0);
      photoOwner += Number(m.photo_views_owner ?? 0);
      photoCustomer += Number(m.photo_views_customer ?? 0);
      if (m.avg_rating) { ratingSum += Number(m.avg_rating); ratingCount += 1; }

      const wk = weekKey(d0);
      weeklyViews.set(wk, (weeklyViews.get(wk) ?? 0) + Number(m.profile_views ?? 0));
      weeklyCalls.set(wk, (weeklyCalls.get(wk) ?? 0) + Number(m.calls ?? 0));

      for (const q of ((det.top_queries ?? det.search_queries ?? []) as { query: string; views?: number; actions?: number }[])) {
        const e = queryAgg.get(q.query) ?? { views: 0, actions: 0 };
        e.views += Number(q.views ?? 0);
        e.actions += Number(q.actions ?? 0);
        queryAgg.set(q.query, e);
      }
      for (const rv of ((det.recent_reviews ?? []) as { name: string; rating: number; date: string; text: string }[])) {
        recentReviews.push(rv);
      }
    }
    if (inPrev) {
      viewsPrev += Number(m.profile_views ?? 0);
      callsPrev += Number(m.calls ?? 0);
      directionsPrev += Number(m.directions ?? 0);
      reviewsPrev += Number(m.reviews ?? 0);
    }
  }

  const avgRating = ratingCount > 0 ? ratingSum / ratingCount : 0;

  const weeks = Array.from(new Set([...weeklyViews.keys(), ...weeklyCalls.keys()])).sort().slice(-12);
  const chartWeekly = weeks.map((wk) => ({
    label: wk,
    views: weeklyViews.get(wk) ?? 0,
    calls: weeklyCalls.get(wk) ?? 0,
  }));

  const topQueries = [...queryAgg.entries()]
    .map(([query, e]) => ({ query, views: e.views, actions: e.actions }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 12);

  const seen = new Set<string>();
  const dedupReviews = recentReviews
    .filter((r) => {
      const k = `${r.name}::${r.date}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 8);

  const props: BPDrillProps = {
    empty: rows.length === 0,
    hero: {
      profileViews: { value: views, delta: pctDelta(views, viewsPrev) },
      calls:        { value: calls, delta: pctDelta(calls, callsPrev) },
      directions:   { value: directions, delta: pctDelta(directions, directionsPrev) },
      reviews:      { value: reviews, delta: pctDelta(reviews, reviewsPrev), avgRating },
    },
    chartWeekly,
    topQueries,
    customerActions: {
      websiteVisits,
      calls,
      directions,
      messages,
    },
    photoViews: {
      owner: photoOwner,
      customer: photoCustomer,
    },
    recentReviews: dedupReviews,
  };

  return <BusinessProfileDrill {...props} />;
}

function weekKey(d: Date): string {
  const jan1 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const days = Math.floor((d.getTime() - jan1.getTime()) / 86_400_000);
  const wk = Math.floor((days + jan1.getUTCDay()) / 7) + 1;
  return `${d.getUTCFullYear()}-W${String(wk).padStart(2, "0")}`;
}
