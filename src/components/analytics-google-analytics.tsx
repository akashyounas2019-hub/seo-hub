import { Link } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import {
  ArrowLeft,
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
  Filter,
  AlertTriangle,
  Zap,
  DollarSign,
  Repeat,
  ChevronRight,
  BarChart3,
} from "lucide-react";
import { type ConnectedSite, useSite } from "@/lib/site-context";

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

const BASE_KPIS = [
  { key: "sessions", label: "Total Sessions", base: 543, delta: 12.4, icon: Users, from: "#fb923c", to: "#f59e0b", format: "int" as const },
  { key: "users", label: "Active Users", base: 415, delta: 9.1, icon: Users, from: "#a78bfa", to: "#ec4899", format: "int" as const },
  { key: "engagement", label: "Avg Engagement", base: 49, delta: 3.1, icon: Clock, from: "#22d3ee", to: "#3b82f6", format: "time" as const },
  { key: "conversions", label: "Goal Conversions", base: 185, delta: 8.7, icon: MousePointerClick, from: "#34d399", to: "#14b8a6", format: "int" as const },
];

const SECONDARY_KPIS = [
  { key: "revenue", label: "Event Count", value: "2.5K", delta: 14.6, icon: DollarSign, from: "#34d399", to: "#059669" },
  { key: "bounce", label: "Bounce Rate", value: "31.6%", delta: -2.4, icon: TrendingDown, from: "#22d3ee", to: "#3b82f6", goodDown: true },
  { key: "pps", label: "Pages / Session", value: "2.8", delta: 6.1, icon: Eye, from: "#a78bfa", to: "#ec4899" },
  { key: "new", label: "New vs Returning", value: "390 / 25", delta: 4.2, icon: Repeat, from: "#fbbf24", to: "#f97316" },
  { key: "events", label: "Total Events", value: "2.5K", delta: 11.8, icon: Zap, from: "#f472b6", to: "#a855f7" },
];

const CHANNELS = [
  { name: "Organic Search", sessions: 318, share: 57.7, delta: 14.2 },
  { name: "Direct", sessions: 91, share: 16.5, delta: 5.4 },
  { name: "AI Assistant (ChatGPT / Gemini / Claude)", sessions: 64, share: 11.6, delta: 24.8 },
  { name: "Organic Social", sessions: 40, share: 7.3, delta: 8.1 },
  { name: "Referral", sessions: 31, share: 5.6, delta: 3.2 },
];

const PAGES = [
  { url: "/ (Home - Safaeewala Cleaning)", views: 647, avg: "40s", conv: 121, delta: 18.2 },
  { url: "/contact-us/", views: 18, avg: "1m 12s", conv: 32, delta: 6.4 },
  { url: "/service/medical-cleaning-services/", views: 13, avg: "44s", conv: 0, delta: 12.1 },
  { url: "/service/house-cleaning-services-in-dubai/", views: 10, avg: "52s", conv: 0, delta: 6.5 },
  { url: "/booking-form/", views: 7, avg: "38s", conv: 6, delta: 9.8 },
  { url: "/cleaning-service-areas/al-qusais/", views: 7, avg: "35s", conv: 0, delta: 4.1 },
  { url: "/service/deep-cleaning/", views: 6, avg: "42s", conv: 0, delta: 3.2 },
];

const RISING_PAGES = [
  { url: "/ (Home - Safaeewala Cleaning)", delta: 18.2 },
  { url: "/contact-us/", delta: 14.6 },
  { url: "/service/medical-cleaning-services/", delta: 12.1 },
  { url: "/booking-form/", delta: 6.4 },
];

const DROPPING_PAGES = [
  { url: "/service/house-cleaning-services-in-dubai/", delta: -3.2 },
  { url: "/cleaning-service-areas/al-qusais/", delta: -4.1 },
];

