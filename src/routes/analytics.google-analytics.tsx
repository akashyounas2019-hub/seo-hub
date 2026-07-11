import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
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
} from "lucide-react";

export const Route = createFileRoute("/analytics/google-analytics")({
  head: () => ({
    meta: [
      { title: "Google Analytics Insights — AKS SEO Console" },
      {
        name: "description",
        content:
          "Detailed Google Analytics drill-down: sessions, engagement, revenue, comparison filters, top channels, pages and audience breakdown.",
      },
      { property: "og:title", content: "Google Analytics Insights — AKS SEO Console" },
    ],
  }),
  component: GoogleAnalyticsDrilldown,
});

// ────────────────────────────────────────────────────────────────────────────
// Comparison-period presets shared with Search Console screen.
// ────────────────────────────────────────────────────────────────────────────
const RANGES = [
  { id: "7d", label: "Last 7 days", compare: "prev 7d", factor: 0.28 },
  { id: "14v14", label: "14d vs 14d", compare: "prev 14d", factor: 0.55 },
  { id: "28d", label: "Last 28 days", compare: "prev 28d", factor: 1 },
  { id: "3m", label: "Last 3 months", compare: "prev 3m", factor: 3.1 },
  { id: "6m", label: "Last 6 months", compare: "prev 6m", factor: 6.4 },
  { id: "12m", label: "Last 12 months", compare: "YoY", factor: 12.8 },
] as const;
type RangeId = (typeof RANGES)[number]["id"];

const BASE_KPIS = [
  { key: "sessions", label: "Sessions", base: 48214, delta: 12.4, icon: Users, from: "#fb923c", to: "#f59e0b", format: "int" as const },
  { key: "users", label: "Users", base: 31908, delta: 9.1, icon: Users, from: "#a78bfa", to: "#ec4899", format: "int" as const },
  { key: "engagement", label: "Avg Engagement", base: 161, delta: 3.1, icon: Clock, from: "#22d3ee", to: "#3b82f6", format: "time" as const },
  { key: "conversions", label: "Conversions", base: 1624, delta: 8.7, icon: MousePointerClick, from: "#34d399", to: "#14b8a6", format: "int" as const },
];

const SECONDARY_KPIS = [
  { key: "revenue", label: "Revenue", value: "$48.2k", delta: 14.6, icon: DollarSign, from: "#34d399", to: "#059669" },
  { key: "bounce", label: "Bounce Rate", value: "38.2%", delta: -2.4, icon: TrendingDown, from: "#22d3ee", to: "#3b82f6", goodDown: true },
  { key: "pps", label: "Pages / Session", value: "3.4", delta: 6.1, icon: Eye, from: "#a78bfa", to: "#ec4899" },
  { key: "new", label: "New vs Returning", value: "62 / 38", delta: 4.2, icon: Repeat, from: "#fbbf24", to: "#f97316" },
  { key: "events", label: "Key Events", value: "9,412", delta: 11.8, icon: Zap, from: "#f472b6", to: "#a855f7" },
];

const CHANNELS = [
  { name: "Organic Search", sessions: 21840, share: 45.3, delta: 14.2 },
  { name: "Direct", sessions: 10920, share: 22.6, delta: 5.4 },
  { name: "Referral", sessions: 6420, share: 13.3, delta: 8.1 },
  { name: "Paid Search", sessions: 4820, share: 10.0, delta: -2.3 },
  { name: "Social", sessions: 3010, share: 6.2, delta: 22.9 },
  { name: "Email", sessions: 1204, share: 2.5, delta: 4.1 },
];

const PAGES = [
  { url: "/services/deep-cleaning-dubai", views: 12840, avg: "3m 12s", conv: 214, delta: 18.2 },
  { url: "/", views: 9820, avg: "1m 48s", conv: 182, delta: 6.4 },
  { url: "/areas/dubai-marina", views: 6720, avg: "2m 24s", conv: 128, delta: 12.1 },
  { url: "/services/sofa-shampoo", views: 5240, avg: "2m 51s", conv: 96, delta: -4.2 },
  { url: "/blog/ramadan-deep-clean-guide", views: 4120, avg: "3m 44s", conv: 71, delta: 41.9 },
  { url: "/contact", views: 3480, avg: "1m 12s", conv: 240, delta: 9.8 },
];

const RISING_PAGES = [
  { url: "/blog/ramadan-deep-clean-guide", delta: 41.9 },
  { url: "/services/deep-cleaning-dubai", delta: 18.2 },
  { url: "/areas/dubai-marina", delta: 12.1 },
  { url: "/contact", delta: 9.8 },
];

const DROPPING_PAGES = [
  { url: "/services/sofa-shampoo", delta: -4.2 },
  { url: "/areas/jvc", delta: -8.6 },
  { url: "/blog/hourly-maid-guide", delta: -11.4 },
  { url: "/services/carpet-cleaning", delta: -6.1 },
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

function GoogleAnalyticsDrilldown() {
  const [rangeId, setRangeId] = useState<RangeId>("28d");
  const range = useMemo(() => RANGES.find((r) => r.id === rangeId)!, [rangeId]);

  const kpis = useMemo(
    () =>
      BASE_KPIS.map((k) => {
        const value = k.format === "int" ? k.base * range.factor : k.base;
        return { ...k, value };
      }),
    [range],
  );

  return (
    <div className="min-h-screen bg-[#05070d] text-slate-200">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <Link
          to="/analytics"
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-cyan-300"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to analytics
        </Link>

        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-orange-300/80">
              Google Analytics · {range.label}
            </div>
            <h1 className="mt-1 text-2xl font-semibold text-white">Traffic &amp; Engagement Insights</h1>
            <p className="mt-1 text-sm text-slate-400">
              GA4 property · web + app streams · comparing to {range.compare}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800">
              <Filter className="h-3.5 w-3.5" /> Filters
            </button>
            <button className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800">
              <Download className="h-3.5 w-3.5" /> Export CSV
            </button>
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
          {SECONDARY_KPIS.map((k) => {
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
              {CHANNELS.map((c) => {
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
