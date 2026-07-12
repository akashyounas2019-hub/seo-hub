import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Activity,
  Users,
  Zap,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Search,
  MapPin,
  Eye,
  MousePointerClick,
  Star,
  Phone,
  Navigation,
  ArrowUpRight,
  ArrowDownRight,
  Globe,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  Target,
  Gauge,
  Clock,
  ExternalLink,
} from "lucide-react";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — AKS SEO Console" },
      { name: "description", content: "Unified SEO command center: live agent activity, Google Analytics, Search Console and Business Profile insights." },
    ],
  }),
  component: DashboardPage,
});

const kpis = [
  { k: "Organic Sessions", v: "48.2k", d: 12.4, icon: Users, accent: "from-cyan-400 to-sky-500", src: "Google Analytics", href: "/analytics/google-analytics" },
  { k: "Search Impressions", v: "312k", d: 18.2, icon: Eye, accent: "from-violet-400 to-fuchsia-500", src: "Search Console", href: "/analytics/search-console" },
  { k: "GMB Actions", v: "1,686", d: 22.1, icon: MapPin, accent: "from-amber-400 to-orange-500", src: "Business Profile", href: "/analytics/business-profile" },
  { k: "Avg Position", v: "11.4", d: -1.6, icon: Target, accent: "from-emerald-400 to-teal-500", src: "Search Console", href: "/analytics/search-console", invertColors: true },
];

const trafficTrend = [22, 28, 26, 34, 31, 40, 38, 46, 44, 52, 49, 58, 55, 62];
const impressionsTrend = [12, 14, 18, 17, 22, 26, 24, 30, 34, 32, 38, 42, 45, 48];

const topQueries = [
  { q: "dubai seo agency", clicks: 842, imp: 12400, ctr: 6.8, pos: 3.2, delta: 12 },
  { q: "wordpress seo services", clicks: 612, imp: 9800, ctr: 6.2, pos: 4.1, delta: 8 },
  { q: "local seo dubai", clicks: 498, imp: 7200, ctr: 6.9, pos: 2.8, delta: 22 },
  { q: "seo consultant uae", clicks: 341, imp: 5600, ctr: 6.1, pos: 5.4, delta: -3 },
  { q: "ecommerce seo audit", clicks: 287, imp: 4900, ctr: 5.9, pos: 6.7, delta: 15 },
];

const topPages = [
  { url: "/services/technical-seo", views: "8.2k", conv: 42, cwv: "Good" },
  { url: "/blog/local-seo-dubai-guide", views: "6.4k", conv: 28, cwv: "Good" },
  { url: "/services/content-strategy", views: "4.1k", conv: 19, cwv: "Needs" },
  { url: "/case-studies/hospitality", views: "3.8k", conv: 24, cwv: "Good" },
];

const gmbReviews = [
  { author: "Sara M.", rating: 5, text: "Traffic doubled in 3 months. Fully transparent reporting.", ago: "2h" },
  { author: "Faisal R.", rating: 5, text: "Local pack rankings jumped for every target keyword.", ago: "1d" },
  { author: "Priya S.", rating: 4, text: "Great communication, solid technical work.", ago: "3d" },
];

const alerts = [
  { level: "critical", msg: "LCP regression on /pricing — 3.8s (was 2.1s)", at: "12m", icon: AlertTriangle },
  { level: "warning", msg: "GSC: 14 URLs dropped from top 10 this week", at: "1h", icon: TrendingDown },
  { level: "info", msg: "Backlink Prospector queued 12 new outreach targets", at: "2h", icon: Sparkles },
  { level: "success", msg: "On-Page Expert published 4 meta rewrites", at: "4h", icon: CheckCircle2 },
];

