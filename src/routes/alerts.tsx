import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Bell,
  BellOff,
  CheckCircle2,
  Search,
  Filter,
  MapPin,
  Building2,
  Star,
  Link2,
  Gauge,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  Globe,
  Clock,
  Zap,
  X,
  ChevronRight,
  Activity,
  Wifi,
  FileWarning,
  Users,
} from "lucide-react";

export const Route = createFileRoute("/alerts")({
  head: () => ({
    meta: [
      { title: "Alert Manager — AKS SEO Console" },
      {
        name: "description",
        content:
          "SEO alert manager for a Dubai cleaning services company: local rank drops, citation inconsistencies, GBP issues, and site performance alerts.",
      },
      { property: "og:title", content: "Alert Manager — AKS SEO Console" },
      {
        property: "og:description",
        content:
          "Monitor local rank fluctuations, citation NAP issues, and Core Web Vitals for Dubai cleaning SEO.",
      },
    ],
  }),
  component: AlertsPage,
});

type Severity = "critical" | "high" | "medium" | "low";
type Status = "active" | "acknowledged" | "resolved";
type CategoryId =
  | "local-rank"
  | "citations"
  | "gbp"
  | "performance"
  | "reviews"
  | "backlinks"
  | "technical";

type Alert = {
  id: string;
  title: string;
  detail: string;
  category: CategoryId;
  severity: Severity;
  status: Status;
  source: string;
  location?: string;
  metric?: string;
  time: string;
  icon: typeof Bell;
};

const CATEGORIES: {
  id: CategoryId;
  label: string;
  icon: typeof Bell;
  accent: string;
}[] = [
  { id: "local-rank", label: "Local Rank", icon: MapPin, accent: "from-cyan-400 to-sky-500" },
  { id: "citations", label: "Citations / NAP", icon: Globe, accent: "from-amber-400 to-orange-500" },
  { id: "gbp", label: "Google Business Profile", icon: Building2, accent: "from-violet-400 to-fuchsia-500" },
  { id: "performance", label: "Site Performance", icon: Gauge, accent: "from-indigo-400 to-blue-500" },
  { id: "reviews", label: "Reviews", icon: Star, accent: "from-yellow-400 to-amber-500" },
  { id: "backlinks", label: "Backlinks", icon: Link2, accent: "from-rose-400 to-pink-500" },
  { id: "technical", label: "Technical / Security", icon: ShieldAlert, accent: "from-emerald-400 to-teal-500" },
];