const ENGAGEMENT_ALERTS = [
  { label: "Mobile bounce rate", value: "44.1%", delta: 5.2, hint: "spike on /pricing" },
  { label: "Avg. session (Desktop)", value: "1m 42s", delta: -12.4, hint: "down vs prev period" },
  { label: "Exit rate /checkout", value: "62%", delta: 8.9, hint: "review CTA position" },
];

const DEVICES = [
  { name: "Mobile", pct: 68, icon: Smartphone, color: "#22d3ee", delta: 3.2 },
  { name: "Desktop", pct: 26, icon: Monitor, color: "#a78bfa", delta: -2.1 },
  { name: "Tablet", pct: 6, icon: Tablet, color: "#fbbf24", delta: -1.1 },
];

const COUNTRIES = [
  { flag: "🇦🇪", name: "United Arab Emirates", sessions: 32410, pct: 67.2 },
  { flag: "🇸🇦", name: "Saudi Arabia", sessions: 6820, pct: 14.1 },
  { flag: "🇬🇧", name: "United Kingdom", sessions: 2410, pct: 5.0 },
  { flag: "🇮🇳", name: "India", sessions: 1980, pct: 4.1 },
  { flag: "🇺🇸", name: "United States", sessions: 1420, pct: 2.9 },
];

const TREND = [
  { w: "W1", s: 2800, u: 1900 }, { w: "W2", s: 3100, u: 2100 },
  { w: "W3", s: 2950, u: 2000 }, { w: "W4", s: 3400, u: 2280 },
  { w: "W5", s: 3620, u: 2410 }, { w: "W6", s: 3880, u: 2610 },
  { w: "W7", s: 4020, u: 2720 }, { w: "W8", s: 4310, u: 2880 },
  { w: "W9", s: 4180, u: 2790 }, { w: "W10", s: 4520, u: 3010 },
  { w: "W11", s: 4720, u: 3180 }, { w: "W12", s: 4980, u: 3320 },
];

function fmtSecs(s: number) {
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return `${m}m ${r}s`;
}

function fmt(n: number, kind: "int" | "time") {
  if (kind === "time") return fmtSecs(n);
  return Math.round(n).toLocaleString();
}