function DashboardPage() {
  return (
    <div className="min-h-screen bg-[#05070d] text-slate-200">
      <div className="mx-auto max-w-7xl px-6 py-10">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-cyan-300/80">
              Live SEO Command Center
            </div>
            <h1 className="mt-1 text-2xl font-semibold text-white">Dashboard</h1>
            <p className="mt-1 text-sm text-slate-400">
              Unified insights from Google Analytics, Search Console and Business Profile — refreshed every 15 minutes.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {[
              { l: "Google Analytics", c: "from-orange-400 to-amber-500", icon: BarChart3 },
              { l: "Search Console", c: "from-cyan-400 to-blue-500", icon: Search },
              { l: "Business Profile", c: "from-violet-400 to-pink-500", icon: MapPin },
            ].map((s) => (
              <span key={s.l} className="inline-flex items-center gap-1.5 rounded-md border border-slate-800 bg-slate-900/60 px-2.5 py-1.5 text-[11px] font-medium text-slate-200">
                <span className={`grid h-4 w-4 place-items-center rounded bg-gradient-to-br ${s.c} text-slate-950`}>
                  <s.icon className="h-2.5 w-2.5" />
                </span>
                {s.l}
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)]" />
              </span>
            ))}
          </div>
        </div>

        {/* KPI row */}
        <section className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {kpis.map((s) => {
            const up = s.d >= 0;
            const good = s.invertColors ? !up : up;
            return (
              <div key={s.k} className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
                <div className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r ${s.accent}`} />
                <div className="flex items-start justify-between">
                  <div className={`inline-flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br ${s.accent} text-slate-950`}>
                    <s.icon className="h-4 w-4" />
                  </div>
                  <span className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${good ? "bg-emerald-400/10 text-emerald-300" : "bg-rose-400/10 text-rose-300"}`}>
                    {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                    {Math.abs(s.d)}%
                  </span>
                </div>
                <div className="mt-3 text-[10px] uppercase tracking-wider text-slate-500">{s.k}</div>
                <div className="mt-0.5 text-2xl font-semibold tabular-nums text-white">{s.v}</div>
                <div className="mt-1 text-[10px] text-slate-500">via {s.src}</div>
              </div>
            );
          })}
        </section>

        {/* Traffic + Search chart */}
        <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2 rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-white">Traffic vs Impressions</h2>
                <p className="mt-0.5 text-[11px] text-slate-500">14-week rolling · GA sessions · GSC impressions</p>
              </div>
              <Link to="/analytics" className="inline-flex items-center gap-1 text-[11px] font-medium text-cyan-300 hover:text-cyan-200">
                Full analytics <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>
            <DualSparkline a={trafficTrend} b={impressionsTrend} />
            <div className="mt-3 flex items-center gap-4 text-[11px]">
              <LegendDot color="#22d3ee" label="Sessions" />
              <LegendDot color="#a78bfa" label="Impressions" />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Pipeline Health</h2>
              <Gauge className="h-4 w-4 text-cyan-300" />
            </div>
            <div className="mt-4 space-y-3">
              {[
                { l: "Research", v: 82, a: "from-emerald-400 to-teal-500" },
                { l: "On-Page", v: 71, a: "from-cyan-400 to-sky-500" },
                { l: "Off-Page", v: 58, a: "from-violet-400 to-fuchsia-500" },
                { l: "Technical", v: 94, a: "from-amber-400 to-orange-500" },
              ].map((r) => (
                <div key={r.l}>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-300">{r.l}</span>
                    <span className="font-mono text-slate-400">{r.v}%</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                    <div className={`h-full rounded-full bg-gradient-to-r ${r.a}`} style={{ width: `${r.v}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-800 pt-3">
              {[
                { k: "Agents", v: "25", i: Users },
                { k: "Tasks/d", v: "348", i: Activity },
                { k: "Autom.", v: "12", i: Zap },
              ].map((x) => (
                <div key={x.k} className="rounded-lg border border-slate-800 bg-slate-950/50 p-2">
                  <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-slate-500">
                    <x.i className="h-2.5 w-2.5" /> {x.k}
                  </div>
                  <div className="mt-0.5 text-sm font-semibold text-white">{x.v}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Search Console queries + GA top pages */}
        <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2 rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-cyan-400 to-blue-500 text-slate-950">
                  <Search className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-white">Top Search Queries</h2>
                  <p className="text-[11px] text-slate-500">Search Console · last 28 days</p>
                </div>
              </div>
              <Link to="/analytics/search-console" className="text-[11px] font-medium text-cyan-300 hover:text-cyan-200 inline-flex items-center gap-1">
                Open GSC <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="mt-4 overflow-hidden rounded-lg border border-slate-800">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="bg-slate-950/60 text-[10px] uppercase tracking-wider text-slate-500">
                    <th className="px-3 py-2 text-left font-medium">Query</th>
                    <th className="px-3 py-2 text-right font-medium">Clicks</th>
                    <th className="px-3 py-2 text-right font-medium">Impr.</th>
                    <th className="px-3 py-2 text-right font-medium">CTR</th>
                    <th className="px-3 py-2 text-right font-medium">Pos</th>
                    <th className="px-3 py-2 text-right font-medium">Δ</th>
                  </tr>
                </thead>
                <tbody>
                  {topQueries.map((q) => (
                    <tr key={q.q} className="border-t border-slate-800/60 hover:bg-slate-900/40">
                      <td className="px-3 py-2 text-slate-200">{q.q}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-white">{q.clicks}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-300">{q.imp.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-300">{q.ctr}%</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-300">{q.pos}</td>
                      <td className={`px-3 py-2 text-right font-mono tabular-nums ${q.delta >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                        {q.delta >= 0 ? "+" : ""}{q.delta}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-orange-400 to-amber-500 text-slate-950">
                  <BarChart3 className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-white">Top Landing Pages</h2>
                  <p className="text-[11px] text-slate-500">Google Analytics</p>
                </div>
              </div>
            </div>
            <ul className="mt-4 space-y-2.5">
              {topPages.map((p) => (
                <li key={p.url} className="rounded-lg border border-slate-800 bg-slate-950/50 p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[12px] font-medium text-slate-200">{p.url}</span>
                    <ExternalLink className="h-3 w-3 shrink-0 text-slate-500" />
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-500">
                    <span><span className="font-mono text-white">{p.views}</span> views</span>
                    <span><span className="font-mono text-white">{p.conv}</span> conv</span>
                    <span className={`rounded-full px-1.5 py-px font-medium ${p.cwv === "Good" ? "bg-emerald-400/10 text-emerald-300" : "bg-amber-400/10 text-amber-300"}`}>
                      CWV {p.cwv}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* GMB + alerts */}
        <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-violet-400 to-pink-500 text-slate-950">
                  <MapPin className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-white">Business Profile</h2>
                  <p className="text-[11px] text-slate-500">Dubai · last 30 days</p>
                </div>
              </div>
              <span className="inline-flex items-center gap-1 rounded-md bg-amber-400/10 px-1.5 py-0.5 text-[11px] font-semibold text-amber-300">
                <Star className="h-3 w-3 fill-current" /> 4.8
              </span>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {[
                { i: Phone, l: "Calls", v: "482", d: 22 },
                { i: Navigation, l: "Directions", v: "1,204", d: 14 },
                { i: Globe, l: "Website", v: "918", d: 9 },
              ].map((m) => (
                <div key={m.l} className="rounded-lg border border-slate-800 bg-slate-950/50 p-2.5">
                  <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-slate-500">
                    <m.i className="h-2.5 w-2.5" /> {m.l}
                  </div>
                  <div className="mt-0.5 text-sm font-semibold text-white tabular-nums">{m.v}</div>
                  <div className="mt-0.5 inline-flex items-center gap-0.5 text-[10px] text-emerald-300">
                    <ArrowUpRight className="h-2.5 w-2.5" />{m.d}%
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 border-t border-slate-800 pt-3">
              <div className="text-[10px] uppercase tracking-wider text-slate-500">Latest reviews</div>
              <ul className="mt-2 space-y-2">
                {gmbReviews.map((r) => (
                  <li key={r.author} className="rounded-lg border border-slate-800 bg-slate-950/40 p-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] font-medium text-slate-200">{r.author}</span>
                      <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-300">
                        {"★".repeat(r.rating)}<span className="text-slate-600">{"★".repeat(5 - r.rating)}</span>
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-400">"{r.text}"</p>
                    <div className="mt-1 flex items-center gap-1 text-[10px] text-slate-500">
                      <Clock className="h-2.5 w-2.5" /> {r.ago} ago
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="lg:col-span-2 rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-rose-400 to-orange-500 text-slate-950">
                  <AlertTriangle className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-white">Alerts & Activity</h2>
                  <p className="text-[11px] text-slate-500">Cross-signal · agents + Google properties</p>
                </div>
              </div>
              <Link to="/alerts" className="text-[11px] font-medium text-cyan-300 hover:text-cyan-200 inline-flex items-center gap-1">
                Alert manager <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>
            <ul className="mt-4 space-y-2">
              {alerts.map((a, i) => {
                const styles: Record<string, string> = {
                  critical: "border-rose-400/30 bg-rose-400/5 text-rose-200",
                  warning: "border-amber-400/30 bg-amber-400/5 text-amber-200",
                  info: "border-cyan-400/30 bg-cyan-400/5 text-cyan-200",
                  success: "border-emerald-400/30 bg-emerald-400/5 text-emerald-200",
                };
                const iconColor: Record<string, string> = {
                  critical: "text-rose-300",
                  warning: "text-amber-300",
                  info: "text-cyan-300",
                  success: "text-emerald-300",
                };
                return (
                  <li key={i} className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 ${styles[a.level]}`}>
                    <a.icon className={`mt-0.5 h-4 w-4 shrink-0 ${iconColor[a.level]}`} />
                    <div className="flex-1">
                      <div className="text-[12px] font-medium text-white">{a.msg}</div>
                      <div className="mt-0.5 text-[10px] uppercase tracking-wider text-slate-500">{a.level} · {a.at} ago</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        <div aria-hidden className="h-16" />
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-slate-400">
      <span className="h-2 w-2 rounded-full" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
      {label}
    </span>
  );
}

function DualSparkline({ a, b }: { a: number[]; b: number[] }) {
  const w = 600;
  const h = 160;
  const build = (data: number[]) => {
    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;
    const step = w / (data.length - 1);
    const pts = data.map((v, i) => [i * step, h - ((v - min) / range) * (h - 20) - 10] as const);
    const line = pts.map((p, i) => (i === 0 ? `M ${p[0]},${p[1]}` : `L ${p[0]},${p[1]}`)).join(" ");
    const area = `${line} L ${w},${h} L 0,${h} Z`;
    return { line, area };
  };
  const A = build(a);
  const B = build(b);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-4 h-40 w-full">
      <defs>
        <linearGradient id="af" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="bf" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#a78bfa" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 1, 2, 3].map((i) => (
        <line key={i} x1="0" x2={w} y1={(h / 4) * (i + 0.5)} y2={(h / 4) * (i + 0.5)} stroke="#1e293b" strokeDasharray="2 4" />
      ))}
      <path d={A.area} fill="url(#af)" />
      <path d={B.area} fill="url(#bf)" />
      <path d={A.line} fill="none" stroke="#22d3ee" strokeWidth="2" strokeLinecap="round" />
      <path d={B.line} fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" strokeDasharray="4 3" />
    </svg>
  );
}
