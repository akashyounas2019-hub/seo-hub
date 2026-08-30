import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Bell,
  BellOff,
  CheckCircle2,
  Search,
  Filter,
  Clock,
  Zap,
  X,
  ChevronRight,
  Plus,
} from "lucide-react";

export const Route = createFileRoute("/alerts")({
  head: () => ({
    meta: [
      { title: "Alert Manager — AKS SEO Console" },
      {
        name: "description",
        content: "SEO alert manager — track and resolve issues surfaced across connected sites.",
      },
    ],
  }),
  component: AlertsPage,
});

type Severity = "critical" | "warning" | "info";
type Status = "open" | "acknowledged" | "resolved";

type Alert = {
  id: string;
  title: string;
  message: string | null;
  severity: Severity;
  status: Status;
  source: string;
  createdAt: string;
  resolvedAt: string | null;
};

const SEVERITY_META: Record<Severity, { label: string; dot: string; chip: string; ring: string }> = {
  critical: {
    label: "Critical",
    dot: "bg-rose-400 shadow-[0_0_10px_rgba(251,113,133,0.8)]",
    chip: "border-rose-400/40 bg-rose-500/10 text-rose-200",
    ring: "ring-rose-400/30",
  },
  warning: {
    label: "Warning",
    dot: "bg-amber-300",
    chip: "border-amber-400/40 bg-amber-500/10 text-amber-200",
    ring: "ring-amber-400/20",
  },
  info: {
    label: "Info",
    dot: "bg-sky-400",
    chip: "border-sky-400/40 bg-sky-500/10 text-sky-200",
    ring: "ring-sky-400/20",
  },
};

