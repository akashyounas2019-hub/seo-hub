import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowUpRight,
  ArrowDownRight,
  Search,
  Eye,
  MousePointerClick,
  TrendingUp,
  Globe,
  Smartphone,
  Monitor,
  Tablet,
  MapPin,
  Download,
} from "lucide-react";

export const Route = createFileRoute("/analytics/search-console")({
  head: () => ({
    meta: [
      { title: "Search Console Insights — AKS SEO Console" },
      {
        name: "description",
        content:
          "Detailed Google Search Console drill-down: ranking keywords, top pages, CTR fluctuations, devices and countries.",
      },
      { property: "og:title", content: "Search Console Insights — AKS SEO Console" },
    ],
  }),
  component: SearchConsoleDrilldown,
});

const KPIS = [
  { label: "Total Clicks", value: "14,732", delta: 9.4, icon: MousePointerClick, from: "#22d3ee", to: "#3b82f6" },
  { label: "Total Impressions", value: "312,481", delta: 18.2, icon: Eye, from: "#a78bfa", to: "#ec4899" },
  { label: "Average CTR", value: "4.71%", delta: -0.6, icon: TrendingUp, from: "#fbbf24", to: "#f97316" },
  { label: "Average Position", value: "11.4", delta: 1.6, icon: Search, from: "#34d399", to: "#14b8a6" },
];

const KEYWORDS = [
  { q: "deep cleaning services dubai", clicks: 1420, imp: 18420, ctr: 7.7, pos: 3.2, trend: 12.4 },
  { q: "villa cleaning dubai marina", clicks: 986, imp: 12040, ctr: 8.2, pos: 2.8, trend: 22.1 },
  { q: "sofa shampoo cleaning dubai", clicks: 742, imp: 9840, ctr: 7.5, pos: 4.1, trend: 6.7 },
  { q: "move in move out cleaning uae", clicks: 611, imp: 8210, ctr: 7.4, pos: 4.8, trend: -3.2 },
  { q: "maid service difc", clicks: 528, imp: 6720, ctr: 7.8, pos: 3.5, trend: 14.9 },
  { q: "carpet cleaning jlt", clicks: 402, imp: 5980, ctr: 6.7, pos: 5.2, trend: 8.1 },
  { q: "office cleaning business bay", clicks: 361, imp: 5220, ctr: 6.9, pos: 5.9, trend: 4.4 },
  { q: "ramadan deep clean dubai", clicks: 289, imp: 4110, ctr: 7.0, pos: 6.4, trend: 41.2 },
];

const PAGES = [
  { url: "/services/deep-cleaning-dubai", clicks: 2840, imp: 34200, ctr: 8.3, pos: 3.4 },
  { url: "/areas/dubai-marina", clicks: 1712, imp: 22100, ctr: 7.7, pos: 3.9 },
  { url: "/services/sofa-shampoo", clicks: 1204, imp: 16820, ctr: 7.2, pos: 4.6 },
  { url: "/areas/business-bay", clicks: 986, imp: 13940, ctr: 7.1, pos: 5.1 },
  { url: "/blog/ramadan-deep-clean-guide", clicks: 742, imp: 9240, ctr: 8.0, pos: 4.3 },
  { url: "/services/move-in-cleaning", clicks: 611, imp: 8620, ctr: 7.1, pos: 5.4 },
];

// 12 weeks of clicks vs impressions
const CTR_SERIES = [
  { w: "W1", clicks: 820, imp: 18400 },
  { w: "W2", clicks: 910, imp: 19200 },
  { w: "W3", clicks: 1040, imp: 21300 },
  { w: "W4", clicks: 1180, imp: 22800 },
  { w: "W5", clicks: 1090, imp: 24100 },
  { w: "W6", clicks: 1260, imp: 25800 },
  { w: "W7", clicks: 1310, imp: 27400 },
  { w: "W8", clicks: 1420, imp: 28600 },
  { w: "W9", clicks: 1380, imp: 29200 },
  { w: "W10", clicks: 1510, imp: 30800 },
  { w: "W11", clicks: 1620, imp: 32100 },
  { w: "W12", clicks: 1732, imp: 32700 },
];

const DEVICES = [
  { name: "Mobile", pct: 68, icon: Smartphone, color: "#22d3ee" },
  { name: "Desktop", pct: 26, icon: Monitor, color: "#a78bfa" },
  { name: "Tablet", pct: 6, icon: Tablet, color: "#fbbf24" },
];

