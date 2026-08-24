import { Link } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import {
  ArrowUpRight,
  ArrowDownRight,
  Users,
  Eye,
  MousePointerClick,
  Clock,
  Globe,
  Smartphone,
  Monitor,
  Tablet,
  Download,
  TrendingUp,
  TrendingDown,
  Sparkles,
  AlertTriangle,
  DollarSign,
  BarChart3,
} from "lucide-react";
import { type ConnectedSite, useSite } from "@/lib/site-context";
import { EntriesModal100 } from "@/components/entries-modal-100";

// ────────────────────────────────────────────────────────────────────────────
// Comparison-period presets shared with Search Console screen.
// ────────────────────────────────────────────────────────────────────────────
const RANGES = [
  { id: "7d", label: "7 days", compare: "prev 7d" },
  { id: "14v14", label: "14 days", compare: "prev 14d" },
  { id: "28d", label: "28 days", compare: "prev 28d" },
  { id: "last_month", label: "Last month", compare: "prev month" },
  { id: "3m", label: "3 months", compare: "prev 3m" },
  { id: "6m", label: "6 months", compare: "prev 6m" },
  { id: "12m", label: "12 months", compare: "YoY" },
] as const;
type RangeId = (typeof RANGES)[number]["id"];

function getDateRangeParams(rangeId: RangeId) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  if (rangeId === "last_month") {
    const lastMonthYear = month === 0 ? year - 1 : year;
    const lastMonthNum = month === 0 ? 12 : month;
    const startStr = `${lastMonthYear}-${String(lastMonthNum).padStart(2, "0")}-01`;
    const lastDay = new Date(lastMonthYear, lastMonthNum, 0).getDate();
    const endStr = `${lastMonthYear}-${String(lastMonthNum).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    return { startDate: startStr, endDate: endStr };
  }

  const map: Record<string, { startDate: string; endDate: string }> = {
    "7d": { startDate: "7daysAgo", endDate: "today" },
    "14v14": { startDate: "14daysAgo", endDate: "today" },
    "28d": { startDate: "28daysAgo", endDate: "today" },
    "3m": { startDate: "90daysAgo", endDate: "today" },
    "6m": { startDate: "180daysAgo", endDate: "today" },
    "12m": { startDate: "365daysAgo", endDate: "today" },
  };
  return map[rangeId] || { startDate: "28daysAgo", endDate: "today" };
}

function fmtSecs(s: number) {
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return `${m}m ${r}s`;
}

const DEVICE_META: Record<string, { icon: typeof Smartphone; color: string }> = {
  mobile: { icon: Smartphone, color: "#22d3ee" },
  desktop: { icon: Monitor, color: "#a78bfa" },
  tablet: { icon: Tablet, color: "#fbbf24" },
};

export function GoogleAnalyticsDrilldown({ site }: { site?: ConnectedSite }) {
  const { currentSite } = useSite();
  const activeSite = site || currentSite;
  const [rangeId, setRangeId] = useState<RangeId>("28d");
  const [activeModal, setActiveModal] = useState<"pages" | null>(null);
  const [liveData, setLiveData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(() => RANGES.find((r) => r.id === rangeId)!, [rangeId]);

  const propertyId = useMemo(() => {
    const gaProp = activeSite.gaProperty || "";
    const match = gaProp.match(/\((\d+)\)/);
    return match ? match[1] : "";
  }, [activeSite.gaProperty]);

  useEffect(() => {
    let isMounted = true;

    if (!activeSite.gaConnected || !propertyId) {
      setLiveData(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    const { startDate, endDate } = getDateRangeParams(rangeId);
    fetch(`/api/google/ga4?propertyId=${propertyId}&startDate=${startDate}&endDate=${endDate}`)
      .then((res) => res.json())
      .then((data) => {
        if (!isMounted) return;
        if (data?.ok) {
          setLiveData(data);
        } else {
          setLiveData(null);
          setError(data?.error || "Failed to load GA4 data");
        }
      })
      .catch((err) => {
        if (isMounted) {
          setLiveData(null);
          setError(err?.message || "Failed to load GA4 data");
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, [rangeId, activeSite.gaConnected, propertyId]);

  const overviewVals = liveData?.overview?.rows?.[0]?.metricValues as { value: string }[] | undefined;

  const kpis = useMemo(() => {
    if (!overviewVals) return null;
    const users = parseInt(overviewVals[0]?.value || "0", 10);
    const sessions = parseInt(overviewVals[1]?.value || "0", 10);
    const rawDur = parseFloat(overviewVals[4]?.value || "0");
    const duration = users > 0 && rawDur > 1000 ? Math.round(rawDur / users) : Math.round(rawDur);
    const conversions = parseInt(overviewVals[5]?.value || "0", 10);
    return [
      { key: "sessions", label: "Total Sessions", value: sessions, icon: Users, from: "#fb923c", to: "#f59e0b", format: "int" as const },
      { key: "users", label: "Active Users", value: users, icon: Users, from: "#a78bfa", to: "#ec4899", format: "int" as const },
      { key: "engagement", label: "Avg Engagement", value: duration, icon: Clock, from: "#22d3ee", to: "#3b82f6", format: "time" as const },
      { key: "conversions", label: "Goal Conversions", value: conversions, icon: MousePointerClick, from: "#34d399", to: "#14b8a6", format: "int" as const },
    ];
  }, [overviewVals]);

  const secondaryKpis = useMemo(() => {
    if (!overviewVals) return null;
    const eventCount = parseInt(overviewVals[2]?.value || "0", 10).toLocaleString();
    const bounceRate = (parseFloat(overviewVals[3]?.value || "0") * 100).toFixed(1) + "%";
    return [
      { key: "events", label: "Total Events", value: eventCount, icon: DollarSign, from: "#34d399", to: "#059669" },
      { key: "bounce", label: "Bounce Rate", value: bounceRate, icon: TrendingDown, from: "#22d3ee", to: "#3b82f6" },
    ];
  }, [overviewVals]);

  const channels = useMemo(() => {
    const rows = liveData?.channels?.rows as Array<{ dimensionValues?: { value: string }[]; metricValues?: { value: string }[] }> | undefined;
    if (!rows?.length) return [];
    const totalSessions = rows.reduce((sum, r) => sum + parseInt(r.metricValues?.[0]?.value || "0", 10), 0) || 1;
    return rows
      .map((r) => {
        const name = r.dimensionValues?.[0]?.value || "Direct";
        const sessions = parseInt(r.metricValues?.[0]?.value || "0", 10);
        const share = parseFloat(((sessions / totalSessions) * 100).toFixed(1));
        return { name, sessions, share };
      })
      .sort((a, b) => b.sessions - a.sessions);
  }, [liveData]);

  const devices = useMemo(() => {
    const rows = liveData?.devices?.rows as Array<{ dimensionValues?: { value: string }[]; metricValues?: { value: string }[] }> | undefined;
    if (!rows?.length) return [];
    const total = rows.reduce((sum, r) => sum + parseInt(r.metricValues?.[0]?.value || "0", 10), 0) || 1;
    return rows.map((r) => {
      const name = (r.dimensionValues?.[0]?.value || "other").toLowerCase();
      const sessions = parseInt(r.metricValues?.[0]?.value || "0", 10);
      const pct = parseFloat(((sessions / total) * 100).toFixed(1));
      return { name, sessions, pct, meta: DEVICE_META[name] || { icon: Globe, color: "#94a3b8" } };
    });
  }, [liveData]);

  const countries = useMemo(() => {
    const rows = liveData?.countries?.rows as Array<{ dimensionValues?: { value: string }[]; metricValues?: { value: string }[] }> | undefined;
    if (!rows?.length) return [];
    const sorted = rows
      .map((r) => ({
        name: r.dimensionValues?.[0]?.value || "Unknown",
        sessions: parseInt(r.metricValues?.[0]?.value || "0", 10),
      }))
      .sort((a, b) => b.sessions - a.sessions)
      .slice(0, 8);
    const max = sorted[0]?.sessions || 1;
    return sorted.map((c) => ({ ...c, pct: parseFloat(((c.sessions / max) * 100).toFixed(1)) }));
  }, [liveData]);

  const pages = useMemo(() => {
    const rows = liveData?.pages?.rows as Array<{ dimensionValues?: { value: string }[]; metricValues?: { value: string }[] }> | undefined;
    if (!rows?.length) return [];
    return rows
      .map((r) => ({
        url: r.dimensionValues?.[0]?.value || "/",
        views: parseInt(r.metricValues?.[0]?.value || "0", 10),
        avgSecs: parseFloat(r.metricValues?.[1]?.value || "0"),
        conv: parseInt(r.metricValues?.[2]?.value || "0", 10),
      }))
      .sort((a, b) => b.views - a.views);
  }, [liveData]);

  const trend = useMemo(() => {
    const rows = liveData?.trend?.rows as Array<{ dimensionValues?: { value: string }[]; metricValues?: { value: string }[] }> | undefined;
    if (!rows?.length) return [];
    return rows.map((r) => ({
      date: r.dimensionValues?.[0]?.value || "",
      sessions: parseInt(r.metricValues?.[0]?.value || "0", 10),
      users: parseInt(r.metricValues?.[1]?.value || "0", 10),
    }));
  }, [liveData]);

  const notConnected = !activeSite.gaConnected;
  const hasData = !!overviewVals;

  return (
    <div className="space-y-6">
      {/* Consolidated GA4 Header Banner Widget */}
      <div className="rounded-2xl border border-amber-500/20 bg-gradient-to-r from-amber-950/40 via-slate-900/60 to-slate-950 p-6 backdrop-blur-md">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-xl border border-amber-400/30 bg-amber-400/10 text-amber-300">
              <BarChart3 className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-400">
                  Google Analytics 4 Property
                </span>
                <span className={`rounded-full border px-2 py-0.5 text-[9px] font-mono ${
                  notConnected
                    ? "border-slate-700 bg-slate-800/60 text-slate-400"
                    : hasData
                      ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                      : "border-amber-400/30 bg-amber-400/10 text-amber-300"
                }`}>
                  {notConnected ? "Not Connected" : hasData ? "Live Stream Connected" : loading ? "Loading…" : "No Data"}
                </span>
              </div>
              <h2 className="mt-1 text-xl font-bold text-white">
                Traffic &amp; Engagement Insights
              </h2>
              <p className="mt-0.5 text-xs text-slate-400">
                GA4 property stream · web &amp; app analytics · comparing to {range.compare} for{" "}
                <span className="font-semibold text-slate-200">{activeSite?.label} ({activeSite?.domain})</span>.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/20 transition cursor-pointer">
              <Download className="h-3.5 w-3.5" /> Export Report
            </button>
          </div>
        </div>
      </div>

      {notConnected ? (
        <div className="rounded-2xl border border-rose-500/30 bg-gradient-to-br from-rose-950/20 via-slate-950 to-slate-900 p-10 text-center shadow-2xl">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-rose-500/10 text-rose-400 border border-rose-500/30">
            <AlertTriangle className="h-7 w-7" />
          </div>
          <h3 className="mt-4 text-xl font-bold text-white">Google Analytics Account Not Connected</h3>
          <p className="mt-2 text-sm text-slate-400 max-w-lg mx-auto">
            No GA4 property is linked for <span className="font-bold text-white">{activeSite.label} ({activeSite.domain})</span>.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link to="/connected-sites" className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-5 py-2.5 text-xs font-bold text-slate-950 shadow-lg hover:bg-cyan-400 transition">
              <BarChart3 className="h-4 w-4" />
              Connect GA4 Property
            </Link>
          </div>
        </div>
      ) : (
        <>
          {/* Comparison filter bar */}
          <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-900/40 p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-[11px] text-slate-400">
                <Sparkles className="h-3.5 w-3.5 text-orange-300" />
                Comparison range · <span className="text-slate-300">{range.label}</span>{" "}
                <span className="text-slate-600">vs</span>{" "}
                <span className="text-slate-300">{range.compare}</span>
              </div>
              <div className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-800 bg-slate-950/60 p-1 text-xs">
                {RANGES.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setRangeId(r.id)}
                    className={`rounded-md px-2.5 py-1.5 font-medium transition ${
                      r.id === rangeId
                        ? "bg-orange-400/15 text-orange-200 shadow-[inset_0_0_0_1px_rgba(251,146,60,0.35)]"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-[12px] text-rose-200">
              {error}
            </div>
          )}

          {/* Primary KPIs */}
          {kpis ? (
            <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {kpis.map((k) => {
                const Icon = k.icon;
                return (
                  <div key={k.label} className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/40 p-4 transition hover:-translate-y-0.5 hover:border-slate-600">
                    <div
                      aria-hidden
                      className="absolute inset-x-0 top-0 h-px"
                      style={{ background: `linear-gradient(to right, ${k.from}, ${k.to})` }}
                    />
                    <div
                      className="grid h-9 w-9 place-items-center rounded-lg text-slate-950"
                      style={{ background: `linear-gradient(135deg, ${k.from}, ${k.to})` }}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="mt-3 text-xs uppercase tracking-wider text-slate-500">{k.label}</div>
                    <div className="mt-1 text-xl font-semibold tabular-nums text-white">
                      {k.format === "time" ? fmtSecs(k.value) : k.value.toLocaleString()}
                    </div>
                  </div>
                );
              })}
            </section>
          ) : (
            <EmptyPanel loading={loading} label="No overview data for this range." />
          )}

          {/* Secondary KPI strip */}
          {secondaryKpis && (
            <section className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {secondaryKpis.map((k) => {
                const Icon = k.icon;
                return (
                  <div key={k.key} className="rounded-xl border border-slate-800 bg-slate-900/30 p-3">
                    <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500">
                      <Icon className="h-3 w-3" style={{ color: k.from }} /> {k.label}
                    </div>
                    <div className="mt-1 text-sm font-semibold tabular-nums text-white">{k.value}</div>
                  </div>
                );
              })}
            </section>
          )}

          {/* Trend chart */}
          <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-white">Sessions &amp; Users Trend</div>
              <TrendingUp className="h-4 w-4 text-slate-500" />
            </div>
            {trend.length > 1 ? (
              <DualChart data={trend} />
            ) : (
              <EmptyPanel loading={loading} label="No trend data for this range." />
            )}
          </section>

          {/* Channels + Devices */}
          <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 lg:col-span-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-white">Top Channels</div>
                  <div className="text-[11px] text-slate-500">Sessions by acquisition channel</div>
                </div>
                <TrendingUp className="h-4 w-4 text-slate-500" />
              </div>
              {channels.length > 0 ? (
                <div className="mt-4 space-y-3">
                  {channels.map((c) => (
                    <div key={c.name}>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-200">{c.name}</span>
                        <span className="tabular-nums text-slate-400">{c.sessions.toLocaleString()}</span>
                      </div>
                      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${c.share}%`, background: "linear-gradient(to right, #fb923c, #f59e0b)" }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyPanel loading={loading} label="No channel data for this range." />
              )}
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
              <div className="text-sm font-semibold text-white">Devices</div>
              {devices.length > 0 ? (
                <div className="mt-4 space-y-3">
                  {devices.map((d) => {
                    const Icon = d.meta.icon;
                    return (
                      <div key={d.name}>
                        <div className="flex items-center justify-between text-xs">
                          <span className="inline-flex items-center gap-1.5 text-slate-200 capitalize">
                            <Icon className="h-3.5 w-3.5" style={{ color: d.meta.color }} /> {d.name}
                          </span>
                          <span className="tabular-nums text-slate-400">{d.pct}%</span>
                        </div>
                        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${d.pct}%`, background: `linear-gradient(to right, ${d.meta.color}, ${d.meta.color}80)` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyPanel loading={loading} label="No device data." compact />
              )}
            </div>
          </section>

          {/* Pages + Countries */}
          <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 lg:col-span-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-white">Top Performing Pages</div>
                  <div className="text-[11px] text-slate-500">Views, engagement and conversions</div>
                </div>
                <div className="flex items-center gap-2">
                  {pages.length > 0 && (
                    <button
                      onClick={() => setActiveModal("pages")}
                      className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-300 hover:bg-amber-500/20 transition cursor-pointer"
                    >
                      View All ({pages.length})
                    </button>
                  )}
                  <Eye className="h-4 w-4 text-slate-500" />
                </div>
              </div>
              {pages.length > 0 ? (
                <div className="mt-4 overflow-hidden rounded-lg border border-slate-800">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950/60 text-[10px] uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Page</th>
                        <th className="px-3 py-2 text-right">Views</th>
                        <th className="px-3 py-2 text-right">Avg. Time</th>
                        <th className="px-3 py-2 text-right">Conv.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {pages.slice(0, 7).map((p) => (
                        <tr key={p.url} className="hover:bg-slate-900/60">
                          <td className="px-3 py-2 text-slate-200">{p.url}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-300">{p.views.toLocaleString()}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-400">{fmtSecs(p.avgSecs)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-emerald-300">{p.conv}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyPanel loading={loading} label="No page data for this range." />
              )}
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-white">Top Countries</div>
                <Globe className="h-4 w-4 text-slate-500" />
              </div>
              {countries.length > 0 ? (
                <div className="mt-4 space-y-3">
                  {countries.map((c) => (
                    <div key={c.name}>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-200">{c.name}</span>
                        <span className="tabular-nums text-slate-400">{c.sessions.toLocaleString()}</span>
                      </div>
                      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${c.pct}%`, background: "linear-gradient(to right, #a78bfa, #ec4899)" }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyPanel loading={loading} label="No country data." compact />
              )}
            </div>
          </section>

          {/* EntriesModal100 for full pages list */}
          {pages.length > 0 && (
            <EntriesModal100
              isOpen={activeModal !== null}
              onClose={() => setActiveModal(null)}
              title="All Top Performing Pages"
              subtitle={`GA4 landing page views, engagement time, and goal conversions for ${range.label}`}
              type="pages"
              entries={pages.map((p, idx) => ({
                id: `ga-pg-${idx}`,
                title: p.url,
                clicks: p.views,
                imp: 0,
                ctr: 0,
                pos: 0,
                delta: 0,
              }))}
            />
          )}
        </>
      )}

      <div aria-hidden className="h-16" />
    </div>
  );
}

function EmptyPanel({ loading, label, compact }: { loading: boolean; label: string; compact?: boolean }) {
  return (
    <div className={`flex items-center justify-center rounded-lg border border-dashed border-slate-800 text-[12px] text-slate-500 ${compact ? "mt-4 h-24" : "h-32"}`}>
      {loading ? "Loading…" : label}
    </div>
  );
}

function DualChart({ data }: { data: { date: string; sessions: number; users: number }[] }) {
  const w = 800;
  const h = 220;
  const pad = 30;
  const max = Math.max(...data.map((d) => Math.max(d.sessions, d.users)), 1);
  const step = (w - pad * 2) / Math.max(data.length - 1, 1);
  const y = (v: number) => h - pad - (v / max) * (h - pad * 2);
  const lineS = data.map((d, i) => `${i === 0 ? "M" : "L"} ${pad + i * step},${y(d.sessions)}`).join(" ");
  const lineU = data.map((d, i) => `${i === 0 ? "M" : "L"} ${pad + i * step},${y(d.users)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-4 w-full">
      <defs>
        <linearGradient id="ga-s" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#fb923c" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#fb923c" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 0.25, 0.5, 0.75, 1].map((t) => (
        <line key={t} x1={pad} x2={w - pad} y1={pad + (h - pad * 2) * t} y2={pad + (h - pad * 2) * t} stroke="rgb(30 41 59)" strokeDasharray="2 4" />
      ))}
      <path d={`${lineS} L ${pad + (data.length - 1) * step},${h - pad} L ${pad},${h - pad} Z`} fill="url(#ga-s)" />
      <path d={lineS} fill="none" stroke="#fb923c" strokeWidth="2.5" />
      <path d={lineU} fill="none" stroke="#e879f9" strokeWidth="2" strokeDasharray="4 3" />
      {data.map((d, i) =>
        i % Math.ceil(data.length / 12) === 0 ? (
          <text key={d.date} x={pad + i * step} y={h - 8} textAnchor="middle" fontSize="9" fill="#64748b">
            {d.date.slice(4, 6)}/{d.date.slice(6, 8)}
          </text>
        ) : null,
      )}
    </svg>
  );
}
