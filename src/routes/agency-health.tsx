import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  ShieldCheck,
  Search,
  Globe,
  Gauge,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  Star,
  ArrowUpRight,
  Filter,
  Sparkles,
  Clock,
  Link as LinkIcon,
  Activity,
} from "lucide-react";

export const Route = createFileRoute("/agency-health")({
  head: () => ({
    meta: [
      { title: "Agency Health — AKS SEO Console" },
      { name: "description", content: "Portfolio-wide performance summary across every managed website: SEO score, Core Web Vitals, traffic and ratings." },
      { property: "og:title", content: "Agency Health — AKS SEO Console" },
      { property: "og:description", content: "Live health cards for every managed WordPress property." },
    ],
  }),
  component: AgencyHealthPage,
});

type Site = {
  id: string;
  name: string;
  domain: string;
  category: string;
  score: number;
  grade: "A+" | "A" | "B" | "C" | "D";
  rating: number;
  status: "healthy" | "warning" | "critical";
  traffic: string;
  trafficDelta: number;
  keywords: number;
  keywordsDelta: number;
  backlinks: string;
  cwv: { lcp: number; cls: number; inp: number };
  uptime: number;
  lastScan: string;
  issues: number;
  trend: number[];
};

const SITES: Site[] = [
  {
    id: "1", name: "Desert Rose Hotel", domain: "desertrosehotel.ae", category: "Hospitality",
    score: 92, grade: "A+", rating: 4.9, status: "healthy",
    traffic: "48.2k", trafficDelta: 12.4, keywords: 1842, keywordsDelta: 84, backlinks: "3.2k",
    cwv: { lcp: 1.8, cls: 0.04, inp: 128 }, uptime: 99.98, lastScan: "12m", issues: 2,
    trend: [30, 34, 32, 40, 38, 46, 48, 52, 55, 58, 62, 68],
  },
  {
    id: "2", name: "Marina Boutique", domain: "marinaboutique.com", category: "E-commerce",
    score: 87, grade: "A", rating: 4.7, status: "healthy",
    traffic: "31.5k", trafficDelta: 8.2, keywords: 1204, keywordsDelta: 42, backlinks: "1.8k",
    cwv: { lcp: 2.1, cls: 0.06, inp: 145 }, uptime: 99.94, lastScan: "28m", issues: 4,
    trend: [20, 22, 24, 26, 28, 30, 29, 32, 34, 36, 38, 40],
  },
  {
    id: "3", name: "Gulf Legal Advisors", domain: "gulflegal.ae", category: "Professional",
    score: 78, grade: "B", rating: 4.6, status: "warning",
    traffic: "18.4k", trafficDelta: -3.1, keywords: 682, keywordsDelta: -14, backlinks: "942",
    cwv: { lcp: 2.9, cls: 0.09, inp: 220 }, uptime: 99.82, lastScan: "1h", issues: 12,
    trend: [24, 26, 25, 28, 27, 26, 24, 25, 23, 22, 21, 20],
  },
  {
    id: "4", name: "Palm Auto Detailing", domain: "palmauto.ae", category: "Local Services",
    score: 84, grade: "A", rating: 4.8, status: "healthy",
    traffic: "12.8k", trafficDelta: 22.6, keywords: 486, keywordsDelta: 62, backlinks: "384",
    cwv: { lcp: 2.0, cls: 0.05, inp: 132 }, uptime: 99.99, lastScan: "8m", issues: 3,
    trend: [10, 12, 14, 15, 18, 20, 22, 24, 26, 28, 30, 34],
  },
  {
    id: "5", name: "Skyline Interiors", domain: "skylineinteriors.com", category: "Portfolio",
    score: 66, grade: "C", rating: 4.3, status: "critical",
    traffic: "6.2k", trafficDelta: -12.4, keywords: 218, keywordsDelta: -28, backlinks: "156",
    cwv: { lcp: 3.8, cls: 0.14, inp: 342 }, uptime: 98.62, lastScan: "3h", issues: 27,
    trend: [22, 20, 21, 19, 18, 17, 16, 15, 14, 13, 12, 10],
  },
  {
    id: "6", name: "Cedar Clinic", domain: "cedarclinic.ae", category: "Healthcare",
    score: 89, grade: "A", rating: 4.9, status: "healthy",
    traffic: "24.6k", trafficDelta: 14.8, keywords: 912, keywordsDelta: 38, backlinks: "1.1k",
    cwv: { lcp: 1.9, cls: 0.03, inp: 118 }, uptime: 99.97, lastScan: "18m", issues: 5,
    trend: [18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 42],
  },
  {
    id: "7", name: "Aurora Real Estate", domain: "aurorare.com", category: "Real Estate",
    score: 74, grade: "B", rating: 4.5, status: "warning",
    traffic: "14.2k", trafficDelta: 4.1, keywords: 542, keywordsDelta: 12, backlinks: "612",
    cwv: { lcp: 2.6, cls: 0.08, inp: 198 }, uptime: 99.71, lastScan: "45m", issues: 9,
    trend: [18, 19, 18, 20, 21, 20, 22, 21, 23, 22, 24, 25],
  },
  {
    id: "8", name: "Zenith Fitness", domain: "zenithfit.ae", category: "Local Services",
    score: 81, grade: "A", rating: 4.7, status: "healthy",
    traffic: "9.4k", trafficDelta: 18.2, keywords: 342, keywordsDelta: 48, backlinks: "268",
    cwv: { lcp: 2.2, cls: 0.05, inp: 156 }, uptime: 99.95, lastScan: "22m", issues: 4,
    trend: [8, 9, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28],
  },
];

