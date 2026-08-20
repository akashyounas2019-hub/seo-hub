import { useState } from "react";
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
  LayoutDashboard,
  Monitor,
  Smartphone,
  Tablet,
  CheckCircle,
  FileText,
  PieChart,
  ShieldCheck,
  Check,
  Bot,
} from "lucide-react";
import { useSite } from "@/lib/site-context";

import { GoogleAnalyticsDrilldown } from "@/components/analytics-google-analytics";
import { SearchConsoleDrilldown } from "@/components/analytics-search-console";
import { BusinessProfileDrilldown } from "@/components/analytics-business-profile";
import { CloudflareAiOverview } from "@/components/analytics-ai-overview";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — AKS SEO Console" },
      { name: "description", content: "Unified SEO command center: live agent activity, Google Analytics, Search Console, Business Profile and Cloudflare AI Crawl Control insights." },
    ],
  }),
  component: DashboardPage,
});

type TabType = "overview" | "ga" | "gsc" | "gbp" | "ai-overview";

function DashboardPage() {
  const { currentSite, allSites, setCurrentSiteId, isSyncing, lastSyncTime, triggerSync } = useSite();

  const [activeTab, setActiveTabState] = useState<TabType>(() => {
    if (typeof window === "undefined") return "overview";
    const p = new URLSearchParams(window.location.search).get("tab") as TabType | null;
    return p && ["overview", "ga", "gsc", "gbp", "ai-overview"].includes(p) ? p : "overview";
  });

  const setActiveTab = (tab: TabType) => {
    setActiveTabState(tab);
    if (typeof window !== "undefined") {
      const u = new URL(window.location.href);
      u.searchParams.set("tab", tab);
      window.history.replaceState({}, "", u.toString());
    }
  };

  const site = currentSite || (allSites && allSites[0]) || {
    id: "safaeewala",
    domain: "safaeewala.com",
    label: "Safaeewala Cleaning Services",
    location: "Dubai, UAE",
    gaConnected: true,
    gscConnected: true,
    gbpConnected: true,
  };

  const overviewKpis = site?.overviewKpis || [
    { k: "Organic Sessions", v: "551", d: 12.4, icon: Users, accent: "from-cyan-400 to-sky-500", src: "Google Analytics (Live)", tab: "ga" },
    { k: "Search Impressions", v: "3.2k", d: 18.2, icon: Eye, accent: "from-violet-400 to-fuchsia-500", src: "Search Console", tab: "gsc" },
    { k: "GMB Actions", v: "1,686", d: 22.1, icon: MapPin, accent: "from-amber-400 to-orange-500", src: "Business Profile", tab: "gbp" },
    { k: "Avg Position", v: "11.4", d: -1.6, icon: Target, accent: "from-emerald-400 to-teal-500", src: "Search Console", tab: "gsc", invertColors: true },
  ];
  const trafficTrend = site?.trafficTrend || [22, 17, 12, 16, 17, 17, 18, 16, 16, 14, 22, 28, 19, 19, 11];
  const impressionsTrend = site?.impressionsTrend || [12, 14, 18, 17, 22, 26, 24, 30, 34, 32, 38, 42, 45, 48];
  const topQueries = site?.topQueries || [];
  const topPages = site?.topPages || [];

  return (
    <div className="min-h-screen bg-[#05070d] text-slate-200">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8">
        {/* Top Header & Site Selector */}
        <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-5 backdrop-blur-md">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-cyan-300/80">
                Live SEO Command Center
              </span>
              <span className="rounded border border-cyan-400/30 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-mono text-cyan-200">
                {site.domain}
              </span>
            </div>
            <h1 className="mt-1 text-2xl font-bold text-white">
              {site.label}
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Connected website in <span className="font-semibold text-slate-200">{site.location}</span> · Refreshed {lastSyncTime}.
            </p>
          </div>

          <div className="flex flex-col items-end gap-3">
            {/* n8n Live Sync Trigger & Status */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => triggerSync()}
                disabled={isSyncing}
                className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-3 py-1.5 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-400/20 disabled:opacity-50 cursor-pointer shadow-[0_0_15px_rgba(34,211,238,0.2)]"
              >
                <Zap className={`h-3.5 w-3.5 text-cyan-300 ${isSyncing ? "animate-spin" : ""}`} />
                <span>{isSyncing ? "Syncing n8n Pipelines..." : "Sync All Tabs Now"}</span>
              </button>

              <div className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[11px] font-semibold ${
                site.gaConnected
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
                  : "border-slate-800 bg-slate-900/50 text-slate-500"
              }`}>
                <span className={`h-2 w-2 rounded-full ${site.gaConnected ? "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.9)]" : "bg-slate-600"}`} />
                <span>GA4</span>
              </div>

              <div className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[11px] font-semibold ${
                site.gscConnected
                  ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-300"
                  : "border-slate-800 bg-slate-900/50 text-slate-500"
              }`}>
                <span className={`h-2 w-2 rounded-full ${site.gscConnected ? "bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.9)]" : "bg-slate-600"}`} />
                <span>GSC</span>
              </div>

              <div className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[11px] font-semibold ${
                site.gbpConnected
                  ? "border-violet-500/30 bg-violet-500/10 text-violet-300"
                  : "border-slate-800 bg-slate-900/50 text-slate-500"
              }`}>
                <span className={`h-2 w-2 rounded-full ${site.gbpConnected ? "bg-violet-400 shadow-[0_0_8px_rgba(167,139,250,0.9)]" : "bg-slate-600"}`} />
                <span>GBP</span>
              </div>
            </div>
          </div>
        </div>

        {/* Tab Navigation Buttons */}
        <div className="mt-6 border-b border-slate-800">
          <nav className="flex space-x-2 overflow-x-auto pb-px" aria-label="Tabs">
            {[
              { id: "overview", label: "Overview", icon: LayoutDashboard, desc: "Combined Insights", badge: "All" },
              { id: "ga", label: "Google Analytics", icon: BarChart3, desc: "Traffic & Users", badge: "GA4", accent: "text-amber-400" },
              { id: "gsc", label: "Search Console", icon: Search, desc: "Queries & Rankings", badge: "GSC", accent: "text-cyan-400" },
              { id: "gbp", label: "Business Profile", icon: MapPin, desc: "Local Maps & Calls", badge: "GBP", accent: "text-violet-400" },
              { id: "ai-overview", label: "AI Crawl Control", icon: Bot, desc: "Cloudflare AI Shield", badge: "Cloudflare", accent: "text-orange-400" },
            ].map((tab) => {
              const isActive = activeTab === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setActiveTab(tab.id as TabType);
                  }}
                  className={`group relative inline-flex items-center gap-2.5 rounded-t-xl px-4 py-3 text-xs font-semibold transition-all cursor-pointer ${
                    isActive
                      ? "border-b-2 border-cyan-400 bg-slate-900/90 text-white shadow-lg"
                      : "text-slate-400 hover:bg-slate-900/40 hover:text-slate-200"
                  }`}
                >
                  <Icon className={`h-4 w-4 ${isActive ? tab.accent || "text-cyan-400" : "text-slate-500 group-hover:text-slate-300"}`} />
                  <div className="text-left">
                    <div className="flex items-center gap-1.5">
                      <span>{tab.label}</span>
                      <span className={`rounded px-1.5 py-0.2 text-[9px] font-bold ${isActive ? "bg-cyan-400/20 text-cyan-300" : "bg-slate-800 text-slate-400"}`}>
                        {tab.badge}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </nav>
        </div>

        {/* TAB 1: OVERVIEW */}
        {activeTab === "overview" && (
          <div className="animate-in fade-in duration-200">
            <section className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
              {overviewKpis.map((s) => {
                const up = s.d >= 0;
                const good = s.invertColors ? !up : up;
                const Icon = s.icon || (s.tab === "ga" ? Users : s.tab === "gsc" ? Eye : s.tab === "gbp" ? MapPin : Target);
                return (
                  <button
                    key={s.k}
                    type="button"
                    onClick={() => setActiveTab(s.tab)}
                    className="group relative block text-left overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/40 p-4 transition hover:-translate-y-0.5 hover:border-cyan-400/40 hover:bg-slate-900/70 hover:shadow-[0_0_24px_-8px_rgba(34,211,238,0.35)] cursor-pointer"
                  >
                    <div className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r ${s.accent}`} />
                    <div className="flex items-start justify-between">
                      <div className={`inline-flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br ${s.accent} text-slate-950`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <span className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${good ? "bg-emerald-400/10 text-emerald-300" : "bg-rose-400/10 text-rose-300"}`}>
                        {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                        {Math.abs(s.d)}%
                      </span>
                    </div>
                    <div className="mt-3 text-[10px] uppercase tracking-wider text-slate-500">{s.k}</div>
                    <div className="mt-0.5 text-2xl font-bold tabular-nums text-white">{s.v}</div>
                    <div className="mt-1 flex items-center justify-between text-[10px] text-slate-500">
                      <span>via {s.src} ({site.domain})</span>
                      <span className="inline-flex items-center gap-0.5 text-cyan-300 opacity-0 transition group-hover:opacity-100 font-medium">View Tab <ArrowUpRight className="h-2.5 w-2.5" /></span>
                    </div>
                  </button>
                );
              })}
            </section>

            <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="lg:col-span-2 rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-white">Traffic vs Search Impressions</h2>
                    <p className="mt-0.5 text-[11px] text-slate-500">14-week rolling data for <span className="font-semibold text-slate-300">{currentSite.label} ({currentSite.domain})</span></p>
                  </div>
                  <button onClick={() => setActiveTab("ga")} className="inline-flex items-center gap-1 text-[11px] font-medium text-cyan-300 hover:text-cyan-200">
                    GA4 details <ArrowUpRight className="h-3 w-3" />
                  </button>
                </div>
                <DualSparkline a={trafficTrend} b={impressionsTrend} />
                <div className="mt-3 flex items-center gap-4 text-[11px]">
                  <LegendDot color="#22d3ee" label="GA4 Sessions" />
                  <LegendDot color="#a78bfa" label="GSC Impressions" />
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-white">Pipeline Health</h2>
                  <Gauge className="h-4 w-4 text-cyan-300" />
                </div>
                <div className="mt-4 space-y-3">
                  {[
                    { l: "Quality & Compliance Audit", v: 92, a: "from-rose-400 to-pink-500" },
                    { l: "On-Page", v: 71, a: "from-cyan-400 to-sky-500" },
                    { l: "Off-Page", v: 58, a: "from-violet-400 to-fuchsia-500" },
                    { l: "Technical", v: 94, a: "from-amber-400 to-orange-500" },
                  ].map((r) => (
                    <div key={r.l}>
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-400">{r.l}</span>
                        <span className="font-mono text-cyan-300">{r.v}%</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-800">
                        <div className={`h-full rounded-full bg-gradient-to-r ${r.a}`} style={{ width: `${r.v}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="lg:col-span-2 rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-sm font-semibold text-white">Top Performing Queries</h2>
                    <p className="text-[11px] text-slate-500">Google Search Console data for {currentSite.domain}</p>
                  </div>
                  <button onClick={() => setActiveTab("gsc")} className="text-[11px] font-medium text-cyan-300 hover:text-cyan-200 inline-flex items-center gap-1">
                    GSC Tab <ArrowUpRight className="h-3 w-3" />
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400">
                        <th className="pb-2 font-medium">Query</th>
                        <th className="pb-2 text-right font-medium">Clicks</th>
                        <th className="pb-2 text-right font-medium">Impr.</th>
                        <th className="pb-2 text-right font-medium">CTR</th>
                        <th className="pb-2 text-right font-medium">Pos</th>
                        <th className="pb-2 text-right font-medium">Δ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topQueries.map((q) => (
                        <tr key={q.q} className="border-t border-slate-800/60 hover:bg-slate-900/40">
                          <td className="px-3 py-2 font-medium text-slate-200">{q.q}</td>
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
                      <p className="text-[11px] text-slate-500">Google Analytics ({currentSite.domain})</p>
                    </div>
                  </div>
                  <button onClick={() => setActiveTab("ga")} className="text-[11px] font-medium text-amber-300 hover:text-amber-200 inline-flex items-center gap-1">
                    GA Tab <ArrowUpRight className="h-3 w-3" />
                  </button>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* TAB 2: GOOGLE ANALYTICS (FULL IN-DEPTH INTERFACE EMBEDDED DIRECTLY) */}
        {activeTab === "ga" && (
          <div className="animate-in fade-in duration-200 mt-6">
            {currentSite.gaConnected ? (
              <GoogleAnalyticsDrilldown site={currentSite} />
            ) : (
              <div className="rounded-2xl border border-rose-500/30 bg-gradient-to-br from-rose-950/20 via-slate-950 to-slate-900 p-10 text-center shadow-2xl">
                <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-rose-500/10 text-rose-400 border border-rose-500/30">
                  <AlertTriangle className="h-7 w-7" />
                </div>
                <h3 className="mt-4 text-xl font-bold text-white">Google Analytics Account Not Connected</h3>
                <p className="mt-2 text-sm text-slate-400 max-w-lg mx-auto">
                  Google Analytics 4 integration is not active for <span className="font-bold text-white">{currentSite.label} ({currentSite.domain})</span>. Connect your GA4 property stream to sync traffic, sessions, and visitor conversion tracking.
                </p>
                <div className="mt-6 flex justify-center gap-3">
                  <Link to="/connected-sites" className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-5 py-2.5 text-xs font-bold text-slate-950 shadow-lg hover:bg-cyan-400 transition">
                    <BarChart3 className="h-4 w-4" />
                    Connect GA4 Property
                  </Link>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: GOOGLE SEARCH CONSOLE (FULL IN-DEPTH INTERFACE EMBEDDED DIRECTLY) */}
        {activeTab === "gsc" && (
          <div className="animate-in fade-in duration-200 mt-6">
            {currentSite.gscConnected ? (
              <SearchConsoleDrilldown site={currentSite} />
            ) : (
              <div className="rounded-2xl border border-rose-500/30 bg-gradient-to-br from-rose-950/20 via-slate-950 to-slate-900 p-10 text-center shadow-2xl">
                <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-rose-500/10 text-rose-400 border border-rose-500/30">
                  <AlertTriangle className="h-7 w-7" />
                </div>
                <h3 className="mt-4 text-xl font-bold text-white">Search Console Account Not Connected</h3>
                <p className="mt-2 text-sm text-slate-400 max-w-lg mx-auto">
                  Google Search Console integration is not active for <span className="font-bold text-white">{currentSite.label} ({currentSite.domain})</span>. Connect your domain property to track organic search keywords, click velocity, and position movement.
                </p>
                <div className="mt-6 flex justify-center gap-3">
                  <Link to="/connected-sites" className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-5 py-2.5 text-xs font-bold text-slate-950 shadow-lg hover:bg-cyan-400 transition">
                    <Search className="h-4 w-4" />
                    Connect Search Console Property
                  </Link>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: GOOGLE BUSINESS PROFILE (FULL IN-DEPTH INTERFACE EMBEDDED DIRECTLY) */}
        {activeTab === "gbp" && (
          <div className="animate-in fade-in duration-200 mt-6">
            {currentSite.gbpConnected ? (
              <BusinessProfileDrilldown site={currentSite} />
            ) : (
              <div className="rounded-2xl border border-rose-500/30 bg-gradient-to-br from-rose-950/20 via-slate-950 to-slate-900 p-10 text-center shadow-2xl">
                <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-rose-500/10 text-rose-400 border border-rose-500/30">
                  <AlertTriangle className="h-7 w-7" />
                </div>
                <h3 className="mt-4 text-xl font-bold text-white">Google Business Profile Not Connected</h3>
                <p className="mt-2 text-sm text-slate-400 max-w-lg mx-auto">
                  Google Business Profile integration is not active for <span className="font-bold text-white">{currentSite.label} ({currentSite.domain})</span>. Connect your GMB business location to sync customer phone calls, map direction requests, and review sentiment.
                </p>
                <div className="mt-6 flex justify-center gap-3">
                  <Link to="/connected-sites" className="inline-flex items-center gap-2 rounded-xl bg-violet-500 px-5 py-2.5 text-xs font-bold text-white shadow-lg hover:bg-violet-400 transition">
                    <MapPin className="h-4 w-4" />
                    Connect Business Profile Location
                  </Link>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 5: CLOUDFLARE AI OVERVIEW */}
        {activeTab === "ai-overview" && (
          <div className="mt-6 animate-in fade-in duration-200">
            <CloudflareAiOverview site={currentSite} />
          </div>
        )}

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

function SingleSparkline({ data, color }: { data: number[]; color: string }) {
  const w = 600;
  const h = 160;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const step = w / (data.length - 1);
  const pts = data.map((v, i) => [i * step, h - ((v - min) / range) * (h - 20) - 10] as const);
  const line = pts.map((p, i) => (i === 0 ? `M ${p[0]},${p[1]}` : `L ${p[0]},${p[1]}`)).join(" ");
  const area = `${line} L ${w},${h} L 0,${h} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-4 h-40 w-full">
      <defs>
        <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 1, 2, 3].map((i) => (
        <line key={i} x1="0" x2={w} y1={(h / 4) * (i + 0.5)} y2={(h / 4) * (i + 0.5)} stroke="#1e293b" strokeDasharray="2 4" />
      ))}
      <path d={area} fill="url(#sg)" />
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}