const INITIAL_ALERTS: Alert[] = [
  {
    id: "a1",
    title: "‘deep cleaning services Dubai Marina’ dropped 6 positions",
    detail: "Position slipped from #3 to #9 in Dubai Marina map pack over the last 24h. Competitor ‘Justmop’ overtook the local 3-pack.",
    category: "local-rank",
    severity: "critical",
    status: "active",
    source: "Local Rank Tracker",
    location: "Dubai Marina",
    metric: "#3 → #9",
    time: "12 min ago",
    icon: TrendingDown,
  },
  {
    id: "a2",
    title: "NAP inconsistency detected on Yellow Pages UAE",
    detail: "Phone number on yellowpages.ae shows +971 4 555 0102, but website & GBP show +971 4 555 0199. Fix before Google recrawls.",
    category: "citations",
    severity: "high",
    status: "active",
    source: "Citation Monitor",
    location: "yellowpages.ae",
    metric: "Phone mismatch",
    time: "38 min ago",
    icon: FileWarning,
  },
  {
    id: "a3",
    title: "LCP regression on /services/villa-deep-cleaning",
    detail: "Largest Contentful Paint jumped from 2.1s to 4.3s on mobile (UAE region). Hero image not preloaded after recent deploy.",
    category: "performance",
    severity: "critical",
    status: "active",
    source: "Core Web Vitals",
    metric: "LCP 4.3s",
    time: "1h ago",
    icon: Gauge,
  },
  {
    id: "a4",
    title: "New 2★ review on Google Business Profile",
    detail: "‘Cleaner arrived 45 min late in JLT.’ Reply within 24h to protect local ranking signals.",
    category: "reviews",
    severity: "high",
    status: "active",
    source: "GBP Reviews",
    location: "JLT",
    metric: "2 / 5",
    time: "2h ago",
    icon: Star,
  },
  {
    id: "a5",
    title: "GBP service area missing: Al Barsha",
    detail: "Al Barsha was removed from service areas after last sync. This zone drove 12% of GBP calls last month.",
    category: "gbp",
    severity: "high",
    status: "active",
    source: "GBP Sync",
    location: "Al Barsha",
    metric: "Zone removed",
    time: "3h ago",
    icon: Building2,
  },
  {
    id: "a6",
    title: "Toxic backlink spike from spam directory",
    detail: "27 new backlinks from low-authority UAE directory network (DA < 8). Consider adding to Google Disavow file.",
    category: "backlinks",
    severity: "medium",
    status: "active",
    source: "Backlink Monitor",
    metric: "+27 toxic",
    time: "5h ago",
    icon: Link2,
  },
  {
    id: "a7",
    title: "Duplicate listing found on Connect.ae",
    detail: "Two active profiles for ‘AKS Cleaning Services’ with different addresses. Merge or claim removal to consolidate authority.",
    category: "citations",
    severity: "medium",
    status: "active",
    source: "Citation Monitor",
    location: "connect.ae",
    metric: "2 listings",
    time: "6h ago",
    icon: Globe,
  },
  {
    id: "a8",
    title: "CLS regression on /services/sofa-cleaning",
    detail: "Cumulative Layout Shift rose to 0.24 (target < 0.1) after new booking widget was injected above the fold.",
    category: "performance",
    severity: "high",
    status: "acknowledged",
    source: "Core Web Vitals",
    metric: "CLS 0.24",
    time: "8h ago",
    icon: Activity,
  },
  {
    id: "a9",
    title: "SSL certificate expires in 18 days",
    detail: "akscleaning.ae SSL certificate expires on 30 July 2026. Auto-renewal is off — manual renewal required.",
    category: "technical",
    severity: "high",
    status: "active",
    source: "Uptime Watcher",
    metric: "18 days",
    time: "9h ago",
    icon: ShieldAlert,
  },
  {
    id: "a10",
    title: "‘maid service Downtown Dubai’ fell out of top 10",
    detail: "Dropped from #8 to #14 overnight. Content refresh recommended — page not updated in 94 days.",
    category: "local-rank",
    severity: "high",
    status: "active",
    source: "Local Rank Tracker",
    location: "Downtown Dubai",
    metric: "#8 → #14",
    time: "11h ago",
    icon: TrendingDown,
  },
  {
    id: "a11",
    title: "Uptime dip detected from UAE probe",
    detail: "Site returned 503 for 4 minutes at 03:12 GST. All other regions healthy — likely CDN edge issue in Dubai region.",
    category: "technical",
    severity: "medium",
    status: "resolved",
    source: "Uptime Watcher",
    metric: "4 min downtime",
    time: "14h ago",
    icon: Wifi,
  },
  {
    id: "a12",
    title: "GBP photo removed by Google",
    detail: "Interior photo of Business Bay office flagged and removed. Upload a compliant replacement to keep media score high.",
    category: "gbp",
    severity: "low",
    status: "active",
    source: "GBP Sync",
    location: "Business Bay",
    metric: "1 photo removed",
    time: "1d ago",
    icon: Building2,
  },
  {
    id: "a13",
    title: "‘villa cleaning Palm Jumeirah’ climbed to #2",
    detail: "Positive movement — page now #2 in local pack, up from #5. Consider allocating more ad-spend to capture demand.",
    category: "local-rank",
    severity: "low",
    status: "resolved",
    source: "Local Rank Tracker",
    location: "Palm Jumeirah",
    metric: "#5 → #2",
    time: "1d ago",
    icon: TrendingUp,
  },
  {
    id: "a14",
    title: "3 broken internal links on service pages",
    detail: "Broken links found on deep-clean, sofa-cleaning, and move-in pages pointing to a deleted /promo/ramadan page.",
    category: "technical",
    severity: "medium",
    status: "acknowledged",
    source: "Crawl Audit",
    metric: "3 x 404",
    time: "1d ago",
    icon: FileWarning,
  },
  {
    id: "a15",
    title: "Review velocity dropped 32% week-over-week",
    detail: "Only 9 new Google reviews this week vs 13 average. Review-request automation may have stalled — check WhatsApp integration.",
    category: "reviews",
    severity: "medium",
    status: "active",
    source: "Reputation Monitor",
    metric: "-32% WoW",
    time: "2d ago",
    icon: Users,
  },
];

