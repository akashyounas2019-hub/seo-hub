"use client";

/**
 * CommandCenterHero — dark cyan "Command Center" surface at the top of
 * /admin/tasks. Presentational only: all data is computed server-side in
 * page.tsx and passed through as props.
 *
 * Layout:
 *   Row 1  Breadcrumb pill · "Assign Tasks" heading · Auto-Route + New Task CTAs
 *   Row 2  Four large KPI tiles (Open · In Flight · Critical · Completed)
 *   Row 3  Split — left: filter row + task rows list; right: Workload panel + Suggested routing card
 *
 * Below this hero the page still renders the existing filter bar + kanban
 * board unchanged. This component doesn't replace them — it sits on top.
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Target, Zap, AlertTriangle, CheckCircle2, Search,
  Sparkles, Plus, Filter, Clock, Bot,
} from "lucide-react";

export interface CommandTaskRow {
  id: string;                    // internal uuid — link target
  ticker: string;                // "T-2041" short id
  title: string;
  siteSlug: string | null;
  category: string;              // "ON-PAGE" | "CORE WEB VITALS" | "LOCAL" | "RESEARCH" | "AUDIT" | "CONTENT" — from kind/priority
  priority: string;              // "high" | "critical" | "medium" | "low" | "normal"
  status: string;                // "in_progress" | "in_review" | "todo" | "done" | "blocked"
  dueLabel: string;              // formatted "Jul 12"
  assignee: {
    initials: string;
    label: string;
    kind: "human" | "agent";
  } | null;
}

export interface WorkloadEntry {
  id: string;
  initials: string;
  name: string;
  role: string;
  kind: "human" | "agent";
  pct: number;                   // 0..100
  /** Optional Tailwind gradient string (e.g. "from-violet-400 to-fuchsia-500")
   *  used to tint the agent glyph tile. Falls back to a role-based default. */
  accent?: string;
}

export interface RoutingSuggestion {
  overloadedName: string;
  overloadedPct: number;
  taskTicker: string;
  taskId: string;                // internal uuid — for the Apply link
  reassignTo: string;
}

export interface CommandCenterHeroProps {
  counts: {
    open: number;
    inFlight: number;
    critical: number;
    completed7d: number;
  };
  tasks: CommandTaskRow[];       // top ~8 rows
  workload: WorkloadEntry[];
  suggestion: RoutingSuggestion | null;
  canCreate: boolean;
}