const FILTERS = ["All", "Healthy", "Warning", "Critical"] as const;
type FilterKey = (typeof FILTERS)[number];

function AgencyHealthPage() {
  const [filter, setFilter] = useState<FilterKey>("All");
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    return SITES.filter((s) => {
      if (filter !== "All" && s.status !== filter.toLowerCase()) return false;
      if (q && !(s.name.toLowerCase().includes(q.toLowerCase()) || s.domain.includes(q.toLowerCase()))) return false;
      return true;
    });
  }, [filter, q]);

  const summary = useMemo(() => {
    const healthy = SITES.filter((s) => s.status === "healthy").length;
    const warning = SITES.filter((s) => s.status === "warning").length;
    const critical = SITES.filter((s) => s.status === "critical").length;
    const avg = Math.round(SITES.reduce((a, s) => a + s.score, 0) / SITES.length);
    const rating = (SITES.reduce((a, s) => a + s.rating, 0) / SITES.length).toFixed(2);
    const issues = SITES.reduce((a, s) => a + s.issues, 0);
    return { healthy, warning, critical, avg, rating, issues };
  }, []);

  return (
    <div className="min-h-screen bg-[#05070d] text-slate-200">
      <div className="mx-auto max-w-7xl px-6 py-10">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-cyan-300/80">
              Portfolio Overview
            </div>
            <h1 className="mt-1 text-2xl font-semibold text-white">Agency Health</h1>
            <p className="mt-1 text-sm text-slate-400">
              Live performance across all managed websites — SEO scores, Core Web Vitals, ratings and open issues.
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1.5 text-[11px] font-medium text-emerald-300">
            <ShieldCheck className="h-3.5 w-3.5" /> {SITES.length} sites monitored
          </span>
        </div>

        {/* Summary strip */}
        <section className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {[
            { l: "Avg SEO Score", v: `${summary.avg}`, sub: "/ 100", a: "from-cyan-400 to-blue-500", i: Gauge },
            { l: "Avg Rating", v: summary.rating, sub: "★", a: "from-amber-400 to-orange-500", i: Star },
            { l: "Healthy", v: `${summary.healthy}`, sub: "sites", a: "from-emerald-400 to-teal-500", i: CheckCircle2 },
            { l: "Warning", v: `${summary.warning}`, sub: "sites", a: "from-amber-400 to-yellow-500", i: AlertTriangle },
            { l: "Critical", v: `${summary.critical}`, sub: "sites", a: "from-rose-400 to-red-500", i: AlertTriangle },
            { l: "Open Issues", v: `${summary.issues}`, sub: "total", a: "from-violet-400 to-fuchsia-500", i: Activity },
          ].map((k) => (
            <div key={k.l} className="relative overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40 p-3">
              <div className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r ${k.a}`} />
              <div className={`inline-flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br ${k.a} text-slate-950`}>
                <k.i className="h-3.5 w-3.5" />
              </div>
              <div className="mt-2 text-[10px] uppercase tracking-wider text-slate-500">{k.l}</div>
              <div className="mt-0.5 flex items-baseline gap-1">
                <span className="text-lg font-semibold tabular-nums text-white">{k.v}</span>
                <span className="text-[10px] text-slate-500">{k.sub}</span>
              </div>
            </div>
          ))}
        </section>

        {/* Toolbar */}
        <section className="mt-6 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search sites or domains…"
              className="w-full rounded-md border border-slate-800 bg-slate-950/60 py-2 pl-8 pr-3 text-[12px] text-slate-200 placeholder:text-slate-600 focus:border-cyan-400/40 focus:outline-none"
            />
          </div>
          <div className="inline-flex items-center gap-1 rounded-md border border-slate-800 bg-slate-950/60 p-1">
            <Filter className="ml-1 h-3 w-3 text-slate-500" />
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded px-2.5 py-1 text-[11px] font-medium transition ${
                  filter === f
                    ? "bg-cyan-500/20 text-white ring-1 ring-cyan-400/30"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </section>

        {/* Cards */}
        <section className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((s) => (
            <SiteCard key={s.id} site={s} />
          ))}
          {filtered.length === 0 && (
            <div className="col-span-full rounded-xl border border-dashed border-slate-800 p-8 text-center text-sm text-slate-500">
              No sites match this filter.
            </div>
          )}
        </section>

        <div aria-hidden className="h-16" />
      </div>
    </div>
  );
}

function SiteCard({ site }: { site: Site }) {
  const statusStyles = {
    healthy: { ring: "ring-emerald-400/30", dot: "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]", chip: "bg-emerald-400/10 text-emerald-300 border-emerald-400/25", label: "Healthy" },
    warning: { ring: "ring-amber-400/30", dot: "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.9)]", chip: "bg-amber-400/10 text-amber-300 border-amber-400/25", label: "Watch" },
    critical: { ring: "ring-rose-400/30", dot: "bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.9)]", chip: "bg-rose-400/10 text-rose-300 border-rose-400/25", label: "Critical" },
  }[site.status];

  const gradeColor = site.score >= 85 ? "from-emerald-400 to-teal-500" : site.score >= 75 ? "from-cyan-400 to-blue-500" : site.score >= 65 ? "from-amber-400 to-orange-500" : "from-rose-400 to-red-500";
  const up = site.trafficDelta >= 0;

  const cwvRating = (v: number, good: number, poor: number) => v <= good ? "good" : v <= poor ? "needs" : "poor";
  const lcpR = cwvRating(site.cwv.lcp, 2.5, 4);
  const clsR = cwvRating(site.cwv.cls, 0.1, 0.25);
  const inpR = cwvRating(site.cwv.inp, 200, 500);
  const cwvColor = (r: string) => r === "good" ? "text-emerald-300" : r === "needs" ? "text-amber-300" : "text-rose-300";

  return (
    <div className={`group relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/40 p-5 transition hover:-translate-y-0.5 hover:border-cyan-500/40 hover:bg-slate-900/70 hover:shadow-[0_0_28px_rgba(34,211,238,0.08)]`}>
      <div className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r ${gradeColor}`} />

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-950 ring-1 ${statusStyles.ring}`}>
            <Globe className="h-4 w-4 text-cyan-300" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-white">{site.name}</div>
            <div className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-slate-500">
              <LinkIcon className="h-2.5 w-2.5" />
              <span className="truncate">{site.domain}</span>
            </div>
            <div className="mt-1 inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-900/60 px-1.5 py-px text-[9px] uppercase tracking-wider text-slate-400">
              {site.category}
            </div>
          </div>
        </div>
        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusStyles.chip}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${statusStyles.dot}`} />
          {statusStyles.label}
        </span>
      </div>

      {/* Score row */}
      <div className="mt-4 grid grid-cols-[auto_1fr] items-center gap-4">
        <ScoreRing score={site.score} grade={site.grade} gradient={gradeColor} />
        <div className="min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[10px] uppercase tracking-wider text-slate-500">Reputation</span>
            <span className="inline-flex items-center gap-0.5 text-[12px] font-semibold text-amber-300">
              <Star className="h-3 w-3 fill-current" />
              {site.rating}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star
                key={i}
                className={`h-3 w-3 ${i < Math.round(site.rating) ? "fill-amber-300 text-amber-300" : "text-slate-700"}`}
              />
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <MiniMetric label="Traffic" value={site.traffic} delta={site.trafficDelta} up={up} />
            <MiniMetric label="Keywords" value={site.keywords.toLocaleString()} delta={site.keywordsDelta} up={site.keywordsDelta >= 0} />
          </div>
        </div>
      </div>

      {/* CWV bar */}
      <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/50 p-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider text-slate-500">Core Web Vitals</span>
          <span className="text-[10px] text-slate-500">Uptime <span className="font-mono text-emerald-300">{site.uptime}%</span></span>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
          <div className="flex flex-col">
            <span className="text-slate-500">LCP</span>
            <span className={`font-mono font-semibold ${cwvColor(lcpR)}`}>{site.cwv.lcp}s</span>
          </div>
          <div className="flex flex-col">
            <span className="text-slate-500">CLS</span>
            <span className={`font-mono font-semibold ${cwvColor(clsR)}`}>{site.cwv.cls}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-slate-500">INP</span>
            <span className={`font-mono font-semibold ${cwvColor(inpR)}`}>{site.cwv.inp}ms</span>
          </div>
        </div>
      </div>

      {/* Sparkline */}
      <div className="mt-3">
        <Sparkline data={site.trend} gradient={gradeColor} />
      </div>

      {/* Footer */}
      <div className="mt-3 flex items-center justify-between border-t border-slate-800 pt-3">
        <div className="flex items-center gap-3 text-[10px] text-slate-500">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-2.5 w-2.5" /> {site.lastScan} ago
          </span>
          <span className="inline-flex items-center gap-1">
            <AlertTriangle className="h-2.5 w-2.5 text-amber-300/80" />
            <span className="text-slate-300">{site.issues}</span> issues
          </span>
          <span className="inline-flex items-center gap-1">
            <Sparkles className="h-2.5 w-2.5 text-cyan-300/80" />
            <span className="text-slate-300">{site.backlinks}</span> links
          </span>
        </div>
        <Link
          to="/analytics"
          className="inline-flex items-center gap-1 text-[11px] font-medium text-cyan-300 transition group-hover:text-cyan-200"
        >
          Open <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}

function MiniMetric({ label, value, delta, up }: { label: string; value: string; delta: number; up: boolean }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-2">
      <div className="text-[9px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-0.5 text-sm font-semibold tabular-nums text-white">{value}</div>
      <div className={`mt-0.5 inline-flex items-center gap-0.5 text-[10px] font-medium ${up ? "text-emerald-300" : "text-rose-300"}`}>
        {up ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
        {Math.abs(delta)}%
      </div>
    </div>
  );
}

function ScoreRing({ score, grade, gradient }: { score: number; grade: string; gradient: string }) {
  const r = 28;
  const c = 2 * Math.PI * r;
  const off = c - (score / 100) * c;
  const id = `sr-${gradient.replace(/[^a-z0-9]/gi, "")}`;
  const [from, to] = gradient.replace("from-", "").replace(" to-", "|").split("|");
  const colorMap: Record<string, string> = {
    "emerald-400": "#34d399", "teal-500": "#14b8a6", "cyan-400": "#22d3ee",
    "blue-500": "#3b82f6", "amber-400": "#fbbf24", "orange-500": "#f97316",
    "rose-400": "#fb7185", "red-500": "#ef4444",
  };
  const c1 = colorMap[from] ?? "#22d3ee";
  const c2 = colorMap[to] ?? "#3b82f6";
  return (
    <div className="relative h-[72px] w-[72px]">
      <svg viewBox="0 0 72 72" className="h-full w-full -rotate-90">
        <defs>
          <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={c1} />
            <stop offset="100%" stopColor={c2} />
          </linearGradient>
        </defs>
        <circle cx="36" cy="36" r={r} stroke="#1e293b" strokeWidth="6" fill="none" />
        <circle
          cx="36" cy="36" r={r} stroke={`url(#${id})`} strokeWidth="6" fill="none"
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off}
          style={{ filter: `drop-shadow(0 0 4px ${c1})` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-base font-bold tabular-nums text-white">{score}</span>
        <span className="text-[9px] uppercase tracking-wider text-slate-500">{grade}</span>
      </div>
    </div>
  );
}

function Sparkline({ data, gradient }: { data: number[]; gradient: string }) {
  const w = 300;
  const h = 40;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const step = w / (data.length - 1);
  const pts = data.map((v, i) => [i * step, h - ((v - min) / range) * (h - 6) - 3] as const);
  const line = pts.map((p, i) => (i === 0 ? `M ${p[0]},${p[1]}` : `L ${p[0]},${p[1]}`)).join(" ");
  const area = `${line} L ${w},${h} L 0,${h} Z`;
  const id = `sp-${gradient.replace(/[^a-z0-9]/gi, "")}`;
  const [from, to] = gradient.replace("from-", "").replace(" to-", "|").split("|");
  const colorMap: Record<string, string> = {
    "emerald-400": "#34d399", "teal-500": "#14b8a6", "cyan-400": "#22d3ee",
    "blue-500": "#3b82f6", "amber-400": "#fbbf24", "orange-500": "#f97316",
    "rose-400": "#fb7185", "red-500": "#ef4444",
  };
  const c1 = colorMap[from] ?? "#22d3ee";
  const c2 = colorMap[to] ?? "#3b82f6";
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-10 w-full">
      <defs>
        <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={c1} />
          <stop offset="100%" stopColor={c2} />
        </linearGradient>
        <linearGradient id={`${id}-f`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={c1} stopOpacity="0.3" />
          <stop offset="100%" stopColor={c1} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id}-f)`} />
      <path d={line} fill="none" stroke={`url(#${id})`} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
