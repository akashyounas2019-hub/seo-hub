"use client";

/**
 * AutomationHub — dark cyan-grid canvas with ring KPI cards, category chips,
 * filter row, flow cards, and modals. Reuses the visual system already used
 * on /admin/agent/jobs (AgentHierarchyHero) and /admin/tasks (CommandCenterHero).
 */
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import {
  Zap, Play, Pause, Plus, Search, MapPin, Star, Link2, FileText,
  Gauge, Bot, Building2, Bell, Filter, Sparkles, TrendingUp, Pencil, Trash2, X, ArrowLeft,
} from "lucide-react";

export type FlowStatus = "running" | "paused";

export interface FlowRow {
  id: string;
  title: string;
  instructions: string | null;
  agentId: string;
  agentTitle: string;
  agentName: string;
  taskType: string;
  taskLabel: string;
  siteName: string | null;
  siteSlug: string | null;
  recurrence: string;
  cadenceLabel: string;
  enabled: boolean;
  lastRunLabel: string;
  nextFireIso: string;
  fireCount: number;
  successRate: number;
  totalRuns: number;
  category: string;
}

interface RosterLite { id: string; title: string; name: string; taskTypes: string[] }
interface TaskTypeLite { id: string; label: string; description: string }
interface SiteLite { slug: string; name: string }
interface FlashDto { tone: "ok" | "error"; msg: string }

export interface AutomationHubProps {
  flows: FlowRow[];
  roster: RosterLite[];
  taskTypes: TaskTypeLite[];
  sites: SiteLite[];
  flash: FlashDto | null;
  createAction: (fd: FormData) => Promise<void>;
  updateAction: (fd: FormData) => Promise<void>;
  toggleAction: (fd: FormData) => Promise<void>;
  deleteAction: (fd: FormData) => Promise<void>;
}

// Category taxonomy — labels, glyph, and gradient accent. Feel free to
// rename any label without touching the classifier in page.tsx.
const CATEGORIES: { id: string; label: string; icon: typeof Zap; accent: string }[] = [
  { id: "local",     label: "Local SEO",              icon: MapPin,     accent: "from-cyan-400 to-sky-500" },
  { id: "gbp",       label: "Google Business Profile", icon: Building2,  accent: "from-violet-400 to-fuchsia-500" },
  { id: "reviews",   label: "Reviews & Reputation",    icon: Star,       accent: "from-amber-400 to-orange-500" },
  { id: "onpage",    label: "On-Page & Content",       icon: FileText,   accent: "from-emerald-400 to-teal-500" },
  { id: "offpage",   label: "Backlinks & Outreach",    icon: Link2,      accent: "from-rose-400 to-pink-500" },
  { id: "technical", label: "Technical & CWV",         icon: Gauge,      accent: "from-indigo-400 to-blue-500" },
  { id: "research",  label: "Research & Trends",       icon: Search,     accent: "from-fuchsia-400 to-purple-500" },
  { id: "reporting", label: "Reporting & Alerts",      icon: Bell,       accent: "from-slate-300 to-slate-500" },
];

// Templates surfaced in the Templates modal. Each is a real (agent, task, cadence)
// tuple that pre-fills the New Flow form.
interface Template {
  name: string;
  desc: string;
  categoryId: string;
  agentId: string;
  taskType: string;
  recurrence: string;
}
const TEMPLATES: Template[] = [
  { name: "Weekly rank sweep",           desc: "Full GSC position sweep across the tracked keyword set.",                    categoryId: "reporting", agentId: "ranktracker", taskType: "rank_sweep",            recurrence: "weekly"  },
  { name: "Weekly strategic plan",       desc: "SEO Leader reads GSC + GA + patterns and hands out a per-agent plan.",       categoryId: "reporting", agentId: "leader",      taskType: "strategic_plan",        recurrence: "weekly"  },
  { name: "Weekly technical audit",      desc: "Crawl, CWV, redirect chains, canonical health.",                              categoryId: "technical", agentId: "technical",   taskType: "technical_audit",       recurrence: "weekly"  },
  { name: "Weekly blog post",            desc: "Long-form editorial from the Content Writer.",                                categoryId: "onpage",    agentId: "blog",        taskType: "blog_writing",          recurrence: "weekly"  },
  { name: "Monthly keyword refresh",     desc: "EN + AR keyword clusters with seasonal Dubai signals.",                       categoryId: "research",  agentId: "research",    taskType: "keyword_research",      recurrence: "monthly" },
  { name: "Weekly competitor rank watch", desc: "Track UAE cleaning-vertical competitors on money keywords.",                  categoryId: "reporting", agentId: "ranktracker", taskType: "competitor_rank_watch", recurrence: "weekly"  },
  { name: "Weekly on-page audit",         desc: "Scorecard of titles, meta, H1, schema, hreflang state.",                      categoryId: "onpage",    agentId: "onpage",      taskType: "on_page_audit",         recurrence: "weekly"  },
  { name: "Daily SERP feature check",     desc: "AI overviews, PAA, FAQ rich results, local pack.",                            categoryId: "reporting", agentId: "ranktracker", taskType: "serp_feature_audit",    recurrence: "daily"   },
];