export function CommandCenterHero({
  counts,
  tasks,
  workload,
  suggestion,
  canCreate,
}: CommandCenterHeroProps) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | "in_progress" | "in_review" | "todo" | "done" | "blocked">("all");
  const [priority, setPriority] = useState<"all" | "critical" | "high" | "medium" | "low">("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tasks.filter((t) => {
      if (status !== "all" && t.status !== status) return false;
      if (priority !== "all" && t.priority !== priority) return false;
      if (q && !`${t.title} ${t.ticker} ${t.assignee?.label ?? ""} ${t.siteSlug ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [tasks, query, status, priority]);

  return (
    <div className="command-center relative overflow-hidden rounded-2xl border border-cyan-400/20 bg-[#05070d] text-slate-200">
      {/* ambient glow + grid — matches /admin/agent/jobs exactly */}
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

      <div className="relative px-4 py-6 sm:px-6 sm:py-8">
        {/* Row 1 — breadcrumb pill + heading + CTAs */}
        <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <Link
              href="/admin/agent/jobs"
              className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-[0.24em] text-slate-500 transition hover:text-cyan-300"
            >
              <span aria-hidden>&larr;</span> Command Center
            </Link>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Assign <span className="text-emerald-300">Tasks</span>
            </h1>
            <p className="mt-2 whitespace-nowrap text-sm leading-relaxed text-slate-400">
              Route work across your SEO squad and agent swarm. Filter, delegate, and let the command center keep everyone in sync.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Link
              href="/admin/agent/tasks/new"
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-cyan-400/40 hover:text-cyan-200"
            >
              <Sparkles className="h-3.5 w-3.5" /> Auto-Route
            </Link>
            {canCreate ? (
              <Link
                href="/admin/tasks/new"
                className="inline-flex items-center gap-1.5 rounded-md border border-emerald-400/40 bg-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-100 shadow-[0_0_20px_rgba(52,211,153,0.35)] transition hover:bg-emerald-500/30"
              >
                <Plus className="h-3.5 w-3.5" /> New Task
              </Link>
            ) : null}
          </div>
        </header>

        {/* Row 2 — 4 ring KPI tiles */}
        {(() => {
          const total = Math.max(counts.open + counts.inFlight + counts.critical + counts.completed7d, 1);
          return (
            <section className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <RingKpi
                label="Open Tasks"
                icon={Target}
                tone="cyan"
                value={counts.open}
                total={total}
              />
              <RingKpi
                label="In Flight"
                icon={Zap}
                tone="cyan"
                value={counts.inFlight}
                total={total}
              />
              <RingKpi
                label="Critical"
                icon={AlertTriangle}
                tone="rose"
                value={counts.critical}
                total={total}
              />
              <RingKpi
                label="Completed"
                icon={CheckCircle2}
                tone="emerald"
                value={counts.completed7d}
                total={total}
              />
            </section>
          );
        })()}

        {/* Row 3 — full-width filter + task list */}
        <div className="mt-6 space-y-3">
          <div>
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/60 p-2">
              <div className="relative flex-1 min-w-[240px]">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" aria-hidden />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search tasks, projects, assignees…"
                  className="h-9 w-full rounded-md border border-slate-800 bg-slate-900/60 pl-8 pr-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400/60 focus:outline-none"
                />
              </div>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as typeof status)}
                className="h-9 rounded-md border border-slate-800 bg-slate-900/60 px-2 text-xs text-slate-100"
              >
                <option value="all">All statuses</option>
                <option value="todo">To do</option>
                <option value="in_progress">In progress</option>
                <option value="in_review">In review</option>
                <option value="blocked">Blocked</option>
                <option value="done">Done</option>
              </select>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as typeof priority)}
                className="h-9 rounded-md border border-slate-800 bg-slate-900/60 px-2 text-xs text-slate-100"
              >
                <option value="all">All priorities</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
              <button
                type="button"
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-800 bg-slate-900/60 px-3 text-xs text-slate-300 hover:border-slate-700"
                title="More filters — use the classic filter bar below for site + assignee email"
              >
                <Filter className="h-3.5 w-3.5" /> More
              </button>
            </div>

            {/* Task list */}
            <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950/40">
              {/* Table header */}
              <div className="grid grid-cols-[minmax(0,1fr)_150px_100px_110px_80px] items-center gap-3 border-b border-slate-800/70 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                <div>Task</div>
                <div>Assignee</div>
                <div>Priority</div>
                <div>Status</div>
                <div>Due</div>
              </div>

              {filtered.length === 0 ? (
                <div className="px-4 py-8 text-center text-xs text-slate-500">
                  No tasks match this filter.
                </div>
              ) : (
                <ul className="divide-y divide-slate-800/70">
                  {filtered.map((t) => (
                    <li key={t.id}>
                      <Link
                        href={`/admin/tasks/${t.id}`}
                        className="grid grid-cols-[minmax(0,1fr)_150px_100px_110px_80px] items-center gap-3 px-4 py-3 transition hover:bg-slate-900/50"
                      >
                        {/* Task cell */}
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded bg-slate-800/70 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-300">
                              {t.ticker}
                            </span>
                            <CategoryChip label={t.category} />
                          </div>
                          <div className="mt-1 truncate text-sm font-medium text-slate-100">
                            {t.title}
                          </div>
                          {t.siteSlug ? (
                            <div className="mt-0.5 truncate text-[11px] text-slate-500">
                              {t.siteSlug}
                            </div>
                          ) : null}
                        </div>

                        {/* Assignee cell */}
                        <div className="flex min-w-0 items-center gap-2">
                          {t.assignee ? (
                            <>
                              <AssigneeChip initials={t.assignee.initials} kind={t.assignee.kind} />
                              <div className="min-w-0">
                                <div className="truncate text-xs font-medium text-slate-100">{t.assignee.label}</div>
                                <div className="text-[10px] uppercase tracking-wider text-slate-500">{t.assignee.kind}</div>
                              </div>
                            </>
                          ) : (
                            <span className="text-[11px] italic text-slate-500">unassigned</span>
                          )}
                        </div>

                        {/* Priority */}
                        <div>
                          <PriorityPill priority={t.priority} />
                        </div>

                        {/* Status */}
                        <div>
                          <StatusPill status={t.status} />
                        </div>

                        {/* Due */}
                        <div className="flex items-center gap-1 text-[11px] text-slate-400">
                          <Clock className="h-3 w-3" aria-hidden /> {t.dueLabel}
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        {/* Row 4 — Workload strip (full width, horizontal ring gauges) */}
        <section className="mt-6">
          <div className="mb-3">
            <div className="text-lg font-semibold tracking-tight text-white">Workload</div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">
              Humans &amp; agents · this week
            </div>
          </div>
          {workload.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-8 text-center text-xs text-slate-500">
              Nobody has open tasks right now.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              {workload.map((w) => (
                <WorkloadRing
                  key={w.id}
                  initials={w.initials}
                  name={w.name}
                  role={w.role}
                  kind={w.kind}
                  pct={w.pct}
                  accent={w.accent}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/* ─────────── atoms ─────────── */

/**
 * RobotGlyph — friendly-bot SVG used inside every Workload ring tile. Uses
 * `currentColor` for stroke so the parent's text color drives outline shade,
 * while the chest core stays cyan to hint at the "power on" state.
 */
function RobotGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {/* antenna */}
      <path d="M20 6v3" />
      <circle cx="20" cy="5" r="1.3" fill="currentColor" stroke="none" />
      {/* head */}
      <rect x="9" y="9" width="22" height="15" rx="5" />
      {/* head-side headphone cups */}
      <rect x="6" y="14" width="4" height="6" rx="1.5" />
      <rect x="30" y="14" width="4" height="6" rx="1.5" />
      {/* eyes — cyan glow discs */}
      <circle cx="15.5" cy="16.5" r="1.9" fill="rgb(103 232 249)" stroke="none" />
      <circle cx="24.5" cy="16.5" r="1.9" fill="rgb(103 232 249)" stroke="none" />
      {/* mouth grille */}
      <path d="M14 21h12" />
      {/* neck */}
      <path d="M17.5 24v2M22.5 24v2" />
      {/* body */}
      <rect x="10" y="26" width="20" height="10" rx="2.5" />
      {/* chest core */}
      <circle cx="20" cy="31" r="2.2" fill="rgb(34 211 238)" stroke="none" />
      <circle cx="20" cy="31" r="3.6" opacity="0.35" />
    </svg>
  );
}

/**
 * RingKpi — a big donut ring around the value on the left, label + "of N total"
 * on the right. Matches the reference: value in the middle of the ring, percent
 * of grand total underneath, glowy background.
 */
function RingKpi({
  label,
  value,
  total,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  total: number;
  icon: typeof Target;
  tone: "emerald" | "cyan" | "rose";
}) {
  const pct = Math.max(0, Math.min(100, Math.round((value / Math.max(total, 1)) * 100)));
  const stroke =
    tone === "rose"    ? "stroke-rose-400"    :
    tone === "cyan"    ? "stroke-cyan-400"    :
                         "stroke-emerald-400";
  const glow =
    tone === "rose"    ? "shadow-[0_0_40px_rgba(244,63,94,0.15)]"    :
    tone === "cyan"    ? "shadow-[0_0_40px_rgba(34,211,238,0.15)]"   :
                         "shadow-[0_0_40px_rgba(52,211,153,0.15)]";
  const labelCls =
    tone === "rose"    ? "text-rose-300"    :
    tone === "cyan"    ? "text-cyan-300"    :
                         "text-emerald-300";
  const iconCls =
    tone === "rose"    ? "text-rose-300"    :
    tone === "cyan"    ? "text-cyan-300"    :
                         "text-emerald-300";
  // Circle geometry: r=44 → C = 2πr ≈ 276.5. Dash-offset expresses the "gap".
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (pct / 100) * circumference;
  return (
    <div className={`relative flex items-center gap-4 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/60 p-5 ${glow}`}>
      <div className="pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-slate-700/60 to-transparent" aria-hidden />
      <div className="relative h-24 w-24 shrink-0">
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
          <circle cx="50" cy="50" r={radius} className="fill-none stroke-slate-800" strokeWidth="6" />
          <circle
            cx="50"
            cy="50"
            r={radius}
            strokeWidth="6"
            strokeLinecap="round"
            className={`fill-none ${stroke}`}
            style={{
              strokeDasharray: circumference,
              strokeDashoffset: dashOffset,
              transition: "stroke-dashoffset 600ms cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <div className="text-center">
            <div className="text-2xl font-semibold tabular-nums leading-none text-white">
              {value}
            </div>
            <div className="mt-0.5 text-[9px] font-semibold tabular-nums text-slate-500">
              {pct}%
            </div>
          </div>
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <div className={`flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.24em] ${labelCls}`}>
          <Icon className={`h-3.5 w-3.5 ${iconCls}`} aria-hidden />
          {label}
        </div>
        <div className="mt-1 text-[11px] text-slate-400">
          of <span className="font-semibold tabular-nums text-slate-200">{total}</span> total
        </div>
      </div>
    </div>
  );
}

/**
 * WorkloadRing — donut ring around a rounded-square agent-glyph tile.
 * The tile mirrors the Agent Jobs card style: a rounded-xl box with the
 * per-agent gradient accent as a soft wash, ringed in slate-700, with the
 * Bot icon centred. Below the ring: name, role, and coloured %.
 */
function WorkloadRing({
  name,
  role,
  kind,
  pct,
  accent,
}: {
  initials: string;
  name: string;
  role: string;
  kind: "human" | "agent";
  pct: number;
  accent?: string;
}) {
  const stroke =
    pct >= 80 ? "stroke-rose-400"   :
    pct >= 60 ? "stroke-amber-400"  :
                "stroke-cyan-400";
  const pctCls =
    pct >= 80 ? "text-rose-300"   :
    pct >= 60 ? "text-amber-300"  :
                "text-cyan-300";
  // Default accent — humans get cyan/sky, agents fall back to violet.
  const tileAccent =
    accent ??
    (kind === "agent" ? "from-violet-400 to-fuchsia-500" : "from-cyan-400 to-sky-500");
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (Math.max(0, Math.min(100, pct)) / 100) * circumference;
  return (
    <div className="flex flex-col items-center">
      <div className="relative h-28 w-28">
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
          <circle cx="50" cy="50" r={radius} className="fill-none stroke-slate-800" strokeWidth="6" />
          <circle
            cx="50"
            cy="50"
            r={radius}
            strokeWidth="6"
            strokeLinecap="round"
            className={`fill-none ${stroke}`}
            style={{
              strokeDasharray: circumference,
              strokeDashoffset: dashOffset,
              transition: "stroke-dashoffset 600ms cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          />
        </svg>
        {/* Glyph tile — sits well inside the ring so the coloured donut stays
            clearly visible around it. */}
        <div className="absolute inset-[18%] grid place-items-center overflow-hidden rounded-full bg-slate-950 ring-1 ring-slate-800/80">
          <span className={`absolute inset-0 bg-gradient-to-br ${tileAccent} opacity-20`} aria-hidden />
          <RobotGlyph className="relative h-8 w-8 text-slate-100" />
        </div>
      </div>
      <div className="mt-3 min-w-0 max-w-full text-center">
        <div className="truncate text-sm font-medium text-slate-100">{name}</div>
        <div className="mt-0.5 truncate text-[10px] uppercase tracking-wider text-slate-500">
          {kind === "agent" ? "Agent · " : ""}{role}
        </div>
        <div className={`mt-1.5 text-lg font-semibold tabular-nums ${pctCls}`}>{pct}%</div>
      </div>
    </div>
  );
}

function CategoryChip({ label }: { label: string }) {
  const l = label.toUpperCase();
  const tone =
    l.includes("CORE") || l.includes("VITAL") || l === "TECH" ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-200" :
    l === "LOCAL"                                             ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-200" :
    l === "RESEARCH"                                          ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-200" :
    l === "AUDIT"                                             ? "border-amber-400/40 bg-amber-400/10 text-amber-200" :
    l === "CONTENT"                                           ? "border-violet-400/40 bg-violet-400/10 text-violet-200" :
    l === "ON-PAGE" || l === "ONPAGE"                         ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-200" :
                                                                "border-slate-700 bg-slate-800/60 text-slate-300";
  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${tone}`}>
      {l}
    </span>
  );
}