export function GoogleAnalyticsDrilldown({ site }: { site?: ConnectedSite }) {
  const { currentSite } = useSite();
  const activeSite = site || currentSite;
  const [rangeId, setRangeId] = useState<RangeId>("28d");
  const [liveData, setLiveData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const range = useMemo(() => RANGES.find((r) => r.id === rangeId)!, [rangeId]);

  useEffect(() => {
    let isMounted = true;
    
    const gaProp = activeSite.gaProperty || "";
    const match = gaProp.match(/\((\d+)\)/);
    const propertyId = match ? match[1] : "";

    if (!activeSite.gaConnected || !propertyId) {
      setLiveData(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const { startDate, endDate } = getDateRangeParams(rangeId);
    fetch(`/api/google/analytics?propertyId=${propertyId}&startDate=${startDate}&endDate=${endDate}`)
      .then((res) => res.json())
      .then((data) => {
        if (isMounted && data && data.ok) {
          setLiveData(data);
        } else if (isMounted) {
          setLiveData(null);
        }
      })
      .catch(() => {
        if (isMounted) setLiveData(null);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, [rangeId, activeSite]);

  const rangeMultiplier = useMemo(() => {
    const map: Record<string, number> = {
      "7d": 0.25,
      "14v14": 0.5,
      "28d": 1.0,
      "last_month": 1.0,
      "3m": 3.2,
      "6m": 6.4,
      "12m": 13.0,
    };
    return map[rangeId] || 1.0;
  }, [rangeId]);

  const kpis = useMemo(() => {
    let baseSessions = Math.round(543 * rangeMultiplier);
    let baseUsers = Math.round(415 * rangeMultiplier);
    let baseDuration = 49;
    let baseConversions = Math.round(185 * rangeMultiplier);

    if (liveData?.overview?.rows?.[0]?.metricValues) {
      const vals = liveData.overview.rows[0].metricValues;
      baseUsers = parseInt(vals[0]?.value || "415", 10);
      baseSessions = parseInt(vals[1]?.value || "543", 10);
      const rawDur = parseFloat(vals[4]?.value || "49");
      baseDuration = baseUsers > 0 && rawDur > 1000 ? Math.round(rawDur / baseUsers) : Math.round(rawDur);
      baseConversions = parseInt(vals[5]?.value || "185", 10);
    }

    return BASE_KPIS.map((k) => {
      let base = k.base;
      if (k.key === "sessions") base = baseSessions;
      if (k.key === "users") base = baseUsers;
      if (k.key === "engagement") base = baseDuration;
      if (k.key === "conversions") base = baseConversions;

      return { ...k, value: base };
    });
  }, [liveData, rangeMultiplier]);

  const secondaryKpis = useMemo(() => {
    let eventCount = "2,519";
    let bounceRate = "33.3%";

    if (liveData?.overview?.rows?.[0]?.metricValues) {
      const vals = liveData.overview.rows[0].metricValues;
      eventCount = parseInt(vals[2]?.value || "2519", 10).toLocaleString();
      bounceRate = (parseFloat(vals[3]?.value || "0.3333") * 100).toFixed(1) + "%";
    }

    return SECONDARY_KPIS.map((k) => {
      if (k.key === "revenue" || k.key === "events") return { ...k, value: eventCount };
      if (k.key === "bounce") return { ...k, value: bounceRate };
      return k;
    });
  }, [liveData]);

  const channels = useMemo(() => {
    if (liveData?.channels?.rows?.length) {
      const totalSessions = liveData.channels.rows.reduce(
        (sum: number, r: any) => sum + parseInt(r.metricValues?.[0]?.value || "0", 10),
        0
      ) || 1;

      return liveData.channels.rows.map((r: any) => {
        const name = r.dimensionValues?.[0]?.value || "Direct";
        const sessions = parseInt(r.metricValues?.[0]?.value || "0", 10);
        const share = parseFloat(((sessions / totalSessions) * 100).toFixed(1));
        return { name, sessions, share, delta: 12.4 };
      });
    }
    return CHANNELS;
  }, [liveData]);

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
                <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[9px] font-mono text-emerald-300">
                  Live Stream Connected
                </span>
              </div>
              <h2 className="mt-1 text-xl font-bold text-white">
                Traffic &amp; Engagement Insights
              </h2>
              <p className="mt-0.5 text-xs text-slate-400">
                GA4 property stream · web &amp; app analytics · comparing to {range.compare} for{" "}
                <span className="font-semibold text-slate-200">{activeSite?.label || "Safaeewala Cleaning Services"} ({activeSite?.domain || "safaeewala.com"})</span>.
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

        {/* Primary KPIs */}
        <section className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          {kpis.map((k) => {
            const Icon = k.icon;
            const up = k.delta >= 0;
            return (
              <div key={k.label} className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/40 p-4 transition hover:-translate-y-0.5 hover:border-slate-600">
                <div
                  aria-hidden
                  className="absolute inset-x-0 top-0 h-px"
                  style={{ background: `linear-gradient(to right, ${k.from}, ${k.to})` }}
                />
                <div className="flex items-center justify-between">
                  <div
                    className="grid h-9 w-9 place-items-center rounded-lg text-slate-950"
                    style={{ background: `linear-gradient(135deg, ${k.from}, ${k.to})` }}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-medium ${
                    up ? "bg-emerald-400/10 text-emerald-300" : "bg-rose-400/10 text-rose-300"
                  }`}>
                    {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                    {Math.abs(k.delta)}%
                  </div>
                </div>
                <div className="mt-3 text-xs uppercase tracking-wider text-slate-500">{k.label}</div>
                <div className="mt-1 text-xl font-semibold tabular-nums text-white">
                  {fmt(k.value, k.format)}
                </div>
                <div className="mt-1 text-[10px] text-slate-500">vs {range.compare}</div>
              </div>
            );
          })}
        </section>

        {/* Secondary KPI strip */}
        <section className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-5">
          {secondaryKpis.map((k) => {
            const Icon = k.icon;
            const raw = k.delta;
            const good = k.goodDown ? raw <= 0 : raw >= 0;
            return (
              <div key={k.key} className="rounded-xl border border-slate-800 bg-slate-900/30 p-3">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500">
                  <Icon className="h-3 w-3" style={{ color: k.from }} /> {k.label}
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <div className="text-sm font-semibold tabular-nums text-white">{k.value}</div>
                  <span className={`inline-flex items-center gap-0.5 text-[10px] font-medium ${good ? "text-emerald-300" : "text-rose-300"}`}>
                    {raw >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                    {Math.abs(raw)}%
                  </span>
                </div>
              </div>
            );
          })}
        </section>

        {/* Chart */}
        <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-white">Sessions vs Users</div>
              <div className="text-[11px] text-slate-500">Weekly trend · last 12 weeks</div>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-slate-400">
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-orange-400" /> Sessions</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-fuchsia-400" /> Users</span>
            </div>
          </div>
          <DualChart data={TREND} />
        </section>

        {/* Movers */}
        <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <MoversCard
            title="Rising pages"
            subtitle="Biggest traffic gains"
            tone="up"
            icon={TrendingUp}
            rows={RISING_PAGES.map((p) => ({ label: p.url, value: `+${p.delta}%`, delta: p.delta }))}
          />
          <MoversCard
            title="Dropping pages"
            subtitle="Traffic declines to investigate"
            tone="down"
            icon={TrendingDown}
            rows={DROPPING_PAGES.map((p) => ({ label: p.url, value: `${p.delta}%`, delta: p.delta }))}
          />
          <MoversCard
            title="Engagement alerts"
            subtitle="Signals worth reviewing"
            tone="down"
            icon={AlertTriangle}
            rows={ENGAGEMENT_ALERTS.map((e) => ({
              label: e.label,
              sub: e.hint,
              value: e.value,
              delta: e.delta,
            }))}
          />
        </section>

        {/* Channels + Devices */}
        <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 lg:col-span-2">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-white">Top Channels</div>
                <div className="text-[11px] text-slate-500">Sessions and change vs {range.compare}</div>
              </div>
              <TrendingUp className="h-4 w-4 text-slate-500" />
            </div>
            <div className="mt-4 space-y-3">
              {channels.map((c: any) => {
                const up = c.delta >= 0;
                return (
                  <div key={c.name}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-200">{c.name}</span>
                      <span className="tabular-nums text-slate-400">
                        {c.sessions.toLocaleString()}{" "}
                        <span className={`ml-1 inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] ${
                          up ? "bg-emerald-400/10 text-emerald-300" : "bg-rose-400/10 text-rose-300"
                        }`}>
                          {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                          {Math.abs(c.delta)}%
                        </span>
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${c.share}%`,
                          background: "linear-gradient(to right, #fb923c, #f59e0b)",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
            <div className="text-sm font-semibold text-white">Devices</div>
            <div className="mt-4 space-y-3">
              {DEVICES.map((d) => {
                const Icon = d.icon;
                const up = d.delta >= 0;
                return (
                  <div key={d.name}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="inline-flex items-center gap-1.5 text-slate-200">
                        <Icon className="h-3.5 w-3.5" style={{ color: d.color }} /> {d.name}
                      </span>
                      <span className="tabular-nums text-slate-400">
                        {d.pct}%
                        <span className={`ml-2 text-[10px] ${up ? "text-emerald-300" : "text-rose-300"}`}>
                          {up ? "+" : ""}{d.delta}pp
                        </span>
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${d.pct}%`, background: `linear-gradient(to right, ${d.color}, ${d.color}80)` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Pages + Countries */}
        <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 lg:col-span-2">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-white">Top Performing Pages</div>
                <div className="text-[11px] text-slate-500">Views, engagement and conversions</div>
              </div>
              <Eye className="h-4 w-4 text-slate-500" />
            </div>
            <div className="mt-4 overflow-hidden rounded-lg border border-slate-800">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/60 text-[10px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Page</th>
                    <th className="px-3 py-2 text-right">Views</th>
                    <th className="px-3 py-2 text-right">Avg. Time</th>
                    <th className="px-3 py-2 text-right">Conv.</th>
                    <th className="px-3 py-2 text-right">Δ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {PAGES.map((p) => {
                    const up = p.delta >= 0;
                    return (
                      <tr key={p.url} className="hover:bg-slate-900/60">
                        <td className="px-3 py-2 text-slate-200">{p.url}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-300">{p.views.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-400">{p.avg}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-emerald-300">{p.conv}</td>
                        <td className={`px-3 py-2 text-right text-[11px] font-medium ${up ? "text-emerald-300" : "text-rose-300"}`}>
                          <span className="inline-flex items-center gap-0.5">
                            {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                            {Math.abs(p.delta)}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-white">Top Countries</div>
              <Globe className="h-4 w-4 text-slate-500" />
            </div>
            <div className="mt-4 space-y-3">
              {COUNTRIES.map((c) => (
                <div key={c.name}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="inline-flex items-center gap-1.5 text-slate-200">
                      <span>{c.flag}</span> {c.name}
                    </span>
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
          </div>
        </section>

        <div aria-hidden className="h-16" />
    </div>
  );
}

function MoversCard({
  title,
  subtitle,
  tone,
  icon: Icon,
  rows,
}: {
  title: string;
  subtitle: string;
  tone: "up" | "down";
  icon: typeof TrendingUp;
  rows: { label: string; value: string; sub?: string; delta: number }[];
}) {
  const accent = tone === "up" ? "text-emerald-300" : "text-rose-300";
  const chipBg = tone === "up" ? "bg-emerald-400/10" : "bg-rose-400/10";
  const dotBg = tone === "up"
    ? "bg-emerald-500/15 text-emerald-300"
    : "bg-rose-500/15 text-rose-300";
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40">
      <div className="flex items-start justify-between border-b border-slate-800/70 px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <span className={`grid h-6 w-6 place-items-center rounded-md ${dotBg}`}>
              <Icon className="h-3.5 w-3.5" />
            </span>
            <h3 className="text-sm font-semibold text-white">{title}</h3>
          </div>
          <div className="mt-1 text-[11px] text-slate-500">{subtitle}</div>
        </div>
      </div>
      <ul className="divide-y divide-slate-800/70">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center justify-between gap-3 px-5 py-3">
            <div className="min-w-0">
              <div className="truncate text-xs text-slate-200">{r.label}</div>
              {r.sub && <div className="text-[10px] uppercase tracking-wider text-slate-500">{r.sub}</div>}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="tabular-nums text-[11px] text-slate-300">{r.value}</span>
              <span className={`inline-flex items-center gap-0.5 rounded-full ${chipBg} px-1.5 py-0.5 text-[10px] font-medium ${accent}`}>
                {r.delta >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                {Math.abs(r.delta)}%
              </span>
            </div>
          </li>
        ))}
      </ul>
      <div className="px-5 py-2.5 text-right">
        <button className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-cyan-200">
          View all <ChevronRight className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

function DualChart({ data }: { data: { w: string; s: number; u: number }[] }) {
  const w = 800;
  const h = 220;
  const pad = 30;
  const max = Math.max(...data.map((d) => Math.max(d.s, d.u)));
  const step = (w - pad * 2) / (data.length - 1);
  const y = (v: number) => h - pad - (v / max) * (h - pad * 2);
  const lineS = data.map((d, i) => `${i === 0 ? "M" : "L"} ${pad + i * step},${y(d.s)}`).join(" ");
  const lineU = data.map((d, i) => `${i === 0 ? "M" : "L"} ${pad + i * step},${y(d.u)}`).join(" ");
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
      {data.map((d, i) => (
        <text key={d.w} x={pad + i * step} y={h - 8} textAnchor="middle" fontSize="9" fill="#64748b">
          {d.w}
        </text>
      ))}
    </svg>
  );
}
