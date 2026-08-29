import { useEffect, useMemo, useState } from "react";
import {
  Star,
  Phone,
  Navigation,
  Eye,
  MessageSquare,
  MapPin,
  Search,
  Loader2,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { type ConnectedSite, useSite } from "@/lib/site-context";

type PerformanceSeries = {
  dailyMetricTimeSeries?: {
    dailyMetric: string;
    timeSeries?: { datedValues?: { date: { year: number; month: number; day: number }; value?: string }[] };
  };
}[];

type GbpInsights = {
  ok: boolean;
  error?: string | null;
  location: { name: string; title: string } | null;
  performance: { ok: boolean; error: string | null; series: PerformanceSeries };
  reviews: { ok: boolean; error: string | null; reviews: any[]; averageRating: number | null; totalReviewCount: number | null };
  searchKeywords: { ok: boolean; error: string | null; keywords: any[] };
};

const METRIC_META: Record<string, { label: string; icon: typeof Eye; from: string; to: string }> = {
  BUSINESS_IMPRESSIONS_DESKTOP_MAPS: { label: "Maps Impressions (Desktop)", icon: Eye, from: "#a78bfa", to: "#ec4899" },
  BUSINESS_IMPRESSIONS_MOBILE_MAPS: { label: "Maps Impressions (Mobile)", icon: Eye, from: "#a78bfa", to: "#ec4899" },
  BUSINESS_IMPRESSIONS_DESKTOP_SEARCH: { label: "Search Impressions (Desktop)", icon: Search, from: "#22d3ee", to: "#3b82f6" },
  BUSINESS_IMPRESSIONS_MOBILE_SEARCH: { label: "Search Impressions (Mobile)", icon: Search, from: "#22d3ee", to: "#3b82f6" },
  CALL_CLICKS: { label: "Calls", icon: Phone, from: "#34d399", to: "#14b8a6" },
  BUSINESS_DIRECTION_REQUESTS: { label: "Direction Requests", icon: Navigation, from: "#fbbf24", to: "#f97316" },
  WEBSITE_CLICKS: { label: "Website Clicks", icon: Navigation, from: "#f472b6", to: "#db2777" },
  BUSINESS_CONVERSATIONS: { label: "Messages", icon: MessageSquare, from: "#818cf8", to: "#6366f1" },
};

function sumSeries(series: PerformanceSeries, metric: string): number {
  const entry = series.find((s) => s.dailyMetricTimeSeries?.dailyMetric === metric);
  const values = entry?.dailyMetricTimeSeries?.timeSeries?.datedValues || [];
  return values.reduce((sum, v) => sum + (parseInt(v.value || "0", 10) || 0), 0);
}

export function BusinessProfileDrilldown({ site }: { site?: ConnectedSite }) {
  const { currentSite } = useSite();
  const activeSite = site || currentSite;

  const [data, setData] = useState<GbpInsights | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    if (!activeSite?.gbpConnected) {
      setData(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    fetch("/api/google/gbp-insights")
      .then((res) => res.json())
      .then((json: GbpInsights) => {
        if (json?.ok === false && !json.location) {
          setError(json.error || "Failed to load Google Business Profile data");
          setData(null);
        } else {
          setData(json);
        }
      })
      .catch((err) => setError(err?.message || "Failed to load Google Business Profile data"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSite?.gbpConnected]);

  const kpis = useMemo(() => {
    const series = data?.performance?.series || [];
    if (!data?.performance?.ok) return null;
    return [
      { label: "Calls", metric: "CALL_CLICKS", value: sumSeries(series, "CALL_CLICKS") },
      { label: "Direction Requests", metric: "BUSINESS_DIRECTION_REQUESTS", value: sumSeries(series, "BUSINESS_DIRECTION_REQUESTS") },
      { label: "Website Clicks", metric: "WEBSITE_CLICKS", value: sumSeries(series, "WEBSITE_CLICKS") },
      {
        label: "Search + Maps Impressions",
        metric: "impressions",
        value:
          sumSeries(series, "BUSINESS_IMPRESSIONS_DESKTOP_MAPS") +
          sumSeries(series, "BUSINESS_IMPRESSIONS_MOBILE_MAPS") +
          sumSeries(series, "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH") +
          sumSeries(series, "BUSINESS_IMPRESSIONS_MOBILE_SEARCH"),
      },
    ];
  }, [data]);

  if (!activeSite?.gbpConnected) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 p-10 text-center">
        <MapPin className="mx-auto h-8 w-8 text-slate-600" />
        <h3 className="mt-3 text-sm font-semibold text-white">Google Business Profile not connected</h3>
        <p className="mx-auto mt-1.5 max-w-md text-xs text-slate-500">
          Sync this site's GBP location from the Knowledge Base screen to see real profile data here — nothing is
          shown until a real connection exists.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="rounded-2xl border border-violet-500/20 bg-gradient-to-r from-violet-950/40 via-slate-900/60 to-slate-950 p-6 backdrop-blur-md">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-xl border border-violet-400/30 bg-violet-400/10 text-violet-300">
              <MapPin className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-violet-400">
                  Google Business Profile
                </span>
                <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[9px] font-mono text-emerald-300">
                  Connected
                </span>
              </div>
              <h2 className="mt-1 text-xl font-bold text-white">Local Presence &amp; Customer Actions</h2>
              <p className="mt-0.5 text-xs text-slate-400">
                Real performance metrics and reviews for{" "}
                <span className="font-semibold text-slate-200">
                  {data?.location?.title || activeSite?.label || "this site"}
                </span>
                . Last 84 days.
              </p>
            </div>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 text-xs font-semibold text-violet-300 hover:bg-violet-500/20 transition disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      </div>

      {loading && !data && (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-800 bg-slate-900/30 p-10 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading real GBP data…
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {data && (
        <>
          {/* KPIs — real Performance API totals, or an honest "not available" card */}
          {kpis ? (
            <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {kpis.map((k) => (
                <div key={k.label} className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
                  <div className="mt-1 text-xs uppercase tracking-wider text-slate-500">{k.label}</div>
                  <div className="mt-1 text-xl font-semibold tabular-nums text-white">{k.value.toLocaleString()}</div>
                </div>
              ))}
            </section>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 p-5 text-xs text-slate-500">
              <AlertTriangle className="mb-1.5 inline h-3.5 w-3.5 text-amber-400" /> Performance metrics not available
              {data.performance.error ? `: ${data.performance.error}` : " — the Business Profile Performance API may need to be enabled for this service account."}
            </div>
          )}

          {/* Reviews — real Google reviews, or an honest "not available" card */}
          <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-white">Recent Reviews</div>
                {data.reviews.ok && (
                  <div className="text-[11px] text-slate-500">
                    {data.reviews.averageRating ? `Overall rating ${data.reviews.averageRating}` : ""}
                    {data.reviews.totalReviewCount ? ` · ${data.reviews.totalReviewCount} reviews` : ""}
                  </div>
                )}
              </div>
              <MessageSquare className="h-4 w-4 text-slate-500" />
            </div>

            {!data.reviews.ok ? (
              <div className="mt-3 rounded-lg border border-dashed border-slate-800 bg-slate-950/40 p-4 text-xs text-slate-500">
                <AlertTriangle className="mb-1.5 inline h-3.5 w-3.5 text-amber-400" /> Reviews not available
                {data.reviews.error ? `: ${data.reviews.error}` : " — the My Business API may need to be enabled for this service account."}
              </div>
            ) : data.reviews.reviews.length === 0 ? (
              <div className="mt-3 rounded-lg border border-dashed border-slate-800 bg-slate-950/40 p-4 text-xs text-slate-500">
                No reviews yet for this location.
              </div>
            ) : (
              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                {data.reviews.reviews.map((r: any) => {
                  const rating = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 }[r.starRating as string] || 0;
                  return (
                    <div key={r.reviewId || r.name} className="rounded-lg border border-slate-800 bg-slate-950/40 p-3 shadow-md">
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-medium text-slate-200">{r.reviewer?.displayName || "Google user"}</div>
                        <div className="text-[10px] text-slate-500">
                          {r.updateTime ? new Date(r.updateTime).toLocaleDateString() : ""}
                        </div>
                      </div>
                      <div className="mt-1 flex items-center gap-0.5">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star key={i} className={`h-3 w-3 ${i < rating ? "fill-amber-400 text-amber-400" : "text-slate-700"}`} />
                        ))}
                      </div>
                      {r.comment && <p className="mt-2 text-xs leading-relaxed text-slate-400">{r.comment}</p>}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Search keywords — real Performance API monthly search terms */}
          <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-white">Top Search Queries</div>
              <Search className="h-4 w-4 text-slate-500" />
            </div>
            {!data.searchKeywords.ok ? (
              <div className="mt-3 rounded-lg border border-dashed border-slate-800 bg-slate-950/40 p-4 text-xs text-slate-500">
                <AlertTriangle className="mb-1.5 inline h-3.5 w-3.5 text-amber-400" /> Search queries not available
                {data.searchKeywords.error ? `: ${data.searchKeywords.error}` : " — the Business Profile Performance API may need to be enabled for this service account."}
              </div>
            ) : data.searchKeywords.keywords.length === 0 ? (
              <div className="mt-3 rounded-lg border border-dashed border-slate-800 bg-slate-950/40 p-4 text-xs text-slate-500">
                No search query data yet for this location.
              </div>
            ) : (
              <div className="mt-4 overflow-hidden rounded-lg border border-slate-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/60 text-[10px] uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">Query</th>
                      <th className="px-3 py-2 text-right font-medium">Impressions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {data.searchKeywords.keywords.map((k: any) => (
                      <tr key={k.searchKeyword} className="hover:bg-slate-900/60 transition">
                        <td className="px-3 py-2 text-slate-200">{k.searchKeyword}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-300">
                          {(k.insightsValue?.value ?? k.insightsValue?.threshold ?? "—")?.toString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
