"use client";

/**
 * Alert Manager UI — a pixel-accurate replica of the reference screenshot
 * layout. Dark cyan-grid canvas + 4 metric cards + search + severity pills
 * + category chip row + alert card grid with per-card
 * edit / delete / acknowledge / resolve actions.
 */
import { useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Bell, Search, Filter, CheckCircle2, AlertTriangle, Clock, XCircle,
  MapPin, Globe, Building2, Activity, Star, Link2, Shield,
  BellOff, Plus, Pencil, Trash2, X,
} from "lucide-react";
import {
  ackAlert, resolveAlert, deleteAlert, editAlert, bulkAckAll, seedDemoAlerts, toggleAlertEnabled,
} from "@/app/actions/alerts";
import { deleteAlertRuleAction, toggleAlertRuleAction } from "@/app/actions/alert-rules";
import { AlertRuleForm } from "./AlertRuleForm";
import type { RuleKindDef } from "@/lib/alerts/rule-config";

export type AlertCategoryId =
  | "local-rank"
  | "citations"
  | "gbp"
  | "site-perf"
  | "reviews"
  | "backlinks"
  | "technical";

export type Severity = "info" | "warn" | "error" | "critical";
export type AlertStatus = "open" | "acknowledged" | "snoozed" | "resolved" | "dismissed";

export interface AlertCard {
  id: string;
  title: string;
  body: string | null;
  severity: Severity;
  status: AlertStatus;
  enabled: boolean;
  category: AlertCategoryId;
  categoryLabel: string;
  source: string;
  siteName: string | null;
  zone: string | null;
  chip: string | null;
  domain: string | null;
  ageLabel: string;
}

export interface AlertManagerHubProps {
  cards: AlertCard[];
  counters: {
    critical: number;
    active: number;
    acknowledged: number;
    resolvedLast24h: number;
    weeklyTotal: number;
  };
  rules: {
    /** Raw RuleKindDef list (fields + defaults) so the create form can render config knobs. */
    ruleKindDefs: RuleKindDef[];
    siteOptions: { id: string; name: string }[];
    userOptions: { id: string; email: string; name: string | null }[];
    currentRules: { id: string; name: string; kind: string; enabled: boolean }[];
  };
}

const CATEGORIES: {
  id: AlertCategoryId | "all";
  label: string;
  icon: React.ElementType;
}[] = [
  { id: "all",        label: "All categories",         icon: Bell },
  { id: "local-rank", label: "Local Rank",             icon: MapPin },
  { id: "citations",  label: "Citations / NAP",        icon: Globe },
  { id: "gbp",        label: "Google Business Profile", icon: Building2 },
  { id: "site-perf",  label: "Site Performance",       icon: Activity },
  { id: "reviews",    label: "Reviews",                icon: Star },
  { id: "backlinks",  label: "Backlinks",              icon: Link2 },
  { id: "technical",  label: "Technical / Security",   icon: Shield },
];

