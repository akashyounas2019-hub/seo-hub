import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import {
  ShieldCheck,
  Search,
  Globe,
  Gauge,
  AlertTriangle,
  CheckCircle2,
  ArrowUpRight,
  Filter,
  Sparkles,
  Link2,
  Activity,
  Trash2,
  ExternalLink,
} from "lucide-react";
import { useSite, type ConnectedSite } from "@/lib/site-context";

export const Route = createFileRoute("/agency-health")({
  head: () => ({
    meta: [
      { title: "Agency Health — AKS SEO Console" },
      { name: "description", content: "Portfolio-wide performance summary across every managed website: SEO score, Core Web Vitals, traffic and ratings." },
      { property: "og:title", content: "Agency Health — AKS SEO Console" },
      { property: "og:description", content: "Live health cards for every managed property." },
    ],
  }),
  component: AgencyHealthPage,
});

const FILTERS = ["All", "Healthy", "Warning", "Critical"] as const;
type FilterKey = (typeof FILTERS)[number];

function AgencyHealthPage() {
  const { allSites, deleteSite, setCurrentSiteId } = useSite();
  const [mounted, setMounted] = useState(false);
  const [filter, setFilter] = useState<FilterKey>("All");
  const [q, setQ] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  const filtered = useMemo(() => {
    return allSites.filter((s) => {
      const statusKey = s.health === "healthy" ? "healthy" : s.health === "attention" ? "warning" : "critical";
      if (filter !== "All" && statusKey !== filter.toLowerCase()) return false;
      if (q && !(s.label.toLowerCase().includes(q.toLowerCase()) || s.domain.toLowerCase().includes(q.toLowerCase()))) return false;
      return true;
    });
  }, [allSites, filter, q]);

  const summary = useMemo(() => {
    const healthy = allSites.filter((s) => s.health === "healthy").length;
    const warning = allSites.filter((s) => s.health === "attention").length;
    const critical = allSites.filter((s) => s.health === "onboarding").length;
    const connected = allSites.filter((s) => s.gaConnected || s.gscConnected || s.gbpConnected).length;
    const issues = allSites.reduce((a, s) => a + s.openFixes, 0);
    return { healthy, warning, critical, connected, issues };
  }, [allSites]);

  const handleDelete = (site: ConnectedSite) => {
    if (window.confirm(`Are you sure you want to delete the site profile for "${site.label}" (${site.domain})? This action will remove it from all dashboards.`)) {
      deleteSite(site.id);
    }
  };

  return (
    <div className="min-h-screen bg-[#05070d] text-slate-200">
      <div className="mx-auto max-w-[1600px] px-3 sm:px-4 py-10">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-cyan-300/80">
              Active Connected Portfolio
            </div>
            <h1 className="mt-1 text-2xl font-semibold text-white">Agency Health</h1>
            <p className="mt-1 text-sm text-slate-400">
              Live performance across active connected websites — SEO scores, Core Web Vitals, ratings and open issues.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1.5 text-[11px] font-medium text-emerald-300">
              <ShieldCheck className="h-3.5 w-3.5" /> {allSites.length} Active Connected Sites
            </span>
          </div>
        </div>

        {/* Data Review & Audit Banner */}
        <div className="mt-6 rounded-2xl border border-cyan-500/20 bg-gradient-to-r from-cyan-950/30 via-slate-900/60 to-slate-950 p-4 backdrop-blur-md">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
                <Activity className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">Data Source Audit &amp; Synchronization</h3>
                <p className="text-xs text-slate-400">
                  {(() => {
                    const gaConnectedSites = allSites.filter((s) => s.gaConnected);
                    if (gaConnectedSites.length === 0) {
                      return "No sites have Google Analytics connected yet.";
                    }
                    if (gaConnectedSites.length === 1) {
                      const s = gaConnectedSites[0];
                      return (
                        <>
                          <span className="text-emerald-300 font-semibold">{s.label}</span> is synced with{" "}
                          <span className="font-mono text-cyan-300">Live GA4 Data API ({s.gaProperty || "connected property"})</span>.{" "}
                          {allSites.length > 1 && `${allSites.length - 1} other site(s) display connected dashboard context profiles.`}
                        </>
                      );
                    }
                    return `${gaConnectedSites.length} of ${allSites.length} sites are synced with the Live GA4 Data API.`;
                  })()}
                </p>
              </div>
            </div>
            <Link to="/connected-sites" className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-3 py-1.5 text-xs font-bold text-cyan-300 hover:bg-cyan-400/20 transition">
              Manage Connected Sites <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        {/* Summary strip */}
        <section className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {[
            { l: "Connected", v: `${summary.connected}`, sub: "sites", a: "from-cyan-400 to-blue-500", i: Gauge },
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
              placeholder="Search connected sites or domains…"
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

        {/* Site Cards Grid */}
        <section className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((site) => (
            <SiteCard key={site.id} site={site} onDelete={() => handleDelete(site)} onSelect={() => setCurrentSiteId(site.id)} />
          ))}
          {filtered.length === 0 && (
            <div className="col-span-full rounded-xl border border-dashed border-slate-800 p-8 text-center text-sm text-slate-500">
              No connected sites match this search filter.
            </div>
          )}
        </section>

        <div aria-hidden className="h-16" />
      </div>
    </div>
  );
}

function SiteCard({ site, onDelete, onSelect }: { site: ConnectedSite; onDelete: () => void; onSelect: () => void }) {
  const statusKey = site.health === "healthy" ? "healthy" : site.health === "attention" ? "warning" : "critical";
  const statusStyles = {
    healthy: { ring: "ring-emerald-400/30", dot: "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]", chip: "bg-emerald-400/10 text-emerald-300 border-emerald-400/25", label: "Healthy" },
    warning: { ring: "ring-amber-400/30", dot: "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.9)]", chip: "bg-amber-400/10 text-amber-300 border-amber-400/25", label: "Watch" },
    critical: { ring: "ring-rose-400/30", dot: "bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.9)]", chip: "bg-rose-400/10 text-rose-300 border-rose-400/25", label: "Attention" },
  }[statusKey];

  const connectedCount = [site.gaConnected, site.gscConnected, site.gbpConnected, site.wpConnected].filter(Boolean).length;
  const gradeColor = connectedCount >= 3 ? "from-emerald-400 to-teal-500" : connectedCount >= 2 ? "from-cyan-400 to-blue-500" : connectedCount >= 1 ? "from-amber-400 to-orange-500" : "from-rose-400 to-red-500";

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
            <div className="truncate text-sm font-semibold text-white">{site.label}</div>
            <div className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-slate-500">
              <Link2 className="h-2.5 w-2.5" />
              <span className="truncate">{site.domain}</span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-900/60 px-1.5 py-px text-[9px] uppercase tracking-wider text-slate-400">
                {site.location}
              </span>
              {site.gaConnected && (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-px text-[9px] font-semibold text-emerald-300">
                  Live GA4 Data
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusStyles.chip}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${statusStyles.dot}`} />
            {statusStyles.label}
          </span>
          <button
            type="button"
            onClick={onDelete}
            title="Delete Site Profile"
            className="rounded-lg border border-slate-800 bg-slate-950/60 p-1.5 text-slate-500 hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-400 transition cursor-pointer"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Integrations row */}
      <div className="mt-4 grid grid-cols-[auto_1fr] items-center gap-4">
        <ConnectionRing connectedCount={connectedCount} gradient={gradeColor} />
        <div className="min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[10px] uppercase tracking-wider text-slate-500">Integrations</span>
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {[
              { key: "gsc", label: "GSC", on: site.gscConnected },
              { key: "ga4", label: "GA4", on: site.gaConnected },
              { key: "gbp", label: "GBP", on: site.gbpConnected },
              { key: "wp", label: "WP", on: site.wpConnected },
            ].map((i) => (
              <span
                key={i.key}
                className={`rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${
                  i.on ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" : "border-slate-700 bg-slate-900/60 text-slate-500"
                }`}
              >
                {i.label}
              </span>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <MiniMetric label="Indexed" value={`${site.indexed} / ${site.pages}`} />
            <MiniMetric label="Open fixes" value={String(site.openFixes)} />
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-4 flex items-center justify-between border-t border-slate-800 pt-3">
        <div className="flex items-center gap-3 text-[10px] text-slate-500">
          <span className="inline-flex items-center gap-1">
            <AlertTriangle className="h-2.5 w-2.5 text-amber-300/80" />
            <span className="text-slate-300">{site.openFixes}</span> fixes
          </span>
          <span className="inline-flex items-center gap-1">
            <Sparkles className="h-2.5 w-2.5 text-cyan-300/80" />
            <span className="text-slate-300">{site.pages}</span> pages
          </span>
        </div>
        <Link
          to="/dashboard"
          onClick={onSelect}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-cyan-300 transition group-hover:text-cyan-200"
        >
          Open Console <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-2">
      <div className="text-[9px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-0.5 text-sm font-semibold tabular-nums text-white">{value}</div>
    </div>
  );
}

function ConnectionRing({ connectedCount, gradient }: { connectedCount: number; gradient: string }) {
  const total = 4;
  const score = Math.round((connectedCount / total) * 100);
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
        <span className="text-base font-bold tabular-nums text-white">{connectedCount}/{total}</span>
        <span className="text-[9px] uppercase tracking-wider text-slate-500">Live</span>
      </div>
    </div>
  );
}

