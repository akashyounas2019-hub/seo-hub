import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useSite } from "@/lib/site-context";
import {
  Globe,
  Search,
  BarChart3,
  Zap,
  Link2,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Plus,
  Settings2,
  MapPin,
  Activity,
  Filter,
  ArrowUpRight,
  Trash2,
  Power,
  PowerOff,
  type LucideIcon,
} from "lucide-react";

export const Route = createFileRoute("/connected-sites")({
  head: () => ({
    meta: [
      { title: "Connected Sites — AKS SEO Console" },
      {
        name: "description",
        content:
          "Manage every connected website and its integrations — Google Search Console, Analytics 4, GMB and WordPress — from a single elegant dashboard.",
      },
      { property: "og:title", content: "Connected Sites — AKS SEO Console" },
      {
        property: "og:description",
        content:
          "Overview of every connected site and its Google, GMB and WordPress integrations.",
      },
    ],
  }),
  component: ConnectedSitesPage,
});

type IntegrationStatus = "connected" | "action" | "disconnected";

function statusMeta(s: IntegrationStatus) {
  switch (s) {
    case "connected":
      return { pill: "border-emerald-400/40 bg-emerald-400/10 text-emerald-200", label: "Live", icon: CheckCircle2, cta: "Manage" };
    case "action":
      return { pill: "border-amber-400/40 bg-amber-400/10 text-amber-200", label: "Action", icon: AlertCircle, cta: "Fix" };
    default:
      return { pill: "border-slate-600/60 bg-slate-800/60 text-slate-300", label: "Off", icon: Link2, cta: "Connect" };
  }
}