const SEVERITY_META: Record<
  Severity,
  { label: string; dot: string; chip: string; ring: string }
> = {
  critical: {
    label: "Critical",
    dot: "bg-rose-400 shadow-[0_0_10px_rgba(251,113,133,0.8)]",
    chip: "border-rose-400/40 bg-rose-500/10 text-rose-200",
    ring: "ring-rose-400/30",
  },
  high: {
    label: "High",
    dot: "bg-orange-400 shadow-[0_0_10px_rgba(251,146,60,0.7)]",
    chip: "border-orange-400/40 bg-orange-500/10 text-orange-200",
    ring: "ring-orange-400/30",
  },
  medium: {
    label: "Medium",
    dot: "bg-amber-300",
    chip: "border-amber-400/40 bg-amber-500/10 text-amber-200",
    ring: "ring-amber-400/20",
  },
  low: {
    label: "Low",
    dot: "bg-sky-400",
    chip: "border-sky-400/40 bg-sky-500/10 text-sky-200",
    ring: "ring-sky-400/20",
  },
};

const STATUS_META: Record<Status, { label: string; chip: string; icon: typeof Bell }> = {
  active: {
    label: "Active",
    chip: "border-rose-400/30 bg-rose-500/10 text-rose-200",
    icon: Bell,
  },
  acknowledged: {
    label: "Acknowledged",
    chip: "border-amber-400/30 bg-amber-500/10 text-amber-200",
    icon: BellOff,
  },
  resolved: {
    label: "Resolved",
    chip: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200",
    icon: CheckCircle2,
  },
};