// Icons overlaid on flow cards, keyed by agent id.
const AGENT_ICON: Record<string, typeof Zap> = {
  leader: Sparkles,
  research: Search,
  techseo: Building2,
  blog: FileText,
  onpage: FileText,
  technical: Gauge,
  ranktracker: TrendingUp,
  offpage: Link2,
};

/* ─────────── main ─────────── */

export function AutomationHub({
  flows,
  roster,
  taskTypes,
  sites,
  flash,
  createAction,
  updateAction,
  toggleAction,
  deleteAction,
}: AutomationHubProps) {
  const [category, setCategory] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<FlowStatus | "all">("all");
  const [query, setQuery] = useState("");
  const [showTemplates, setShowTemplates] = useState(false);
  const [editorTemplate, setEditorTemplate] = useState<Template | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingFlow, setEditingFlow] = useState<FlowRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<FlowRow | null>(null);

  const filtered = useMemo(() => {
    return flows.filter((f) => {
      if (category !== "all" && f.category !== category) return false;
      if (statusFilter === "running" && !f.enabled) return false;
      if (statusFilter === "paused" && f.enabled) return false;
      if (query) {
        const hay = `${f.title} ${f.instructions ?? ""} ${f.agentTitle} ${f.taskLabel}`.toLowerCase();
        if (!hay.includes(query.toLowerCase())) return false;
      }
      return true;
    });
  }, [flows, category, statusFilter, query]);

  const kpi = useMemo(() => {
    const total = flows.length;
    const running = flows.filter((f) => f.enabled).length;
    const paused = flows.filter((f) => !f.enabled).length;
    const scored = flows.filter((f) => f.totalRuns > 0);
    const avg = scored.length ? Math.round(scored.reduce((a, b) => a + b.successRate, 0) / scored.length) : 0;
    return { total, running, paused, avg };
  }, [flows]);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-cyan-400/20 bg-[#05070d] text-slate-200">
      {/* ambient — matches Agent Jobs hero */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute top-[-10%] left-1/2 h-[500px] w-[900px] -translate-x-1/2 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-[400px] w-[400px] rounded-full bg-blue-600/10 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.15]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(56,189,248,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,.08) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
      </div>

      <div className="relative px-4 py-8 sm:px-6 sm:py-10">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/admin/agent/jobs"
            className="inline-flex items-center gap-2 rounded-md border border-slate-800 bg-slate-900/40 px-3 py-1.5 text-xs text-slate-300 transition hover:border-cyan-400/40 hover:text-cyan-200"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Agent Jobs
          </Link>
          <Link
            href="/admin/scout"
            className="inline-flex items-center gap-2 rounded-md border border-cyan-400/25 bg-cyan-400/10 px-3 py-1.5 text-xs text-cyan-200 transition hover:bg-cyan-400/20"
          >
            <Sparkles className="h-3.5 w-3.5" /> Manual dispatch
          </Link>
        </div>

        <header className="mt-6 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.20em] text-cyan-300/80">
              Dubai · Cleaning Services
            </div>
            <h1 className="mt-1 text-2xl font-semibold text-white sm:text-3xl">SEO Automation</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-400">
              Chain agents together with schedules built for the UAE cleaning market. Every flow you see is a live
              {" "}<span className="font-mono text-[11px]">agent_schedules</span> row.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowTemplates(true)}
              className="inline-flex items-center gap-2 rounded-md border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
            >
              <Bot className="h-4 w-4" /> Templates
            </button>
            <button
              type="button"
              onClick={() => { setEditorTemplate(null); setEditorOpen(true); }}
              className="inline-flex items-center gap-2 rounded-md border border-emerald-400/40 bg-emerald-500/20 px-3 py-1.5 text-sm font-semibold text-emerald-100 shadow-[0_0_20px_rgba(52,211,153,0.25)] hover:bg-emerald-500/30"
            >
              <Plus className="h-4 w-4" /> New flow
            </button>
          </div>
        </header>

        {flash ? (
          <div
            className={`mt-4 rounded-md border px-3 py-2 text-xs ${
              flash.tone === "ok"
                ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
                : "border-rose-400/30 bg-rose-500/10 text-rose-200"
            }`}
          >
            {flash.msg}
          </div>
        ) : null}

        {/* KPI ring cards — same style as the CommandCenterHero on /admin/tasks. */}
        <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <RingKpi
            label="Total flows"
            value={kpi.total}
            sub="Across all categories"
            percent={100}
            ringFrom="#22d3ee"
            ringTo="#0ea5e9"
            icon={Zap}
            active={statusFilter === "all"}
            onClick={() => setStatusFilter("all")}
          />
          <RingKpi
            label="Running"
            value={kpi.running}
            sub={`${kpi.total ? Math.round((kpi.running / kpi.total) * 100) : 0}% of pipeline`}
            percent={kpi.total ? (kpi.running / kpi.total) * 100 : 0}
            ringFrom="#34d399"
            ringTo="#14b8a6"
            icon={Play}
            active={statusFilter === "running"}
            onClick={() => setStatusFilter("running")}
          />
          <RingKpi
            label="Paused"
            value={kpi.paused}
            sub={kpi.paused === 0 ? "Everything live" : "Awaiting resume"}
            percent={kpi.total ? (kpi.paused / kpi.total) * 100 : 0}
            ringFrom="#fbbf24"
            ringTo="#f97316"
            icon={Pause}
            active={statusFilter === "paused"}
            onClick={() => setStatusFilter("paused")}
          />
          <RingKpi
            label="Avg success"
            value={`${kpi.avg}%`}
            sub="Across scored runs"
            percent={kpi.avg}
            ringFrom="#c084fc"
            ringTo="#e879f9"
            icon={TrendingUp}
          />
        </section>

        {/* Filters */}
        <div className="mt-6 flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/40 p-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search automations..."
              className="w-full rounded-md border border-slate-800 bg-slate-950/60 py-1.5 pl-8 pr-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400/50 focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-1 rounded-md border border-slate-800 bg-slate-950/50 p-0.5 text-xs">
            {(["all", "running", "paused"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={`rounded px-2.5 py-1 capitalize transition ${
                  statusFilter === s ? "bg-cyan-400/15 text-cyan-200" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 text-[11px] text-slate-500">
            <Filter className="h-3.5 w-3.5" /> {filtered.length} of {flows.length}
          </div>
        </div>

        {/* Category chips */}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setCategory("all")}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition ${
              category === "all"
                ? "border-cyan-400/50 bg-cyan-400/10 text-cyan-200"
                : "border-slate-800 bg-slate-900/40 text-slate-300 hover:border-slate-700"
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" /> All categories
          </button>
          {CATEGORIES.map((c) => {
            const Icon = c.icon;
            const active = category === c.id;
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
              </button>
            );
          })}
        </div>

        {/* Flow cards */}
        {filtered.length === 0 ? (
          <div className="mt-10 rounded-xl border border-dashed border-slate-800 bg-slate-900/30 p-10 text-center text-sm text-slate-400">
            No automations match these filters.
            <div className="mt-2 text-xs text-slate-500">
              Try{" "}
              <button type="button" onClick={() => setShowTemplates(true)} className="text-cyan-300 hover:underline">
                a template
              </button>{" "}
              or{" "}
              <button type="button" onClick={() => { setEditorTemplate(null); setEditorOpen(true); }} className="text-cyan-300 hover:underline">
                + New flow
              </button>.
            </div>
          </div>
        ) : (
          <ul className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((f) => (
              <li key={f.id}>
                <FlowCard
                  flow={f}
                  toggleAction={toggleAction}
                  onEdit={() => setEditingFlow(f)}
                  onDelete={() => setConfirmDelete(f)}
                />
              </li>
            ))}
          </ul>
        )}

        <div aria-hidden className="h-8" />
      </div>

      {/* Modals */}
      {editorOpen ? (
        <FlowEditor
          template={editorTemplate}
          roster={roster}
          taskTypes={taskTypes}
          sites={sites}
          createAction={createAction}
          onClose={() => { setEditorOpen(false); setEditorTemplate(null); }}
        />
      ) : null}
      {showTemplates ? (
        <TemplatesModal
          onClose={() => setShowTemplates(false)}
          onPick={(t) => {
            setShowTemplates(false);
            setEditorTemplate(t);
            setEditorOpen(true);
          }}
        />
      ) : null}
      {confirmDelete ? (
        <DeleteConfirm
          flow={confirmDelete}
          onClose={() => setConfirmDelete(null)}
          deleteAction={deleteAction}
        />
      ) : null}
      {editingFlow ? (
        <EditFlowModal
          flow={editingFlow}
          taskTypes={taskTypes}
          roster={roster}
          updateAction={updateAction}
          onClose={() => setEditingFlow(null)}
        />
      ) : null}
    </div>
  );
}

/* ─────────── FlowCard ─────────── */

function FlowCard({
  flow,
  toggleAction,
  onEdit,
  onDelete,
}: {
  flow: FlowRow;
  toggleAction: (fd: FormData) => Promise<void>;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const cat = CATEGORIES.find((c) => c.id === flow.category) ?? CATEGORIES[CATEGORIES.length - 1];
  const Icon = AGENT_ICON[flow.agentId] ?? cat.icon;
  const accent = cat.accent;

  return (
    <div className="group relative overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40 p-5 transition hover:-translate-y-0.5 hover:border-cyan-500/40 hover:bg-slate-900/70 hover:shadow-[0_0_20px_rgba(34,211,238,0.08)]">
      <span aria-hidden className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r ${accent}`} />

      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-gradient-to-br ${accent} text-slate-950 shadow`}>
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold leading-tight text-white">{flow.title}</div>
            {flow.instructions ? (
              <div className="mt-1 line-clamp-2 text-xs text-slate-400">{flow.instructions}</div>
            ) : (
              <div className="mt-1 text-xs text-slate-500">
                {flow.agentTitle} · <span className="font-mono">{flow.taskLabel}</span>
                {flow.siteName ? ` · ${flow.siteName}` : " · network-wide"}
              </div>
            )}
          </div>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ${
            flow.enabled
              ? "bg-emerald-400/10 text-emerald-300"
              : "bg-amber-400/10 text-amber-300"
          }`}
        >
          {flow.enabled ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
          {flow.enabled ? "running" : "paused"}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-[11px]">
        <StatBox label="Cadence"  value={flow.cadenceLabel} />
        <StatBox label="Last run" value={flow.lastRunLabel} />
        <StatBox label="Success"  value={flow.totalRuns > 0 ? `${flow.successRate}%` : "—"} />
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wider text-slate-500">{cat.label}</div>
        <div className="flex items-center gap-1.5">
          <form action={toggleAction}>
            <input type="hidden" name="scheduleId" value={flow.id} />
            <input type="hidden" name="enabled" value={flow.enabled ? "false" : "true"} />
            <button
              type="submit"
              className="rounded-md border border-slate-700 bg-slate-900/60 p-1.5 text-slate-300 hover:bg-slate-800 hover:text-white"
              aria-label={flow.enabled ? "Pause" : "Resume"}
              title={flow.enabled ? "Pause" : "Resume"}
            >
              {flow.enabled ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            </button>
          </form>
          <button
            type="button"
            onClick={onEdit}
            className="rounded-md border border-slate-700 bg-slate-900/60 p-1.5 text-slate-300 hover:bg-slate-800 hover:text-white"
            aria-label="Edit automation"
            title="Edit automation"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="rounded-md border border-rose-500/30 bg-rose-500/5 p-1.5 text-rose-300 hover:bg-rose-500/15 hover:text-rose-200"
            aria-label="Delete"
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-950/50 px-2 py-1.5">
      <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-0.5 truncate text-slate-200">{value}</div>
    </div>
  );
}

/* ─────────── RingKpi ─────────── */

function RingKpi({
  label,
  value,
  sub,
  percent,
  ringFrom,
  ringTo,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  value: string | number;
  sub?: string;
  percent: number;
  ringFrom: string;
  ringTo: string;
  icon: typeof Zap;
  active?: boolean;
  onClick?: () => void;
}) {
  const pct = Math.max(0, Math.min(100, percent));
  const size = 56;
  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  const clickable = !!onClick;
  const gradId = `kpi-${label.replace(/\W+/g, "-")}`;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!clickable}
      className={`group relative overflow-hidden rounded-xl border p-4 text-left transition-all ${
        active
          ? "border-cyan-400/50 bg-slate-900/70 shadow-[0_0_25px_rgba(34,211,238,0.12)]"
          : "border-slate-800 bg-slate-900/40"
      } ${clickable ? "cursor-pointer hover:-translate-y-0.5 hover:border-slate-600 hover:bg-slate-900/70" : "cursor-default"}`}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-10 blur-2xl transition-opacity group-hover:opacity-20"
        style={{ background: `radial-gradient(circle, ${ringFrom}, transparent 70%)` }}
      />
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-slate-500">
            <Icon className="h-3 w-3" style={{ color: ringFrom }} />
            {label}
          </div>
          <div className="mt-1.5 text-2xl font-semibold tracking-tight tabular-nums text-white">{value}</div>
          {sub ? <div className="mt-0.5 text-[10px] text-slate-500">{sub}</div> : null}
        </div>
        <div className="relative shrink-0">
          <svg width={size} height={size} className="-rotate-90">
            <defs>
              <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={ringFrom} />
                <stop offset="100%" stopColor={ringTo} />
              </linearGradient>
            </defs>
            <circle cx={size / 2} cy={size / 2} r={r} stroke="rgb(30 41 59)" strokeWidth={stroke} fill="none" />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              stroke={`url(#${gradId})`}
              strokeWidth={stroke}
              strokeLinecap="round"
              fill="none"
              strokeDasharray={`${dash} ${c}`}
              className="transition-[stroke-dasharray] duration-700 ease-out"
            />
          </svg>
          <div className="pointer-events-none absolute inset-0 grid place-items-center text-[10px] font-semibold tabular-nums text-slate-300">
            {Math.round(pct)}%
          </div>
        </div>
      </div>
    </button>
  );
}