const CATEGORY_STYLE: Record<AlertCategoryId, { tint: string; icon: React.ElementType; ring: string; accent: string; text: string }> = {
  "local-rank": { tint: "bg-cyan-500/15",    icon: MapPin,     ring: "ring-cyan-500/30",    accent: "border-cyan-500/40 bg-cyan-500/10 text-cyan-300",       text: "text-cyan-300" },
  "citations":  { tint: "bg-orange-500/15",  icon: Globe,      ring: "ring-orange-500/30",  accent: "border-orange-500/40 bg-orange-500/10 text-orange-300", text: "text-orange-300" },
  "gbp":        { tint: "bg-fuchsia-500/15", icon: Building2,  ring: "ring-fuchsia-500/30", accent: "border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-300", text: "text-fuchsia-300" },
  "site-perf":  { tint: "bg-red-500/15",     icon: Activity,   ring: "ring-red-500/30",     accent: "border-red-500/40 bg-red-500/10 text-red-300",         text: "text-red-300" },
  "reviews":    { tint: "bg-amber-500/15",   icon: Star,       ring: "ring-amber-500/30",   accent: "border-amber-500/40 bg-amber-500/10 text-amber-300",   text: "text-amber-300" },
  "backlinks":  { tint: "bg-violet-500/15",  icon: Link2,      ring: "ring-violet-500/30",  accent: "border-violet-500/40 bg-violet-500/10 text-violet-300", text: "text-violet-300" },
  "technical":  { tint: "bg-emerald-500/15", icon: Shield,     ring: "ring-emerald-500/30", accent: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300", text: "text-emerald-300" },
};

const SEVERITY_STYLE: Record<Severity, { label: string; bg: string; text: string; dot: string; edgeGrad: string }> = {
  "critical": { label: "CRITICAL", bg: "bg-red-500/15",    text: "text-red-300",    dot: "bg-red-400",    edgeGrad: "from-red-500/70 via-red-500/20 to-transparent" },
  "error":    { label: "HIGH",     bg: "bg-orange-500/15", text: "text-orange-300", dot: "bg-orange-400", edgeGrad: "from-orange-500/70 via-orange-500/20 to-transparent" },
  "warn":     { label: "MEDIUM",   bg: "bg-amber-500/15",  text: "text-amber-300",  dot: "bg-amber-400",  edgeGrad: "from-amber-500/70 via-amber-500/20 to-transparent" },
  "info":     { label: "LOW",      bg: "bg-slate-500/15",  text: "text-slate-300",  dot: "bg-slate-400",  edgeGrad: "from-slate-500/70 via-slate-500/20 to-transparent" },
};

const STATUS_STYLE: Record<AlertStatus, { label: string; icon: React.ElementType; className: string }> = {
  "open":         { label: "Active",       icon: Bell,           className: "bg-red-500/15 text-red-300 border-red-500/30" },
  "acknowledged": { label: "Acknowledged", icon: BellOff,        className: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  "snoozed":      { label: "Snoozed",      icon: Clock,          className: "bg-slate-500/15 text-slate-300 border-slate-500/30" },
  "resolved":     { label: "Resolved",     icon: CheckCircle2,   className: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  "dismissed":    { label: "Dismissed",    icon: XCircle,        className: "bg-slate-500/15 text-slate-500 border-slate-500/30" },
};

const SEVERITY_FILTERS: { id: "all" | Severity; label: string }[] = [
  { id: "all",      label: "All" },
  { id: "critical", label: "Critical" },
  { id: "error",    label: "High" },
  { id: "warn",     label: "Medium" },
  { id: "info",     label: "Low" },
];

/* ─────────── main ─────────── */

export function AlertManagerHub({ cards, counters, rules }: AlertManagerHubProps) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [severity, setSeverity] = useState<"all" | Severity>("all");
  const [category, setCategory] = useState<"all" | AlertCategoryId>("all");
  const [query, setQuery] = useState("");
  const [showRules, setShowRules] = useState(false);
  const [editing, setEditing] = useState<AlertCard | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AlertCard | null>(null);

  const filtered = useMemo(() => {
    return cards.filter((c) => {
      if (severity !== "all" && c.severity !== severity) return false;
      if (category !== "all" && c.category !== category) return false;
      if (query) {
        const hay = `${c.title} ${c.body ?? ""} ${c.source} ${c.zone ?? ""} ${c.categoryLabel}`.toLowerCase();
        if (!hay.includes(query.toLowerCase())) return false;
      }
      return true;
    });
  }, [cards, severity, category, query]);

  const categoryCounts = useMemo(() => {
    const map: Record<AlertCategoryId, number> = {
      "local-rank": 0, "citations": 0, "gbp": 0, "site-perf": 0, "reviews": 0, "backlinks": 0, "technical": 0,
    };
    for (const c of cards) if (c.status === "open" || c.status === "acknowledged") map[c.category] += 1;
    return map;
  }, [cards]);

  function refresh() { router.refresh(); }

  function onAck(id: string) {
    start(async () => { await ackAlert(id); refresh(); });
  }
  function onResolve(id: string) {
    start(async () => { await resolveAlert(id); refresh(); });
  }
  function onDelete(id: string) {
    start(async () => { await deleteAlert(id); refresh(); });
  }
  function onToggleEnabled(id: string, next: boolean) {
    start(async () => { await toggleAlertEnabled(id, next); refresh(); });
  }
  function onAckAll() {
    start(async () => { await bulkAckAll(); refresh(); });
  }
  function onSeedDemo() {
    start(async () => { await seedDemoAlerts(); refresh(); });
  }
  async function onEditSave(patch: { title: string; body: string }) {
    if (!editing) return;
    start(async () => {
      await editAlert(editing.id, { title: patch.title, body: patch.body });
      setEditing(null);
      refresh();
    });
  }

  return (
    <div className="relative min-h-screen bg-[#05070d] text-slate-200 overflow-hidden -mx-5 sm:-mx-7 md:-mx-10 -my-4 sm:-my-5 md:-my-6">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "linear-gradient(rgba(56,189,248,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,0.06) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
      <div className="pointer-events-none absolute -top-40 -left-32 h-[520px] w-[520px] rounded-full bg-cyan-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-32 h-[520px] w-[520px] rounded-full bg-red-500/10 blur-3xl" />

      <div className="relative z-10 w-full px-4 py-8 space-y-6 sm:px-6">
        {/* Header */}
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-[0.28em] text-cyan-300/80">Dubai · Cleaning Services</div>
            <h1 className="mt-2 text-4xl font-light text-white">Alert Manager</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-400">
              Real-time SEO alerts across local rankings, citations, GBP, reviews and site health.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={pending || counters.active === 0}
              onClick={onAckAll}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-50"
            >
              <BellOff className="h-3.5 w-3.5" /> Acknowledge all
            </button>
            <button
              type="button"
              onClick={() => setShowRules(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-cyan-400/40 bg-cyan-500/20 px-3 py-1.5 text-xs font-semibold text-cyan-100 shadow-[0_0_16px_rgba(34,211,238,0.25)] hover:bg-cyan-500/30"
            >
              <Plus className="h-3.5 w-3.5" /> Alert rules
            </button>
          </div>
        </header>

        {/* KPI cards */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="Critical"
            value={counters.critical}
            sub="Requires action"
            tone="red"
            icon={<AlertTriangle className="h-5 w-5" />}
          />
          <KpiCard
            label="Active"
            value={counters.active}
            sub={`${counters.weeklyTotal} total this week`}
            tone="orange"
            icon={<Bell className="h-5 w-5" />}
          />
          <KpiCard
            label="Acknowledged"
            value={counters.acknowledged}
            sub="Owner assigned"
            tone="amber"
            icon={<Clock className="h-5 w-5" />}
          />
          <KpiCard
            label="Resolved"
            value={counters.resolvedLast24h}
            sub="Last 24 hours"
            tone="emerald"
            icon={<CheckCircle2 className="h-5 w-5" />}
          />
        </div>

        {/* Search + severity pills */}
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/40 px-3 py-2.5">
          <div className="relative min-w-[240px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search alerts, keywords, zones..."
              className="w-full rounded-md border border-slate-800 bg-slate-950/60 py-1.5 pl-8 pr-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400/50 focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-1 rounded-md border border-slate-800 bg-slate-950/50 p-0.5">
            {SEVERITY_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setSeverity(f.id)}
                className={`rounded px-2.5 py-1 text-xs transition ${
                  severity === f.id ? "bg-cyan-400/15 text-cyan-200" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 text-[11px] text-slate-500">
            <Filter className="h-3.5 w-3.5" /> {filtered.length} of {cards.length}
          </div>
        </div>

        {/* Category chip row */}
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => {
            const Icon = c.icon;
            const active = category === c.id;
            const count = c.id === "all"
              ? cards.filter((x) => x.status === "open" || x.status === "acknowledged").length
              : categoryCounts[c.id as AlertCategoryId];
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategory(c.id)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition ${
                  active
                    ? "border-cyan-400/50 bg-cyan-400/10 text-cyan-200"
                    : "border-slate-800 bg-slate-900/40 text-slate-300 hover:border-slate-700"
                }`}
              >
                <Icon className="h-3.5 w-3.5" /> {c.label}
                <span className="ml-1 rounded bg-slate-800/70 px-1.5 py-0.5 font-mono text-[10px]">{count}</span>
              </button>
            );
          })}
        </div>

        {/* Alert card grid */}
        {filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/30 p-10 text-center text-sm text-slate-400">
            {cards.length === 0 ? (
              <>
                <div className="text-slate-300">No alerts yet.</div>
                <div className="mt-1 text-xs text-slate-500">
                  The check-engine cron runs every 15 minutes. To preview what a populated inbox looks like, seed the reference demo set:
                </div>
                <button
                  type="button"
                  onClick={onSeedDemo}
                  disabled={pending}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-cyan-400/40 bg-cyan-500/20 px-3 py-1.5 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/30 disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5" /> Seed demo alerts
                </button>
              </>
            ) : (
              "No alerts match these filters."
            )}
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((c) => (
              <li key={c.id}>
                <AlertCardTile
                  card={c}
                  disabled={pending}
                  onAck={() => onAck(c.id)}
                  onResolve={() => onResolve(c.id)}
                  onEdit={() => setEditing(c)}
                  onDelete={() => setConfirmDelete(c)}
                  onToggleEnabled={(next) => onToggleEnabled(c.id, next)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {editing ? (
        <EditAlertModal
          card={editing}
          onClose={() => setEditing(null)}
          onSave={onEditSave}
          pending={pending}
        />
      ) : null}
      {confirmDelete ? (
        <DeleteConfirm
          card={confirmDelete}
          onClose={() => setConfirmDelete(null)}
          onConfirm={() => {
            onDelete(confirmDelete.id);
            setConfirmDelete(null);
          }}
          pending={pending}
        />
      ) : null}
      {showRules ? <RulesModal rules={rules} onClose={() => setShowRules(false)} /> : null}
    </div>
  );
}

/* ─────────── AlertCardTile ─────────── */

function AlertCardTile({
  card,
  disabled,
  onAck,
  onResolve,
  onEdit,
  onDelete,
  onToggleEnabled,
}: {
  card: AlertCard;
  disabled: boolean;
  onAck: () => void;
  onResolve: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggleEnabled: (next: boolean) => void;
}) {
  const catStyle = CATEGORY_STYLE[card.category];
  const CatIcon = catStyle.icon;
  const sevStyle = SEVERITY_STYLE[card.severity];
  const statusStyle = STATUS_STYLE[card.status];
  const StatusIcon = statusStyle.icon;
  const muted = !card.enabled;

  return (
    <article
      className={`group relative overflow-hidden rounded-xl border transition ${
        muted
          ? "border-slate-800 bg-slate-900/20 opacity-60 hover:opacity-80"
          : "border-slate-800 bg-slate-900/40 hover:border-cyan-500/40 hover:bg-slate-900/70"
      }`}
    >
      {/* Left edge gradient stripe */}
      <span aria-hidden className={`absolute inset-y-0 left-0 w-[3px] bg-gradient-to-b ${sevStyle.edgeGrad}`} />

      <div className="p-5">
        {/* Header row */}
        <div className="flex items-start gap-3">
          <div className={`relative grid h-10 w-10 shrink-0 place-items-center rounded-lg ${catStyle.tint} ${catStyle.text}`}>
            <CatIcon className="h-4.5 w-4.5" strokeWidth={2} />
            <span className={`absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-slate-900 ${sevStyle.dot}`} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={`inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wider ${sevStyle.bg} ${sevStyle.text}`}>
                {sevStyle.label}
              </span>
              <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium border ${statusStyle.className}`}>
                <StatusIcon className="h-3 w-3" />
                {statusStyle.label}
              </span>
            </div>
            <h3 className="mt-1.5 text-sm font-semibold leading-snug text-white">{card.title}</h3>
            {card.body ? (
              <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-slate-400">{card.body}</p>
            ) : null}
          </div>
          <ToggleSwitch
            enabled={card.enabled}
            disabled={disabled}
            onChange={onToggleEnabled}
            ariaLabel={card.enabled ? "Disable this alert" : "Enable this alert"}
          />
        </div>

        {/* Meta chip row */}
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
          <span className={`inline-flex items-center gap-1 ${catStyle.text}`}>
            <CatIcon className="h-3 w-3" /> {card.categoryLabel}
          </span>
          {card.zone ? (
            <span className="inline-flex items-center gap-1 text-slate-400">
              <MapPin className="h-3 w-3" /> {card.zone}
            </span>
          ) : card.siteName ? (
            <span className="inline-flex items-center gap-1 text-slate-400">
              <MapPin className="h-3 w-3" /> {card.siteName}
            </span>
          ) : null}
          {card.domain ? (
            <span className="inline-flex items-center gap-1 rounded bg-slate-800/70 px-1.5 py-0.5 font-mono text-[10px] text-slate-300">
              {card.domain}
            </span>
          ) : null}
          {card.chip ? (
            <span className="inline-flex items-center rounded bg-slate-800/70 px-1.5 py-0.5 font-mono text-[10px] text-slate-200">
              {card.chip}
            </span>
          ) : null}
          <span className="ml-auto inline-flex items-center gap-1 text-slate-500">
            <Clock className="h-3 w-3" /> {card.ageLabel}
          </span>
        </div>

        {/* Footer action row */}
        <div className="mt-4 flex items-center justify-between border-t border-slate-800/70 pt-3">
          <div className="text-[11px] uppercase tracking-wider text-slate-500">{card.source}</div>
          <div className="flex items-center gap-1.5">
            <IconAction title="Edit" onClick={onEdit} disabled={disabled}><Pencil className="h-3.5 w-3.5" /></IconAction>
            <IconAction title="Delete" onClick={onDelete} disabled={disabled} danger><Trash2 className="h-3.5 w-3.5" /></IconAction>
            {card.status !== "acknowledged" && card.status !== "resolved" ? (
              <button
                type="button"
                onClick={onAck}
                disabled={disabled}
                className="rounded-md border border-slate-700 bg-slate-900/60 px-2.5 py-1 text-xs font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-50"
              >
                Acknowledge
              </button>
            ) : null}
            {card.status !== "resolved" ? (
              <button
                type="button"
                onClick={onResolve}
                disabled={disabled}
                className="rounded-md border border-emerald-500/40 bg-emerald-500/20 px-2.5 py-1 text-xs font-medium text-emerald-100 hover:bg-emerald-500/30 disabled:opacity-50"
              >
                Resolve
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}

function ToggleSwitch({
  enabled,
  disabled,
  onChange,
  ariaLabel,
}: {
  enabled: boolean;
  disabled: boolean;
  onChange: (next: boolean) => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={ariaLabel}
      title={enabled ? "Alert enabled — click to mute" : "Alert muted — click to enable"}
      disabled={disabled}
      onClick={() => onChange(!enabled)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition disabled:cursor-not-allowed disabled:opacity-50 ${
        enabled
          ? "border-cyan-400/50 bg-cyan-500/40 shadow-[0_0_10px_rgba(34,211,238,0.35)]"
          : "border-slate-700 bg-slate-800"
      }`}
    >
      <span
        aria-hidden
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition ${
          enabled ? "translate-x-4" : "translate-x-1"
        }`}
      />
    </button>
  );
}

function IconAction({ children, title, onClick, disabled, danger }: { children: ReactNode; title: string; onClick: () => void; disabled: boolean; danger?: boolean }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md border p-1.5 transition disabled:opacity-50 ${
        danger
          ? "border-rose-500/30 bg-rose-500/5 text-rose-300 hover:bg-rose-500/15 hover:text-rose-200"
          : "border-slate-700 bg-slate-900/60 text-slate-300 hover:bg-slate-800 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

/* ─────────── KpiCard ─────────── */

function KpiCard({ label, value, sub, tone, icon }: { label: string; value: number; sub: string; tone: "red" | "orange" | "amber" | "emerald"; icon: ReactNode }) {
  const style: Record<typeof tone, { bg: string; text: string; iconBg: string }> = {
    red:     { bg: "border-red-500/30 bg-red-500/[0.06]",         text: "text-red-300",     iconBg: "bg-red-500/15 text-red-300" },
    orange:  { bg: "border-orange-500/30 bg-orange-500/[0.06]",   text: "text-orange-300",  iconBg: "bg-orange-500/15 text-orange-300" },
    amber:   { bg: "border-amber-500/30 bg-amber-500/[0.06]",     text: "text-amber-300",   iconBg: "bg-amber-500/15 text-amber-300" },
    emerald: { bg: "border-emerald-500/30 bg-emerald-500/[0.06]", text: "text-emerald-300", iconBg: "bg-emerald-500/15 text-emerald-300" },
  };
  const s = style[tone];
  return (
    <div className={`relative overflow-hidden rounded-2xl border ${s.bg} p-5`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className={`text-[10px] uppercase tracking-widest font-semibold ${s.text}`}>{label}</div>
          <div className="mt-2 text-4xl font-light tabular-nums text-white">{value}</div>
          <div className="mt-2 text-xs text-slate-400">{sub}</div>
        </div>
        <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${s.iconBg}`}>{icon}</div>
      </div>
    </div>
  );
}

/* ─────────── Modals ─────────── */

function Modal({ title, children, onClose, wide }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" onClick={onClose}>
      <div className={`w-full ${wide ? "max-w-2xl" : "max-w-lg"} rounded-xl border border-slate-800 bg-slate-950 p-5 shadow-2xl`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

function EditAlertModal({ card, onClose, onSave, pending }: { card: AlertCard; onClose: () => void; onSave: (patch: { title: string; body: string }) => void; pending: boolean }) {
  const [title, setTitle] = useState(card.title);
  const [body, setBody]   = useState(card.body ?? "");
  return (
    <Modal title="Edit alert" onClose={onClose}>
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-[10px] uppercase tracking-wider text-slate-400">Title</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 focus:border-cyan-400/50 focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] uppercase tracking-wider text-slate-400">Details</span>
          <textarea
            rows={5}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="w-full resize-y rounded-md border border-slate-800 bg-slate-900/60 p-3 font-mono text-[12px] leading-relaxed text-slate-100 focus:border-cyan-400/50 focus:outline-none"
          />
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={pending || !title.trim()}
            onClick={() => onSave({ title, body })}
            className="inline-flex items-center gap-1.5 rounded-md border border-cyan-400/40 bg-cyan-500/20 px-3 py-1.5 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/30 disabled:opacity-50"
          >
            <Pencil className="h-3.5 w-3.5" /> Save changes
          </button>
        </div>
      </div>
    </Modal>
  );
}

function DeleteConfirm({ card, onClose, onConfirm, pending }: { card: AlertCard; onClose: () => void; onConfirm: () => void; pending: boolean }) {
  return (
    <Modal title="Delete alert?" onClose={onClose}>
      <p className="text-sm text-slate-400">
        Permanently delete <span className="font-medium text-slate-200">{card.title}</span>? This removes it from the alerts feed entirely — use Resolve instead if you want to keep the audit trail.
      </p>
      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={onConfirm}
          className="inline-flex items-center gap-1.5 rounded-md border border-rose-500/40 bg-rose-500/15 px-3 py-1.5 text-xs font-medium text-rose-200 hover:bg-rose-500/25 disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" /> Delete
        </button>
      </div>
    </Modal>
  );
}

function RulesModal({ rules, onClose }: { rules: AlertManagerHubProps["rules"]; onClose: () => void }) {
  const [mode, setMode] = useState<"list" | "create">("list");
  return (
    <Modal
      title={mode === "create" ? "New alert rule" : `Alert rules (${rules.currentRules.length})`}
      onClose={onClose}
      wide
    >
      {mode === "list" ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-slate-400">
              Rules pipe check-engine hits into notifications. Without a rule, checks still run every 15 min but nothing routes to a person.
            </p>
            <button
              type="button"
              onClick={() => setMode("create")}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-cyan-400/40 bg-cyan-500/20 px-3 py-1.5 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/30"
            >
              <Plus className="h-3.5 w-3.5" /> New rule
            </button>
          </div>

          {rules.currentRules.length === 0 ? (
            <div className="rounded-md border border-slate-800 bg-slate-900/50 p-6 text-center text-xs text-slate-400">
              No rules yet. Click <strong className="text-slate-200">New rule</strong> to create one — pick a check kind and route it to email or in-app.
            </div>
          ) : (
            <ul className="max-h-[420px] space-y-1.5 overflow-y-auto pr-1">
              {rules.currentRules.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 rounded-md border border-slate-800 bg-slate-900/40 px-3 py-2 text-xs">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-slate-200">{r.name}</div>
                    <div className="mt-0.5 font-mono text-[10px] text-slate-500">{r.kind}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] ${r.enabled ? "bg-emerald-500/15 text-emerald-300" : "bg-slate-800 text-slate-400"}`}>
                      {r.enabled ? "enabled" : "disabled"}
                    </span>
                    <form action={toggleAlertRuleAction}>
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="enabled" value={r.enabled ? "false" : "true"} />
                      <button
                        type="submit"
                        className="rounded-md border border-slate-700 bg-slate-900/60 px-2 py-1 text-[10px] text-slate-300 hover:bg-slate-800"
                        title={r.enabled ? "Pause" : "Resume"}
                      >
                        {r.enabled ? "Pause" : "Resume"}
                      </button>
                    </form>
                    <form action={deleteAlertRuleAction} onSubmit={(e) => { if (!confirm(`Delete rule "${r.name}"?`)) e.preventDefault(); }}>
                      <input type="hidden" name="id" value={r.id} />
                      <button
                        type="submit"
                        className="rounded-md border border-rose-500/30 bg-rose-500/5 p-1.5 text-rose-300 hover:bg-rose-500/15"
                        title="Delete"
                        aria-label={`Delete rule ${r.name}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setMode("list")}
            className="text-xs text-slate-400 hover:text-slate-200"
          >
            ← Back to rules list
          </button>
          <AlertRuleForm
            kinds={rules.ruleKindDefs}
            sites={rules.siteOptions}
            users={rules.userOptions}
            onDone={() => setMode("list")}
          />
        </div>
      )}
    </Modal>
  );
}