function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>(INITIAL_ALERTS);
  const [category, setCategory] = useState<CategoryId | "all">("all");
  const [severity, setSeverity] = useState<Severity | "all">("all");
  const [status, setStatus] = useState<Status | "all">("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Alert | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);

  const filtered = useMemo(() => {
    return alerts.filter((a) => {
      if (category !== "all" && a.category !== category) return false;
      if (severity !== "all" && a.severity !== severity) return false;
      if (status !== "all" && a.status !== status) return false;
      if (query && !`${a.title} ${a.detail} ${a.location ?? ""}`.toLowerCase().includes(query.toLowerCase()))
        return false;
      return true;
    });
  }, [alerts, category, severity, status, query]);

  const kpi = useMemo(() => {
    const critical = alerts.filter((a) => a.severity === "critical" && a.status !== "resolved").length;
    const active = alerts.filter((a) => a.status === "active").length;
    const ack = alerts.filter((a) => a.status === "acknowledged").length;
    const resolved24h = alerts.filter((a) => a.status === "resolved").length;
    return { critical, active, ack, resolved24h, total: alerts.length };
  }, [alerts]);

  function updateStatus(id: string, next: Status) {
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, status: next } : a)));
    setSelected((cur) => (cur && cur.id === id ? { ...cur, status: next } : cur));
    toast.success(next === "acknowledged" ? "Alert acknowledged" : next === "resolved" ? "Alert resolved" : "Alert reopened");
  }

  function acknowledgeAll() {
    const n = alerts.filter((a) => a.status === "active").length;
    if (n === 0) {
      toast.info("No active alerts to acknowledge");
      return;
    }
    setAlerts((prev) => prev.map((a) => (a.status === "active" ? { ...a, status: "acknowledged" } : a)));
    toast.success(`Acknowledged ${n} alert${n === 1 ? "" : "s"}`);
  }

  return (
    <div className="min-h-screen bg-[#05070d] text-slate-200">
      <div className="mx-auto max-w-7xl px-6 py-10">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-cyan-300/80">
              Dubai · Cleaning Services
            </div>
            <h1 className="mt-1 text-2xl font-semibold text-white">Alert Manager</h1>
            <p className="mt-1 text-sm text-slate-400">
              Real-time SEO alerts across local rankings, citations, GBP, reviews and site health.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={acknowledgeAll}
              className="inline-flex items-center gap-2 rounded-md border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
            >
              <BellOff className="h-4 w-4" /> Acknowledge all
            </button>
            <button
              onClick={() => setRulesOpen(true)}
              className="inline-flex items-center gap-2 rounded-md border border-cyan-400/30 bg-cyan-400/10 px-3 py-1.5 text-sm font-medium text-cyan-200 hover:bg-cyan-400/20"
            >
              <Zap className="h-4 w-4" /> Alert rules
            </button>
          </div>
        </div>

        {/* KPIs */}
        <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard
            label="Critical"
            value={kpi.critical}
            sub="Requires action"
            icon={AlertTriangle}
            ringFrom="#fb7185"
            ringTo="#e11d48"
            active={severity === "critical"}
            onClick={() => setSeverity(severity === "critical" ? "all" : "critical")}
          />
          <KpiCard
            label="Active"
            value={kpi.active}
            sub={`${kpi.total} total this week`}
            icon={Bell}
            ringFrom="#fb923c"
            ringTo="#f97316"
            active={status === "active"}
            onClick={() => setStatus(status === "active" ? "all" : "active")}
          />
          <KpiCard
            label="Acknowledged"
            value={kpi.ack}
            sub="Owner assigned"
            icon={Clock}
            ringFrom="#fbbf24"
            ringTo="#eab308"
            active={status === "acknowledged"}
            onClick={() => setStatus(status === "acknowledged" ? "all" : "acknowledged")}
          />
          <KpiCard
            label="Resolved"
            value={kpi.resolved24h}
            sub="Last 24 hours"
            icon={CheckCircle2}
            ringFrom="#34d399"
            ringTo="#14b8a6"
            active={status === "resolved"}
            onClick={() => setStatus(status === "resolved" ? "all" : "resolved")}
          />
        </section>

        {/* Filters */}
        <div className="mt-6 flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/40 p-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search alerts, keywords, zones…"
              className="w-full rounded-md border border-slate-800 bg-slate-950/60 py-1.5 pl-8 pr-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400/50 focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-1 rounded-md border border-slate-800 bg-slate-950/50 p-0.5 text-xs">
            {(["all", "critical", "high", "medium", "low"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSeverity(s)}
                className={`rounded px-2.5 py-1 capitalize transition ${
                  severity === s ? "bg-cyan-400/15 text-cyan-200" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 text-[11px] text-slate-500">
            <Filter className="h-3.5 w-3.5" /> {filtered.length} of {alerts.length}
          </div>
        </div>

        {/* Category chips */}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={() => setCategory("all")}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition ${
              category === "all"
                ? "border-cyan-400/50 bg-cyan-400/10 text-cyan-200"
                : "border-slate-800 bg-slate-900/40 text-slate-300 hover:border-slate-700"
            }`}
          >
            <Bell className="h-3.5 w-3.5" /> All categories
          </button>
          {CATEGORIES.map((c) => {
            const Icon = c.icon;
            const active = category === c.id;
            const count = alerts.filter((a) => a.category === c.id).length;
            return (
              <button
                key={c.id}
                onClick={() => setCategory(c.id)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition ${
                  active
                    ? "border-cyan-400/50 bg-cyan-400/10 text-cyan-200"
                    : "border-slate-800 bg-slate-900/40 text-slate-300 hover:border-slate-700"
                }`}
              >
                <Icon className="h-3.5 w-3.5" /> {c.label}
                <span className="ml-1 rounded-full bg-slate-800/80 px-1.5 py-0.5 text-[10px] text-slate-400">
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Alerts grid */}
        <section className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((a) => (
            <AlertCard
              key={a.id}
              alert={a}
              onSelect={() => setSelected(a)}
              onAck={() => updateStatus(a.id, "acknowledged")}
              onResolve={() => updateStatus(a.id, "resolved")}
            />
          ))}
          {filtered.length === 0 && (
            <div className="col-span-full rounded-xl border border-dashed border-slate-800 bg-slate-900/30 p-10 text-center text-sm text-slate-500">
              No alerts match your filters. Try clearing them.
            </div>
          )}
        </section>
      </div>

      {selected && (
        <DetailDrawer
          alert={selected}
          onClose={() => setSelected(null)}
          onAck={() => updateStatus(selected.id, "acknowledged")}
          onResolve={() => updateStatus(selected.id, "resolved")}
          onReopen={() => updateStatus(selected.id, "active")}
        />
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  ringFrom,
  ringTo,
  active,
  onClick,
}: {
  label: string;
  value: number | string;
  sub: string;
  icon: typeof Bell;
  ringFrom: string;
  ringTo: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`group relative overflow-hidden rounded-xl border p-4 text-left transition ${
        active
          ? "border-cyan-400/50 bg-cyan-400/5"
          : "border-slate-800 bg-slate-900/40 hover:border-slate-700"
      }`}
    >
      <div
        className="absolute inset-x-0 top-0 h-[2px] opacity-70"
        style={{ background: `linear-gradient(90deg, ${ringFrom}, ${ringTo})` }}
      />
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-slate-500">{label}</div>
          <div className="mt-1 text-2xl font-semibold text-white">{value}</div>
          <div className="mt-0.5 text-[11px] text-slate-400">{sub}</div>
        </div>
        <div
          className="grid h-9 w-9 place-items-center rounded-lg ring-1 ring-white/5"
          style={{ background: `linear-gradient(135deg, ${ringFrom}22, ${ringTo}22)` }}
        >
          <Icon className="h-4 w-4 text-white/80" />
        </div>
      </div>
    </button>
  );
}

function AlertCard({
  alert,
  onSelect,
  onAck,
  onResolve,
}: {
  alert: Alert;
  onSelect: () => void;
  onAck: () => void;
  onResolve: () => void;
}) {
  const cat = CATEGORIES.find((c) => c.id === alert.category)!;
  const sev = SEVERITY_META[alert.severity];
  const st = STATUS_META[alert.status];
  const Icon = alert.icon;
  const StatusIcon = st.icon;

  return (
    <article
      onClick={onSelect}
      className={`group relative flex cursor-pointer flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40 p-4 transition hover:border-slate-700 hover:bg-slate-900/60 ${
        alert.status === "resolved" ? "opacity-70" : ""
      }`}
    >
      <div
        className={`absolute inset-y-0 left-0 w-[3px] bg-gradient-to-b ${cat.accent}`}
        aria-hidden
      />
      <div className="flex items-start gap-3">
        <div
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br ${cat.accent} text-white shadow-lg ring-1 ${sev.ring}`}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={`h-1.5 w-1.5 rounded-full ${sev.dot}`} />
            <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${sev.chip}`}>
              {sev.label}
            </span>
            <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${st.chip}`}>
              <StatusIcon className="h-2.5 w-2.5" /> {st.label}
            </span>
          </div>
          <h3 className="mt-2 line-clamp-2 text-sm font-semibold text-white group-hover:text-cyan-100">
            {alert.title}
          </h3>
          <p className="mt-1 line-clamp-2 text-xs text-slate-400">{alert.detail}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
        <span className="inline-flex items-center gap-1">
          <cat.icon className="h-3 w-3 text-slate-500" /> {cat.label}
        </span>
        {alert.location && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3 w-3 text-slate-500" /> {alert.location}
          </span>
        )}
        {alert.metric && (
          <span className="inline-flex items-center gap-1 rounded-md border border-slate-800 bg-slate-950/50 px-1.5 py-0.5 font-mono text-slate-300">
            {alert.metric}
          </span>
        )}
        <span className="ml-auto inline-flex items-center gap-1">
          <Clock className="h-3 w-3 text-slate-500" /> {alert.time}
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-slate-800 pt-3">
        <span className="text-[11px] text-slate-500">{alert.source}</span>
        <div className="flex items-center gap-1">
          {alert.status !== "acknowledged" && alert.status !== "resolved" && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAck();
              }}
              className="rounded-md border border-slate-700 bg-slate-900/60 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-800"
            >
              Acknowledge
            </button>
          )}
          {alert.status !== "resolved" && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onResolve();
              }}
              className="rounded-md border border-emerald-400/30 bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-200 hover:bg-emerald-500/20"
            >
              Resolve
            </button>
          )}
          <ChevronRight className="h-4 w-4 text-slate-500" />
        </div>
      </div>
    </article>
  );
}