const COUNTRIES = [
  { name: "United Arab Emirates", flag: "🇦🇪", clicks: 11842, pct: 80.4 },
  { name: "Saudi Arabia", flag: "🇸🇦", clicks: 1120, pct: 7.6 },
  { name: "United Kingdom", flag: "🇬🇧", clicks: 612, pct: 4.2 },
  { name: "India", flag: "🇮🇳", clicks: 498, pct: 3.4 },
  { name: "United States", flag: "🇺🇸", clicks: 360, pct: 2.4 },
];

function SearchConsoleDrilldown() {
  return (
    <div className="min-h-screen bg-[#05070d] text-slate-200">
      <div className="mx-auto max-w-7xl px-6 py-10">
        {/* Header */}
        <Link
          to="/analytics"
          className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-400 hover:text-cyan-200"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to analytics
        </Link>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-cyan-300/80">
              Google Search Console · Last 28 days
            </div>
            <h1 className="mt-1 text-2xl font-semibold text-white">Search Console Insights</h1>
            <p className="mt-1 text-sm text-slate-400">
              Ranking keywords, page performance, CTR fluctuations and search geography.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-md border border-slate-800 bg-slate-950/50 p-0.5 text-xs">
              {["7d", "28d", "3m", "6m", "12m"].map((r, i) => (
                <button
                  key={r}
                  className={`rounded px-2.5 py-1 transition ${
                    i === 1 ? "bg-cyan-400/15 text-cyan-200" : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            <button className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800">
              <Download className="h-3.5 w-3.5" /> Export CSV
            </button>
          </div>
        </div>

        {/* KPIs */}
        <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {KPIS.map((k) => {
            const Icon = k.icon;
            const up = k.delta >= 0;
            return (
              <div
                key={k.label}
                className="group relative overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40 p-4 transition hover:-translate-y-0.5 hover:border-slate-600 hover:bg-slate-900/70"
              >
                <div
                  aria-hidden
                  className="absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-10 blur-2xl"
                  style={{ background: `radial-gradient(circle, ${k.from}, transparent 70%)` }}
                />
                <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-slate-500">
                  <Icon className="h-3 w-3" style={{ color: k.from }} /> {k.label}
                </div>
                <div className="mt-1.5 text-2xl font-semibold tracking-tight text-white tabular-nums">
                  {k.value}
                </div>
                <div
                  className={`mt-1 inline-flex items-center gap-1 text-[11px] font-medium ${
                    up ? "text-emerald-300" : "text-rose-300"
                  }`}
                >
                  {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                  {Math.abs(k.delta)}% vs prev
                </div>
              </div>
            );
          })}
        </section>

        {/* Chart */}
        <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-white">Clicks vs Impressions</div>
              <div className="mt-0.5 text-[11px] text-slate-500">12-week trend · CTR overlay</div>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-slate-400">
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-cyan-400" /> Clicks</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-violet-400" /> Impressions</span>
            </div>
          </div>
          <div className="mt-4">
            <DualChart data={CTR_SERIES} />
          </div>
        </section>

        {/* Two-column */}
        <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Keywords */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40">
            <div className="flex items-center justify-between border-b border-slate-800/70 px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold text-white">Top Ranking Keywords</h2>
                <div className="text-[11px] text-slate-500">Queries driving search clicks</div>
              </div>
              <span className="rounded-full border border-slate-800 bg-slate-950/60 px-2 py-0.5 text-[10px] uppercase tracking-wider text-slate-400">
                {KEYWORDS.length} shown
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-[10px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-5 py-2 font-medium">Query</th>
                    <th className="px-3 py-2 font-medium text-right">Clicks</th>
                    <th className="px-3 py-2 font-medium text-right">CTR</th>
                    <th className="px-3 py-2 font-medium text-right">Pos</th>
                    <th className="px-5 py-2 font-medium text-right">Trend</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {KEYWORDS.map((k) => {
                    const up = k.trend >= 0;
                    return (
                      <tr key={k.q} className="transition hover:bg-slate-900/60">
                        <td className="px-5 py-2.5 text-slate-200">{k.q}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-300">{k.clicks.toLocaleString()}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-300">{k.ctr}%</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-300">{k.pos}</td>
                        <td className={`px-5 py-2.5 text-right text-[11px] font-medium ${up ? "text-emerald-300" : "text-rose-300"}`}>
                          {up ? "+" : ""}{k.trend}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pages */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40">
            <div className="flex items-center justify-between border-b border-slate-800/70 px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold text-white">Top Pages</h2>
                <div className="text-[11px] text-slate-500">Best performing URLs by clicks</div>
              </div>
              <span className="rounded-full border border-slate-800 bg-slate-950/60 px-2 py-0.5 text-[10px] uppercase tracking-wider text-slate-400">
                {PAGES.length} pages
              </span>
            </div>
            <ul className="divide-y divide-slate-800/70">
              {PAGES.map((p) => (
                <li key={p.url} className="flex items-center justify-between gap-3 px-5 py-3 transition hover:bg-slate-900/60">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-slate-200 truncate">
                      <Globe className="h-3 w-3 shrink-0 text-slate-500" /> {p.url}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] uppercase tracking-wider text-slate-500">
                      <span>{p.clicks.toLocaleString()} clicks</span>
                      <span>{p.imp.toLocaleString()} impr.</span>
                      <span>CTR {p.ctr}%</span>
                      <span>Pos {p.pos}</span>
                    </div>
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-slate-500" />
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Devices + Countries */}
        <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-white">Devices</h2>
                <div className="text-[11px] text-slate-500">Share of clicks by device</div>
              </div>
            </div>
            <ul className="mt-4 space-y-3">
              {DEVICES.map((d) => {
                const Icon = d.icon;
                return (
                  <li key={d.name}>
                    <div className="flex items-center justify-between text-xs text-slate-300">
                      <span className="inline-flex items-center gap-2">
                        <Icon className="h-3.5 w-3.5" style={{ color: d.color }} /> {d.name}
                      </span>
                      <span className="tabular-nums text-slate-400">{d.pct}%</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-800">
                      <div
                        className="h-full rounded-full transition-[width] duration-700"
                        style={{ width: `${d.pct}%`, background: `linear-gradient(to right, ${d.color}, ${d.color}80)` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-white">Top Countries</h2>
                <div className="text-[11px] text-slate-500">Where searches are coming from</div>
              </div>
              <MapPin className="h-4 w-4 text-slate-500" />
            </div>
            <ul className="mt-4 space-y-3">
              {COUNTRIES.map((c) => (
                <li key={c.name}>
                  <div className="flex items-center justify-between text-xs text-slate-300">
                    <span className="inline-flex items-center gap-2">
                      <span className="text-base leading-none">{c.flag}</span> {c.name}
                    </span>
                    <span className="tabular-nums text-slate-400">
                      {c.clicks.toLocaleString()} · {c.pct}%
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-sky-500 transition-[width] duration-700"
                      style={{ width: `${c.pct}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <div aria-hidden className="h-16" />
      </div>
    </div>
  );
}

function DualChart({ data }: { data: { w: string; clicks: number; imp: number }[] }) {
  const w = 900;
  const h = 220;
  const pad = { l: 40, r: 40, t: 20, b: 24 };
  const iw = w - pad.l - pad.r;
  const ih = h - pad.t - pad.b;
  const maxClicks = Math.max(...data.map((d) => d.clicks));
  const maxImp = Math.max(...data.map((d) => d.imp));
  const step = iw / (data.length - 1);

  const clicksPts = data.map((d, i) => [pad.l + i * step, pad.t + ih - (d.clicks / maxClicks) * ih] as const);
  const impPts = data.map((d, i) => [pad.l + i * step, pad.t + ih - (d.imp / maxImp) * ih] as const);

  const line = (pts: readonly (readonly [number, number])[]) =>
    pts.map((p, i) => (i === 0 ? `M ${p[0]},${p[1]}` : `L ${p[0]},${p[1]}`)).join(" ");
  const area = (pts: readonly (readonly [number, number])[]) =>
    `${line(pts)} L ${pad.l + iw},${pad.t + ih} L ${pad.l},${pad.t + ih} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-56 w-full">
      <defs>
        <linearGradient id="clickG" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="impG" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#a78bfa" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map((t) => (
        <line
          key={t}
          x1={pad.l}
          x2={pad.l + iw}
          y1={pad.t + ih * t}
          y2={pad.t + ih * t}
          stroke="rgb(30 41 59)"
          strokeDasharray="2 4"
        />
      ))}

      {/* Impressions */}
      <path d={area(impPts)} fill="url(#impG)" />
      <path d={line(impPts)} fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" />

      {/* Clicks */}
      <path d={area(clicksPts)} fill="url(#clickG)" />
      <path d={line(clicksPts)} fill="none" stroke="#22d3ee" strokeWidth="2.5" strokeLinecap="round" />
      {clicksPts.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r="3" fill="#05070d" stroke="#22d3ee" strokeWidth="2" />
      ))}

      {/* X labels */}
      {data.map((d, i) => (
        <text
          key={d.w}
          x={pad.l + i * step}
          y={h - 6}
          textAnchor="middle"
          fontSize="10"
          fill="#64748b"
          fontFamily="ui-sans-serif, system-ui"
        >
          {d.w}
        </text>
      ))}
    </svg>
  );
}