/* ─────────── Modals ─────────── */

function Modal({
  title,
  children,
  onClose,
  wide,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`w-full ${wide ? "max-w-2xl" : "max-w-lg"} rounded-xl border border-slate-800 bg-slate-950 p-5 shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 transition hover:bg-slate-800 hover:text-white"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

function FlowEditor({
  template,
  roster,
  taskTypes,
  sites,
  createAction,
  onClose,
}: {
  template: Template | null;
  roster: RosterLite[];
  taskTypes: TaskTypeLite[];
  sites: SiteLite[];
  createAction: (fd: FormData) => Promise<void>;
  onClose: () => void;
}) {
  const [agentId, setAgentId] = useState<string>(template?.agentId ?? roster[0]?.id ?? "");
  const selectedAgent = roster.find((r) => r.id === agentId);
  const visibleTaskTypes = useMemo(() => {
    const allow = selectedAgent?.taskTypes ?? ["custom"];
    return taskTypes.filter((t) => allow.includes(t.id));
  }, [selectedAgent, taskTypes]);
  const [taskType, setTaskType] = useState<string>(
    template?.taskType && (selectedAgent?.taskTypes ?? []).includes(template.taskType)
      ? template.taskType
      : visibleTaskTypes[0]?.id ?? "custom",
  );
  const validTaskType = visibleTaskTypes.some((t) => t.id === taskType)
    ? taskType
    : visibleTaskTypes[0]?.id ?? "custom";
  const [title, setTitle] = useState(template?.name ?? "");
  const [instructions, setInstructions] = useState(template?.desc ?? "");
  const [recurrence, setRecurrence] = useState<string>(template?.recurrence ?? "weekly");
  const [siteSlug, setSiteSlug] = useState<string>("");
  const first = new Date(Date.now() + 5 * 60_000);
  const nowLocal = new Date(first.getTime() - first.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  const [runAt, setRunAt] = useState<string>(nowLocal);

  return (
    <Modal title={template ? "New automation from template" : "New automation"} onClose={onClose} wide>
      <form action={createAction} className="space-y-3">
        <input type="hidden" name="agentId" value={agentId} />
        <input type="hidden" name="taskType" value={validTaskType} />

        <label className="block">
          <span className="mb-1 block text-[10px] uppercase tracking-wider text-slate-400">Name</span>
          <input
            name="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            placeholder="e.g. Weekly Dubai Marina rank sweep"
            className="w-full rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400/50 focus:outline-none"
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[10px] uppercase tracking-wider text-slate-400">Agent</span>
            <select
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              className="h-9 w-full rounded-md border border-slate-800 bg-slate-900/60 px-2 text-sm text-slate-100"
            >
              {roster.map((r) => (
                <option key={r.id} value={r.id}>{r.title}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] uppercase tracking-wider text-slate-400">Task type</span>
            <select
              value={validTaskType}
              onChange={(e) => setTaskType(e.target.value)}
              className="h-9 w-full rounded-md border border-slate-800 bg-slate-900/60 px-2 text-sm text-slate-100"
            >
              {visibleTaskTypes.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[10px] uppercase tracking-wider text-slate-400">First fire</span>
            <input
              name="runAt"
              type="datetime-local"
              value={runAt}
              onChange={(e) => setRunAt(e.target.value)}
              className="h-9 w-full rounded-md border border-slate-800 bg-slate-900/60 px-2 text-sm text-slate-100"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] uppercase tracking-wider text-slate-400">Cadence</span>
            <select
              name="recurrence"
              value={recurrence}
              onChange={(e) => setRecurrence(e.target.value)}
              className="h-9 w-full rounded-md border border-slate-800 bg-slate-900/60 px-2 text-sm text-slate-100"
            >
              <option value="once">One-off</option>
              <option value="hourly">Hourly</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </label>
        </div>

        <label className="block">
          <span className="mb-1 block text-[10px] uppercase tracking-wider text-slate-400">Target site (optional)</span>
          <select
            name="siteSlug"
            value={siteSlug}
            onChange={(e) => setSiteSlug(e.target.value)}
            className="h-9 w-full rounded-md border border-slate-800 bg-slate-900/60 px-2 text-sm text-slate-100"
          >
            <option value="">— network-wide —</option>
            {sites.map((s) => (
              <option key={s.slug} value={s.slug}>{s.name}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-[10px] uppercase tracking-wider text-slate-400">Instructions</span>
          <textarea
            name="instructions"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={3}
            placeholder="What should this automation do on each fire?"
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
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-md border border-emerald-400/40 bg-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-100 shadow-[0_0_12px_rgba(52,211,153,0.30)] hover:bg-emerald-500/30"
          >
            <Plus className="h-3.5 w-3.5" /> Create automation
          </button>
        </div>
      </form>
    </Modal>
  );
}

function EditFlowModal({
  flow,
  taskTypes,
  roster,
  updateAction,
  onClose,
}: {
  flow: FlowRow;
  taskTypes: TaskTypeLite[];
  roster: RosterLite[];
  updateAction: (fd: FormData) => Promise<void>;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(flow.title);
  const [instructions, setInstructions] = useState(flow.instructions ?? "");
  const [taskType, setTaskType] = useState<string>(flow.taskType);
  const [recurrence, setRecurrence] = useState<string>(flow.recurrence);
  const iso = flow.nextFireIso;
  const initialLocal = iso
    ? new Date(new Date(iso).getTime() - new Date(iso).getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
    : "";
  const [runAt, setRunAt] = useState<string>(initialLocal);
  const agent = roster.find((r) => r.id === flow.agentId);
  const visibleTaskTypes = useMemo(() => {
    const allow = agent?.taskTypes ?? ["custom"];
    return taskTypes.filter((t) => allow.includes(t.id));
  }, [agent, taskTypes]);
  const validTaskType = visibleTaskTypes.some((t) => t.id === taskType)
    ? taskType
    : visibleTaskTypes[0]?.id ?? taskType;

  return (
    <Modal title="Edit automation" onClose={onClose} wide>
      <form action={updateAction} className="space-y-3">
        <input type="hidden" name="scheduleId" value={flow.id} />

        <div className="rounded-md border border-slate-800 bg-slate-900/50 px-3 py-2 text-[11px] text-slate-400">
          <span className="text-slate-500">Agent:</span> <span className="font-mono text-slate-200">{flow.agentTitle}</span>
          {flow.siteName ? (
            <>
              <span className="mx-1.5 text-slate-600">·</span>
              <span className="text-slate-500">Site:</span> <span className="text-slate-200">{flow.siteName}</span>
            </>
          ) : (
            <>
              <span className="mx-1.5 text-slate-600">·</span>
              <span className="text-slate-500">Scope:</span> <span className="text-slate-200">network-wide</span>
            </>
          )}
          <div className="mt-1 text-slate-500">
            To move this automation to a different agent or site, delete it and create a new one.
          </div>
        </div>

        <label className="block">
          <span className="mb-1 block text-[10px] uppercase tracking-wider text-slate-400">Name</span>
          <input
            name="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className="w-full rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 focus:border-cyan-400/50 focus:outline-none"
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[10px] uppercase tracking-wider text-slate-400">Task type</span>
            <select
              name="taskType"
              value={validTaskType}
              onChange={(e) => setTaskType(e.target.value)}
              className="h-9 w-full rounded-md border border-slate-800 bg-slate-900/60 px-2 text-sm text-slate-100"
            >
              {visibleTaskTypes.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] uppercase tracking-wider text-slate-400">Cadence</span>
            <select
              name="recurrence"
              value={recurrence}
              onChange={(e) => setRecurrence(e.target.value)}
              className="h-9 w-full rounded-md border border-slate-800 bg-slate-900/60 px-2 text-sm text-slate-100"
            >
              <option value="once">One-off</option>
              <option value="hourly">Hourly</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </label>
        </div>

        <label className="block">
          <span className="mb-1 block text-[10px] uppercase tracking-wider text-slate-400">Next fire (local time)</span>
          <input
            name="runAt"
            type="datetime-local"
            value={runAt}
            onChange={(e) => setRunAt(e.target.value)}
            className="h-9 w-full rounded-md border border-slate-800 bg-slate-900/60 px-2 text-sm text-slate-100"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-[10px] uppercase tracking-wider text-slate-400">Instructions</span>
          <textarea
            name="instructions"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={4}
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
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-md border border-cyan-400/40 bg-cyan-500/20 px-3 py-1.5 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/30"
          >
            <Pencil className="h-3.5 w-3.5" /> Save changes
          </button>
        </div>
      </form>
    </Modal>
  );
}

function TemplatesModal({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (t: Template) => void;
}) {
  return (
    <Modal title="Start from a template" onClose={onClose} wide>
      <p className="text-xs text-slate-400">
        Pick a starting point tuned for a Dubai cleaning-services network. Every template maps to a real agent + task type.
      </p>
      <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {TEMPLATES.map((t) => {
          const cat = CATEGORIES.find((c) => c.id === t.categoryId) ?? CATEGORIES[0];
          const Icon = cat.icon;
          return (
            <li key={t.name}>
              <button
                type="button"
                onClick={() => onPick(t)}
                className="group flex w-full items-start gap-3 rounded-lg border border-slate-800 bg-slate-900/50 p-3 text-left transition hover:border-cyan-400/40 hover:bg-slate-900"
              >
                <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-md bg-gradient-to-br ${cat.accent} text-slate-950`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium leading-tight text-white">{t.name}</div>
                  <div className="mt-0.5 text-xs text-slate-400">{t.desc}</div>
                  <div className="mt-1.5 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500">
                    <span className="rounded bg-slate-800/70 px-1.5 py-0.5 font-mono text-slate-300">{t.agentId}</span>
                    <span>·</span>
                    <span className="rounded bg-slate-800/70 px-1.5 py-0.5 font-mono text-slate-300">{t.taskType}</span>
                    <span>·</span>
                    <span>{t.recurrence}</span>
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}

function DeleteConfirm({
  flow,
  onClose,
  deleteAction,
}: {
  flow: FlowRow;
  onClose: () => void;
  deleteAction: (fd: FormData) => Promise<void>;
}) {
  return (
    <Modal title="Delete automation?" onClose={onClose}>
      <p className="text-sm text-slate-400">
        This will permanently remove <span className="font-medium text-slate-200">{flow.title}</span>. In-flight jobs already
        dispatched from this schedule are not affected; the schedule simply stops firing.
      </p>
      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
        >
          Cancel
        </button>
        <form action={deleteAction}>
          <input type="hidden" name="scheduleId" value={flow.id} />
          <input type="hidden" name="agentId" value={flow.agentId} />
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-md border border-rose-500/40 bg-rose-500/15 px-3 py-1.5 text-xs font-medium text-rose-200 hover:bg-rose-500/25"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </button>
        </form>
      </div>
    </Modal>
  );
}