function ConnectedSitesPage() {
  const { allSites, deleteSite, setCurrentSiteId } = useSite();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<"all" | "healthy" | "attention" | "onboarding">("all");
  const [query, setQuery] = useState("");
  const [disabled, setDisabled] = useState<Record<string, boolean>>({});

  const filtered = useMemo(() => {
    return allSites.filter((s) => (filter === "all" ? true : s.health === filter)).filter((s) =>
      query.trim() === "" ? true : (s.label + s.domain).toLowerCase().includes(query.toLowerCase())
    );
  }, [filter, query, allSites]);

  const totals = useMemo(() => {
    const all = allSites.flatMap((s) => s.integrations);
    return {
      sites: allSites.length,
      live: all.filter((i) => i.status === "connected").length,
      action: all.filter((i) => i.status === "action").length,
      off: all.filter((i) => i.status === "disconnected").length,
    };
  }, [allSites]);

  const handleDelete = (id: string, label: string) => {
    if (!confirm(`Remove "${label}" from connected sites?`)) return;
    deleteSite(id);
    toast.success(`Removed ${label}`);
  };

  const handleToggle = (id: string, label: string) => {
    setDisabled((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      toast(next[id] ? `Paused sync for ${label}` : `Resumed sync for ${label}`);
      return next;
    });
  };

  return (
    <div className="mx-auto min-h-full max-w-[1600px] space-y-6 text-slate-200">
      {/* Header */}
      <header className="relative overflow-hidden rounded-2xl border border-cyan-500/25 bg-slate-950/70 p-5 sm:p-6">
        <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-cyan-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-[0.24em] text-cyan-300/80">
              Network overview
            </div>
            <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold text-white sm:text-3xl">
              <Globe className="h-6 w-6 text-cyan-300" />
              Connected Sites
            </h1>
            <p className="mt-1 max-w-2xl text-[13px] text-slate-400">
              Every website connected to the AKS console with its live integrations for
              Search Console, Analytics 4, Business Profile and the WordPress connector.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => toast.info("Bulk site management — coming soon")}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-[12px] font-medium text-slate-200 hover:border-cyan-400/40 hover:text-cyan-100"
            >
              <Settings2 className="h-3.5 w-3.5" /> Bulk manage
            </button>
            <button
              onClick={() => toast.success("Connect a new site — flow coming soon")}
              className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-cyan-400 to-blue-500 px-3.5 py-1.5 text-[12px] font-semibold text-slate-950 shadow-[0_0_18px_rgba(34,211,238,0.4)] hover:brightness-110"
            >
              <Plus className="h-3.5 w-3.5" /> Connect new site
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="relative mt-5 grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Stat label="Sites" value={totals.sites} tone="cyan" icon={Globe} />
          <Stat label="Live integrations" value={totals.live} tone="emerald" icon={CheckCircle2} />
          <Stat label="Needs action" value={totals.action} tone="amber" icon={AlertCircle} />
          <Stat label="Disconnected" value={totals.off} tone="slate" icon={Link2} />
        </div>
      </header>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-2 pl-3">
        <div className="flex items-center gap-2 text-[12px] text-slate-400">
          <Filter className="h-3.5 w-3.5" />
          {(["all", "healthy", "attention", "onboarding"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1 capitalize transition ${
                filter === f
                  ? "bg-cyan-400/15 text-cyan-100 ring-1 ring-inset ring-cyan-400/40"
                  : "text-slate-400 hover:bg-slate-800/60 hover:text-white"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/60 px-3 py-1.5">
          <Search className="h-3.5 w-3.5 text-slate-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search sites or domains…"
            className="w-48 bg-transparent text-[12px] text-white placeholder:text-slate-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Site cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {filtered.map((site) => (
          <SiteCard
            key={site.id}
            site={site}
            paused={!!disabled[site.id]}
            onDelete={() => handleDelete(site.id, site.label)}
            onToggle={() => handleToggle(site.id, site.label)}
            onViewDetails={() => {
              setCurrentSiteId(site.id);
              navigate({ to: "/knowledge-base" });
            }}
          />
        ))}
        {filtered.length === 0 && (
          <div className="col-span-full rounded-xl border border-dashed border-slate-800 bg-slate-950/40 px-6 py-10 text-center text-[13px] text-slate-500">
            No sites match this filter.
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string;
  value: number | string;
  tone: "cyan" | "emerald" | "amber" | "slate";
  icon: LucideIcon;
}) {
  const map = {
    cyan: { text: "text-cyan-200", glow: "shadow-[0_0_20px_rgba(34,211,238,0.15)]", ring: "ring-cyan-400/25" },
    emerald: { text: "text-emerald-200", glow: "shadow-[0_0_20px_rgba(52,211,153,0.15)]", ring: "ring-emerald-400/25" },
    amber: { text: "text-amber-200", glow: "shadow-[0_0_20px_rgba(251,191,36,0.15)]", ring: "ring-amber-400/25" },
    slate: { text: "text-slate-200", glow: "", ring: "ring-slate-700" },
  }[tone];
  return (
    <div className={`rounded-xl border border-slate-800 bg-slate-900/50 px-3 py-2.5 ring-1 ring-inset ${map.ring} ${map.glow}`}>
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-slate-500">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className={`mt-1 text-lg font-semibold ${map.text}`}>{value}</div>
    </div>
  );
}

function SiteCard({
  site,
  paused,
  onDelete,
  onToggle,
  onViewDetails,
}: {
  site: any;
  paused: boolean;
  onDelete: () => void;
  onToggle: () => void;
  onViewDetails: () => void;
}) {
  const healthMeta =
    site.health === "healthy"
      ? { dot: "bg-emerald-400", label: "Healthy", pill: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" }
      : site.health === "attention"
        ? { dot: "bg-amber-400", label: "Needs attention", pill: "border-amber-400/30 bg-amber-400/10 text-amber-200" }
        : { dot: "bg-cyan-300", label: "Onboarding", pill: "border-cyan-400/30 bg-cyan-400/10 text-cyan-200" };

  const indexPct = Math.round((site.indexed / Math.max(1, site.pages)) * 100);

  return (
    <article className={`group relative overflow-hidden rounded-2xl border bg-slate-950/70 p-4 transition hover:shadow-[0_0_30px_-10px_rgba(34,211,238,0.4)] ${paused ? "border-slate-800 opacity-70" : "border-slate-800 hover:border-cyan-400/40"}`}>
      <div className="pointer-events-none absolute -top-16 -right-16 h-40 w-40 rounded-full bg-cyan-500/10 blur-3xl opacity-0 transition group-hover:opacity-100" />

      {/* Header */}
      <header className="relative flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`h-1.5 w-1.5 rounded-full ${healthMeta.dot} shadow-[0_0_8px_currentColor]`} />
            <h2 className="truncate text-[14px] font-semibold text-white">{site.label}</h2>
            {paused && (
              <span className="rounded-full border border-slate-700 bg-slate-900 px-1.5 py-px text-[9px] uppercase tracking-wider text-slate-400">
                Paused
              </span>
            )}
          </div>
          <a
            href={`https://${site.domain}`}
            target="_blank"
            rel="noreferrer"
            className="mt-0.5 inline-flex items-center gap-1 text-[12px] text-cyan-300 hover:text-cyan-200 hover:underline"
          >
            {site.domain} <ExternalLink className="h-3 w-3" />
          </a>
          <div className="mt-0.5 text-[11px] text-slate-500">{site.location}</div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${healthMeta.pill}`}>
            {healthMeta.label}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={onToggle}
              title={paused ? "Resume sync" : "Pause sync"}
              className={`grid h-6 w-6 place-items-center rounded-md border text-[11px] transition ${
                paused
                  ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200 hover:bg-emerald-400/20"
                  : "border-slate-700 bg-slate-900/60 text-slate-400 hover:border-amber-400/40 hover:text-amber-200"
              }`}
            >
              {paused ? <Power className="h-3 w-3" /> : <PowerOff className="h-3 w-3" />}
            </button>
            <button
              onClick={onDelete}
              title="Remove site"
              className="grid h-6 w-6 place-items-center rounded-md border border-slate-700 bg-slate-900/60 text-slate-400 transition hover:border-rose-400/40 hover:text-rose-300"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        </div>
      </header>

      {/* Metrics */}
      <div className="relative mt-3 grid grid-cols-2 gap-2 rounded-lg border border-slate-800/70 bg-slate-900/40 p-2">
        <Metric label="Indexed" value={`${indexPct}%`} sub={`${site.indexed}/${site.pages}`} tone="emerald" />
        <Metric
          label="Open fixes"
          value={site.openFixes}
          tone={site.openFixes > 3 ? "amber" : "slate"}
        />
      </div>

      {/* Integrations */}
      <div className="relative mt-3">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">Integrations</span>
          <span className="text-[10px] text-slate-500">{site.integrations.length} total</span>
        </div>
        <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {site.integrations.map((intg: any) => {
            const s = statusMeta(intg.status);
            const StatusIcon = s.icon;
            const IconMap: Record<string, any> = { gsc: Search, ga4: BarChart3, gmb: MapPin, gbp: MapPin, wp: Zap };
            const Icon = intg.icon || IconMap[intg.id] || Globe;
            return (
              <li key={intg.id}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-800/80 bg-slate-950/60 px-2.5 py-2 text-left transition hover:border-cyan-400/40 hover:bg-slate-900/70 focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span className="relative grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-md bg-slate-900 ring-1 ring-slate-800">
                      <span className={`absolute inset-0 bg-gradient-to-br ${intg.accent} opacity-30`} />
                      <Icon className="relative h-4 w-4 text-white" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[12px] font-medium text-white">{intg.name}</span>
                      <span className="block truncate text-[10.5px] text-slate-400">{intg.detail}</span>
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-0.5">
                    <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] ${s.pill}`}>
                      <StatusIcon className="h-2.5 w-2.5" />
                      {s.label}
                    </span>
                    <span className="text-[10px] font-medium text-cyan-300">{s.cta} →</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Footer actions */}
      <footer className="relative mt-3 flex items-center justify-between border-t border-slate-800/80 pt-3">
        <a
          href={`https://${site.domain}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-cyan-200"
        >
          <Activity className="h-3 w-3" /> Open site
        </a>
        <button
          onClick={onViewDetails}
          className="inline-flex items-center gap-1 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-medium text-cyan-100 hover:bg-cyan-400/20"
        >
          See details <ArrowUpRight className="h-3 w-3" />
        </button>
      </footer>
    </article>
  );
}

function Metric({
  label,
  value,
  sub,
  suffix,
  tone,
}: {
  label: string;
  value: number | string;
  sub?: string;
  suffix?: string;
  tone: "cyan" | "emerald" | "amber" | "slate";
}) {
  const map = {
    cyan: "text-cyan-200",
    emerald: "text-emerald-200",
    amber: "text-amber-200",
    slate: "text-slate-300",
  }[tone];
  return (
    <div>
      <div className="text-[9.5px] font-medium uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className={`mt-0.5 text-[13px] font-semibold ${map}`}>
        {value}
        {suffix && <span className="ml-0.5 text-[10px] font-normal text-slate-500">{suffix}</span>}
      </div>
      {sub && <div className="text-[10px] text-slate-500">{sub}</div>}
    </div>
  );
}