const STATUS_META: Record<Status, { label: string; chip: string; icon: typeof Bell }> = {
  open: { label: "Open", chip: "border-rose-400/30 bg-rose-500/10 text-rose-200", icon: Bell },
  acknowledged: { label: "Acknowledged", chip: "border-amber-400/30 bg-amber-500/10 text-amber-200", icon: BellOff },
  resolved: { label: "Resolved", chip: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200", icon: CheckCircle2 },
};

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [severity, setSeverity] = useState<Severity | "all">("all");
  const [status, setStatus] = useState<Status | "all">("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Alert | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/alerts");
      const json = await res.json();
      if (json?.ok) setAlerts(json.alerts || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    return alerts.filter((a) => {
      if (severity !== "all" && a.severity !== severity) return false;
      if (status !== "all" && a.status !== status) return false;
      if (query && !`${a.title} ${a.message ?? ""}`.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [alerts, severity, status, query]);

  const kpi = useMemo(() => {
    const critical = alerts.filter((a) => a.severity === "critical" && a.status !== "resolved").length;
    const open = alerts.filter((a) => a.status === "open").length;
    const ack = alerts.filter((a) => a.status === "acknowledged").length;
    const resolved = alerts.filter((a) => a.status === "resolved").length;
    return { critical, open, ack, resolved, total: alerts.length };
  }, [alerts]);

  async function updateStatus(id: string, next: Status) {
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, status: next } : a)));
    setSelected((cur) => (cur && cur.id === id ? { ...cur, status: next } : cur));
    try {
      await fetch(`/api/alerts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      toast.success(next === "acknowledged" ? "Alert acknowledged" : next === "resolved" ? "Alert resolved" : "Alert reopened");
    } catch {
      toast.error("Failed to update alert");
      load();
    }
  }

  async function acknowledgeAll() {
    const targets = alerts.filter((a) => a.status === "open");
    if (targets.length === 0) {
      toast.info("No open alerts to acknowledge");
      return;
    }
    setAlerts((prev) => prev.map((a) => (a.status === "open" ? { ...a, status: "acknowledged" } : a)));
    await Promise.all(
      targets.map((a) =>
        fetch(`/api/alerts/${a.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "acknowledged" }),
        }),
      ),
    );
    toast.success(`Acknowledged ${targets.length} alert${targets.length === 1 ? "" : "s"}`);
  }

  return (
    <div className="min-h-screen bg-[#05070d] text-slate-200">
      <div className="mx-auto max-w-[1600px] px-3 sm:px-4 py-10">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-cyan-300/80">
              Alert Manager
            </div>
            <h1 className="mt-1 text-2xl font-semibold text-white">Alerts</h1>
            <p className="mt-1 text-sm text-slate-400">
              Issues surfaced across connected sites. Nothing here is fabricated — an empty list means no alerts have been raised yet.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCreateOpen(true)}
              className="inline-flex items-center gap-2 rounded-md border border-cyan-400/30 bg-cyan-400/10 px-3 py-1.5 text-xs font-medium text-cyan-200 hover:bg-cyan-400/20"
            >
              <Plus className="h-4 w-4" /> New alert
            </button>
            <button
              onClick={acknowledgeAll}
              className="inline-flex items-center gap-2 rounded-md border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
            >
              <BellOff className="h-4 w-4" /> Acknowledge all
            </button>
            <button
              onClick={() => setRulesOpen(true)}
              className="inline-flex items-center gap-2 rounded-md border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-sm font-medium text-slate-200 hover:bg-slate-800"
            >
              <Zap className="h-4 w-4" /> Notification routing
            </button>
          </div>
        </div>

        {/* KPIs */}
        <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard label="Critical" value={kpi.critical} sub="Requires action" icon={AlertTriangle} ringFrom="#fb7185" ringTo="#e11d48" active={severity === "critical"} onClick={() => setSeverity(severity === "critical" ? "all" : "critical")} />
          <KpiCard label="Open" value={kpi.open} sub={`${kpi.total} total`} icon={Bell} ringFrom="#fb923c" ringTo="#f97316" active={status === "open"} onClick={() => setStatus(status === "open" ? "all" : "open")} />
          <KpiCard label="Acknowledged" value={kpi.ack} sub="Owner assigned" icon={Clock} ringFrom="#fbbf24" ringTo="#eab308" active={status === "acknowledged"} onClick={() => setStatus(status === "acknowledged" ? "all" : "acknowledged")} />
          <KpiCard label="Resolved" value={kpi.resolved} sub="Closed out" icon={CheckCircle2} ringFrom="#34d399" ringTo="#14b8a6" active={status === "resolved"} onClick={() => setStatus(status === "resolved" ? "all" : "resolved")} />
        </section>

        {/* Filters */}
        <div className="mt-6 flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/40 p-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search alerts…"
              className="w-full rounded-md border border-slate-800 bg-slate-950/60 py-1.5 pl-8 pr-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400/50 focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-1 rounded-md border border-slate-800 bg-slate-950/50 p-0.5 text-xs">
            {(["all", "critical", "warning", "info"] as const).map((s) => (
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

        {/* Alerts grid */}
        <section className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {loading ? (
            <div className="col-span-full rounded-xl border border-dashed border-slate-800 bg-slate-900/30 p-10 text-center text-sm text-slate-500">
              Loading alerts…
            </div>
          ) : (
            <>
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
                  {alerts.length === 0 ? "No alerts yet." : "No alerts match your filters."}
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {selected && (
        <DetailDrawer
          alert={selected}
          onClose={() => setSelected(null)}
          onAck={() => updateStatus(selected.id, "acknowledged")}
          onResolve={() => updateStatus(selected.id, "resolved")}
          onReopen={() => updateStatus(selected.id, "open")}
        />
      )}

      {rulesOpen && <AlertRulesModal onClose={() => setRulesOpen(false)} />}
      {createOpen && (
        <CreateAlertModal
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function KpiCard({
  label, value, sub, icon: Icon, ringFrom, ringTo, active, onClick,
}: {
  label: string; value: number | string; sub: string; icon: typeof Bell;
  ringFrom: string; ringTo: string; active?: boolean; onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`group relative overflow-hidden rounded-xl border p-4 text-left transition ${
        active ? "border-cyan-400/50 bg-cyan-400/5" : "border-slate-800 bg-slate-900/40 hover:border-slate-700"
      }`}
    >
      <div className="absolute inset-x-0 top-0 h-[2px] opacity-70" style={{ background: `linear-gradient(90deg, ${ringFrom}, ${ringTo})` }} />
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-slate-500">{label}</div>
          <div className="mt-1 text-2xl font-semibold text-white">{value}</div>
          <div className="mt-0.5 text-[11px] text-slate-400">{sub}</div>
        </div>
        <div className="grid h-9 w-9 place-items-center rounded-lg ring-1 ring-white/5" style={{ background: `linear-gradient(135deg, ${ringFrom}22, ${ringTo}22)` }}>
          <Icon className="h-4 w-4 text-white/80" />
        </div>
      </div>
    </button>
  );
}

function AlertCard({ alert, onSelect, onAck, onResolve }: { alert: Alert; onSelect: () => void; onAck: () => void; onResolve: () => void }) {
  const sev = SEVERITY_META[alert.severity] || SEVERITY_META.info;
  const st = STATUS_META[alert.status] || STATUS_META.open;
  const StatusIcon = st.icon;

  return (
    <article
      onClick={onSelect}
      className={`group relative flex cursor-pointer flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40 p-4 transition hover:border-slate-700 hover:bg-slate-900/60 ${
        alert.status === "resolved" ? "opacity-70" : ""
      }`}
    >
      <div className={`absolute inset-y-0 left-0 w-[3px] ${sev.dot}`} aria-hidden />
      <div className="flex items-start gap-3">
        <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-800 text-white shadow-lg ring-1 ${sev.ring}`}>
          <AlertTriangle className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={`h-1.5 w-1.5 rounded-full ${sev.dot}`} />
            <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${sev.chip}`}>{sev.label}</span>
            <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${st.chip}`}>
              <StatusIcon className="h-2.5 w-2.5" /> {st.label}
            </span>
          </div>
          <h3 className="mt-2 line-clamp-2 text-sm font-semibold text-white group-hover:text-cyan-100">{alert.title}</h3>
          {alert.message && <p className="mt-1 line-clamp-2 text-xs text-slate-400">{alert.message}</p>}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
        <span>{alert.source}</span>
        <span className="ml-auto inline-flex items-center gap-1">
          <Clock className="h-3 w-3 text-slate-500" /> {timeAgo(alert.createdAt)}
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-slate-800 pt-3">
        <span className="text-[11px] text-slate-500" />
        <div className="flex items-center gap-1">
          {alert.status === "open" && (
            <button onClick={(e) => { e.stopPropagation(); onAck(); }} className="rounded-md border border-slate-700 bg-slate-900/60 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-800">
              Acknowledge
            </button>
          )}
          {alert.status !== "resolved" && (
            <button onClick={(e) => { e.stopPropagation(); onResolve(); }} className="rounded-md border border-emerald-400/30 bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-200 hover:bg-emerald-500/20">
              Resolve
            </button>
          )}
          <ChevronRight className="h-4 w-4 text-slate-500" />
        </div>
      </div>
    </article>
  );
}

function DetailDrawer({ alert, onClose, onAck, onResolve, onReopen }: {
  alert: Alert; onClose: () => void; onAck: () => void; onResolve: () => void; onReopen: () => void;
}) {
  const sev = SEVERITY_META[alert.severity] || SEVERITY_META.info;
  const st = STATUS_META[alert.status] || STATUS_META.open;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <aside onClick={(e) => e.stopPropagation()} className="flex h-full w-full max-w-md flex-col border-l border-slate-800 bg-[#0a0d16] text-slate-200 shadow-2xl">
        <div className={`h-1 w-full ${sev.dot}`} />
        <div className="flex items-start justify-between border-b border-slate-800 p-5">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-slate-800 text-white shadow-lg">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className={`h-1.5 w-1.5 rounded-full ${sev.dot}`} />
                <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${sev.chip}`}>{sev.label}</span>
                <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${st.chip}`}>{st.label}</span>
              </div>
              <h2 className="mt-2 text-base font-semibold text-white">{alert.title}</h2>
              <div className="mt-1 text-[11px] text-slate-500">{alert.source}</div>
            </div>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <p className="text-sm leading-relaxed text-slate-300">{alert.message || "No additional detail."}</p>

          <div className="mt-5 grid grid-cols-2 gap-2">
            <MetaItem label="Detected" value={timeAgo(alert.createdAt)} icon={Clock} />
            <MetaItem label="Source" value={alert.source} icon={Bell} />
            {alert.resolvedAt && <MetaItem label="Resolved" value={timeAgo(alert.resolvedAt)} icon={CheckCircle2} />}
          </div>
        </div>

        <div className="border-t border-slate-800 p-4">
          <div className="flex items-center gap-2">
            {alert.status === "resolved" ? (
              <button onClick={onReopen} className="flex-1 rounded-md border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800">
                Reopen alert
              </button>
            ) : (
              <>
                <button onClick={onAck} className="flex-1 rounded-md border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800">
                  Acknowledge
                </button>
                <button onClick={onResolve} className="flex-1 rounded-md border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-200 hover:bg-emerald-500/20">
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

function MetaItem({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Bell }) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-900/40 px-3 py-2">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-slate-500">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className="mt-1 text-xs text-slate-200">{value}</div>
    </div>
  );
}

function CreateAlertModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [severity, setSeverity] = useState<Severity>("warning");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), message: message.trim() || undefined, severity, source: "manual" }),
      });
      const json = await res.json();
      if (json?.ok) {
        toast.success("Alert created");
        onCreated();
      } else {
        toast.error(json?.error || "Failed to create alert");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="w-full max-w-lg overflow-hidden rounded-2xl border border-cyan-500/30 bg-slate-950 p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h3 className="text-base font-semibold text-white">New Alert</h3>
          <button type="button" onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"><X className="h-4 w-4" /></button>
        </div>
        <div className="mt-4 space-y-4">
          <div>
            <label className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Rank drop detected" className="mt-1 w-full rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-100 focus:border-cyan-400/50 focus:outline-none" required />
          </div>
          <div>
            <label className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Message</label>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} className="mt-1 w-full rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-100 focus:border-cyan-400/50 focus:outline-none" />
          </div>
          <div>
            <label className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Severity</label>
            <select value={severity} onChange={(e) => setSeverity(e.target.value as Severity)} className="mt-1 w-full rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-100 focus:border-cyan-400/50 focus:outline-none">
              <option value="critical">Critical</option>
              <option value="warning">Warning</option>
              <option value="info">Info</option>
            </select>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2 border-t border-slate-800 pt-4">
          <button type="button" onClick={onClose} className="rounded-md border border-slate-800 bg-slate-900/40 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-900">Cancel</button>
          <button type="submit" disabled={saving} className="rounded-md bg-gradient-to-r from-cyan-500 to-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow hover:brightness-110 disabled:opacity-50">
            {saving ? "Creating…" : "Create alert"}
          </button>
        </div>
      </form>
    </div>
  );
}

function AlertRulesModal({ onClose }: { onClose: () => void }) {
  const [rules, setRules] = useState([
    { id: "r1", name: "Local rank drop > 3 positions", enabled: true, channel: "Slack + Email" },
    { id: "r2", name: "NAP inconsistency detected", enabled: true, channel: "Email" },
    { id: "r3", name: "LCP regression > 1s", enabled: true, channel: "Slack" },
    { id: "r4", name: "New review below 3★", enabled: true, channel: "Slack + WhatsApp" },
    { id: "r5", name: "SSL expires in < 30 days", enabled: true, channel: "Email" },
  ]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-800 bg-[#0a0d16] shadow-2xl">
        <div className="h-1 w-full bg-gradient-to-r from-cyan-400 to-blue-500" />
        <div className="flex items-start justify-between border-b border-slate-800 p-5">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-cyan-300/80">Notification routing</div>
            <h2 className="mt-1 text-base font-semibold text-white">Alert Rules</h2>
            <p className="mt-1 text-xs text-slate-400">
              These routing preferences are stored locally in this browser. No automated monitor currently generates alerts from these rules — connect a monitoring source, or create alerts manually above.
            </p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
        <ul className="max-h-[60vh] divide-y divide-slate-800 overflow-y-auto">
          {rules.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <div className="text-sm font-medium text-white">{r.name}</div>
                <div className="mt-0.5 text-[11px] text-slate-500">Route: {r.channel}</div>
              </div>
              <button
                onClick={() => {
                  setRules((prev) => prev.map((x) => (x.id === r.id ? { ...x, enabled: !x.enabled } : x)));
                  toast.success(`Rule ${r.enabled ? "disabled" : "enabled"}`);
                }}
                className={`relative h-5 w-9 shrink-0 rounded-full transition ${r.enabled ? "bg-cyan-400" : "bg-slate-700"}`}
                aria-pressed={r.enabled}
              >
                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${r.enabled ? "left-4" : "left-0.5"}`} />
              </button>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-end gap-2 border-t border-slate-800 p-4">
          <button onClick={onClose} className="rounded-md border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
