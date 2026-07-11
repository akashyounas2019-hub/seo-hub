import { createFileRoute, Link } from "@tanstack/react-router";
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
} from "lucide-react";

export const Route = createFileRoute("/analytics/google-analytics")({
  head: () => ({
    meta: [
      { title: "Google Analytics Insights — AKS SEO Console" },
      {
        name: "description",
        content:
          "Detailed Google Analytics drill-down: sessions, engagement, conversions, top channels, pages and audience breakdown.",
      },
      { property: "og:title", content: "Google Analytics Insights — AKS SEO Console" },
    ],
  }),
  component: GoogleAnalyticsDrilldown,
});

const KPIS = [
  { label: "Sessions", value: "48,214", delta: 12.4, icon: Users, from: "#fb923c", to: "#f59e0b" },
  { label: "Users", value: "31,908", delta: 9.1, icon: Users, from: "#a78bfa", to: "#ec4899" },
  { label: "Avg Engagement", value: "2m 41s", delta: 3.1, icon: Clock, from: "#22d3ee", to: "#3b82f6" },
  { label: "Conversions", value: "1,624", delta: 8.7, icon: MousePointerClick, from: "#34d399", to: "#14b8a6" },
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
  { url: "/services/deep-cleaning-dubai", views: 12840, avg: "3m 12s", conv: 214 },
  { url: "/", views: 9820, avg: "1m 48s", conv: 182 },
  { url: "/areas/dubai-marina", views: 6720, avg: "2m 24s", conv: 128 },
  { url: "/services/sofa-shampoo", views: 5240, avg: "2m 51s", conv: 96 },
  { url: "/blog/ramadan-deep-clean-guide", views: 4120, avg: "3m 44s", conv: 71 },
  { url: "/contact", views: 3480, avg: "1m 12s", conv: 240 },
];

const DEVICES = [
  { name: "Mobile", pct: 68, icon: Smartphone },
  { name: "Desktop", pct: 26, icon: Monitor },
  { name: "Tablet", pct: 6, icon: Tablet },
];

const COUNTRIES = [
  { flag: "🇦🇪", name: "United Arab Emirates", sessions: 32410, pct: 67.2 },
  { flag: "🇸🇦", name: "Saudi Arabia", sessions: 6820, pct: 14.1 },
  { flag: "🇬🇧", name: "United Kingdom", sessions: 2410, pct: 5.0 },
  { flag: "🇮🇳", name: "India", sessions: 1980, pct: 4.1 },
  { flag: "🇺🇸", name: "United States", sessions: 1420, pct: 2.9 },
];

const TREND = [
  { w: "W1", s: 2800, u: 1900 },
  { w: "W2", s: 3100, u: 2100 },
  { w: "W3", s: 2950, u: 2000 },
  { w: "W4", s: 3400, u: 2280 },
  { w: "W5", s: 3620, u: 2410 },
  { w: "W6", s: 3880, u: 2610 },
  { w: "W7", s: 4020, u: 2720 },
  { w: "W8", s: 4310, u: 2880 },
  { w: "W9", s: 4180, u: 2790 },
  { w: "W10", s: 4520, u: 3010 },
  { w: "W11", s: 4720, u: 3180 },
  { w: "W12", s: 4980, u: 3320 },
];

function GoogleAnalyticsDrilldown() {
  return (
    <div className="min-h-screen bg-[#05070d] text-slate-200">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <Link
          to="/analytics"
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-cyan-300"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to analytics
        </Link>

        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-orange-300/80">
              Google Analytics
            </div>
            <h1 className="mt-1 text-2xl font-semibold text-white">Traffic & Engagement Insights</h1>
            <p className="mt-1 text-sm text-slate-400">
              Last 28 days · GA4 property · web + app streams
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select className="rounded-md border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-300">
              <option>Last 28 days</option>
              <option>Last 7 days</option>
              <option>Last 90 days</option>
            </select>
            <button className="inline-flex items-center gap-1.5 rounded-md border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-300 hover:border-cyan-400/40 hover:text-cyan-200">
              <Download className="h-3.5 w-3.5" /> Export CSV
            </button>
          </div>
        </div>

        <section className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          {KPIS.map((k) => {
            const Icon = k.icon;
            const up = k.delta >= 0;
            return (
              <div key={k.label} className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
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
                  <div className={`inline-flex items-center gap-0.5 text-[11px] font-medium ${up ? "text-emerald-300" : "text-rose-300"}`}>
                    {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                    {Math.abs(k.delta)}%
                  </div>
                </div>
                <div className="mt-3 text-xs uppercase tracking-wider text-slate-500">{k.label}</div>
                <div className="mt-1 text-xl font-semibold tabular-nums text-white">{k.value}</div>
              </div>
            );
          })}
        </section>

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

        <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 lg:col-span-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-white">Top Channels</div>
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
                        <span className={up ? "text-emerald-300" : "text-rose-300"}>
                          {up ? "+" : ""}{c.delta}%
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
                return (
                  <div key={d.name}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="inline-flex items-center gap-1.5 text-slate-200">
                        <Icon className="h-3.5 w-3.5 text-slate-400" /> {d.name}
                      </span>
                      <span className="tabular-nums text-slate-400">{d.pct}%</span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${d.pct}%`, background: "linear-gradient(to right, #22d3ee, #3b82f6)" }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 lg:col-span-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-white">Top Pages</div>
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
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {PAGES.map((p) => (
                    <tr key={p.url} className="hover:bg-slate-900/60">
                      <td className="px-3 py-2 text-slate-200">{p.url}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-300">{p.views.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-400">{p.avg}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-emerald-300">{p.conv}</td>
                    </tr>
                  ))}
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
      <path d={`${lineS} L ${pad + (data.length - 1) * step},${h - pad} L ${pad},${h - pad} Z`} fill="url(#ga-s)" />
      <path d={lineS} fill="none" stroke="#fb923c" strokeWidth="2" />
      <path d={lineU} fill="none" stroke="#e879f9" strokeWidth="2" strokeDasharray="4 3" />
      {data.map((d, i) => (
        <text key={d.w} x={pad + i * step} y={h - 8} textAnchor="middle" fontSize="9" fill="#64748b">
          {d.w}
        </text>
      ))}
    </svg>
  );
}