function PriorityPill({ priority }: { priority: string }) {
  const p = priority.toLowerCase();
  const tone =
    p === "critical" || p === "urgent" ? "border-rose-400/40 bg-rose-500/10 text-rose-200"    :
    p === "high"                        ? "border-amber-400/40 bg-amber-400/10 text-amber-200" :
    p === "medium" || p === "normal"    ? "border-slate-700 bg-slate-800/60 text-slate-300"    :
                                          "border-slate-800 bg-slate-900/60 text-slate-400";
  return (
    <span className={`inline-flex items-center rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${tone}`}>
      {p}
    </span>
  );
}

function StatusPill({ status }: { status: string }) {
  const s = status.toLowerCase();
  const label =
    s === "in_progress" ? "In Progress" :
    s === "in_review"   ? "In Review"   :
    s === "todo"        ? "Backlog"     :
    s === "blocked"     ? "Blocked"     :
    s === "done"        ? "Done"        :
    s;
  const tone =
    s === "in_progress" ? "text-cyan-300"    :
    s === "in_review"   ? "text-amber-300"   :
    s === "todo"        ? "text-slate-400"   :
    s === "blocked"     ? "text-rose-300"    :
    s === "done"        ? "text-emerald-300" :
                          "text-slate-300";
  const dot =
    s === "in_progress" ? "bg-cyan-400"    :
    s === "in_review"   ? "bg-amber-400"   :
    s === "blocked"     ? "bg-rose-400"    :
    s === "done"        ? "bg-emerald-400" :
                          "bg-slate-500";
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium ${tone}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />
      {label}
    </span>
  );
}

function AssigneeChip({
  initials,
  kind,
  size = "sm",
}: {
  initials: string;
  kind: "human" | "agent";
  size?: "sm" | "md";
}) {
  const dim = size === "md" ? "h-8 w-8 text-[11px]" : "h-7 w-7 text-[10px]";
  const gradient =
    kind === "agent"
      ? "bg-gradient-to-br from-violet-400/25 to-fuchsia-500/25 text-violet-100 ring-1 ring-violet-400/30"
      : "bg-gradient-to-br from-emerald-400/25 to-cyan-500/25 text-emerald-100 ring-1 ring-emerald-400/30";
  return (
    <span className={`grid shrink-0 place-items-center rounded-full font-semibold tracking-wider ${dim} ${gradient}`}>
      {initials || (kind === "agent" ? <Bot className="h-3 w-3" /> : "?")}
    </span>
  );
}