function DetailDrawer({
  alert,
  onClose,
  onAck,
  onResolve,
  onReopen,
}: {
  alert: Alert;
  onClose: () => void;
  onAck: () => void;
  onResolve: () => void;
  onReopen: () => void;
}) {
  const cat = CATEGORIES.find((c) => c.id === alert.category)!;
  const sev = SEVERITY_META[alert.severity];
  const st = STATUS_META[alert.status];
  const Icon = alert.icon;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <aside
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-md flex-col border-l border-slate-800 bg-[#0a0d16] text-slate-200 shadow-2xl"
      >
        <div className={`h-1 w-full bg-gradient-to-r ${cat.accent}`} />
        <div className="flex items-start justify-between border-b border-slate-800 p-5">
          <div className="flex items-start gap-3">
            <div
              className={`grid h-10 w-10 place-items-center rounded-lg bg-gradient-to-br ${cat.accent} text-white shadow-lg`}
            >
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className={`h-1.5 w-1.5 rounded-full ${sev.dot}`} />
                <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${sev.chip}`}>
                  {sev.label}
                </span>
                <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${st.chip}`}>
                  {st.label}
                </span>
              </div>
              <h2 className="mt-2 text-base font-semibold text-white">{alert.title}</h2>
              <div className="mt-1 text-[11px] text-slate-500">{cat.label} · {alert.source}</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <p className="text-sm leading-relaxed text-slate-300">{alert.detail}</p>

          <div className="mt-5 grid grid-cols-2 gap-2">
            <MetaItem label="Location" value={alert.location ?? "—"} icon={MapPin} />
            <MetaItem label="Metric" value={alert.metric ?? "—"} icon={Activity} />
            <MetaItem label="Detected" value={alert.time} icon={Clock} />
            <MetaItem label="Source" value={alert.source} icon={Bell} />
          </div>

          <div className="mt-6">
            <div className="text-[11px] uppercase tracking-wider text-slate-500">Suggested actions</div>
            <ul className="mt-2 space-y-2 text-sm">
              {suggestActions(alert).map((s, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 rounded-md border border-slate-800 bg-slate-900/40 px-3 py-2 text-slate-200"
                >
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-300" />
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-6">
            <div className="text-[11px] uppercase tracking-wider text-slate-500">Activity</div>
            <ol className="mt-2 space-y-3 border-l border-slate-800 pl-4 text-xs text-slate-400">
              <li>
                <div className="text-slate-200">Alert triggered</div>
                <div>{alert.time} · by {alert.source}</div>
              </li>
              <li>
                <div className="text-slate-200">Routed to SEO team</div>
                <div>Slack #seo-alerts</div>
              </li>
            </ol>
          </div>
        </div>

        <div className="border-t border-slate-800 p-4">
          <div className="flex items-center gap-2">
            {alert.status === "resolved" ? (
              <button
                onClick={onReopen}
                className="flex-1 rounded-md border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
              >
                Reopen alert
              </button>
            ) : (
              <>
                <button
                  onClick={onAck}
                  className="flex-1 rounded-md border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
                >
                  Acknowledge
                </button>
                <button
                  onClick={onResolve}
                  className="flex-1 rounded-md border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-200 hover:bg-emerald-500/20"
                >
                  Mark resolved
                </button>
              </>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}

function MetaItem({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Bell;
}) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-900/40 px-3 py-2">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-slate-500">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className="mt-1 text-xs text-slate-200">{value}</div>
    </div>
  );
}

function suggestActions(alert: Alert): string[] {
  switch (alert.category) {
    case "local-rank":
      return [
        "Refresh on-page content with updated Dubai-specific terms.",
        "Add fresh customer reviews mentioning the target zone.",
        "Check competitor GBP updates in the same map pack.",
      ];
    case "citations":
      return [
        "Update NAP details on the affected directory.",
        "Re-verify listing ownership and request re-crawl.",
        "Sync change back to GBP and internal CRM.",
      ];
    case "gbp":
      return [
        "Restore missing zone or media in GBP dashboard.",
        "Publish a fresh GBP post to re-signal activity.",
        "Reply to any pending questions to boost engagement.",
      ];
    case "performance":
      return [
        "Preload the LCP hero image and defer non-critical JS.",
        "Reserve space for injected widgets to reduce CLS.",
        "Re-run Lighthouse from a UAE region to confirm fix.",
      ];
    case "reviews":
      return [
        "Reply publicly within 24h with a resolution offer.",
        "Route incident to operations for root-cause.",
        "Trigger review-request flow for satisfied recent jobs.",
      ];
    case "backlinks":
      return [
        "Add toxic domains to Google Disavow file.",
        "Audit referring pages for negative-SEO signals.",
        "Report abusive linking to the source directory.",
      ];
    case "technical":
      return [
        "Renew SSL / fix 404s / apply the recommended patch.",
        "Re-run crawl audit to confirm resolution.",
        "Add a monitor rule to catch regressions early.",
      ];
  }
}
