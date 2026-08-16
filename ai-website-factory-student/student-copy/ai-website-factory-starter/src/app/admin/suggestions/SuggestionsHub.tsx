"use client";

/**
 * SuggestionsHub — dark cyan-grid canvas rendering the ranked suggestion
 * list grouped by pillar, plus a ring-KPI row and an Automation block.
 * All data arrives already fetched + classified from page.tsx.
 */
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Filter, Sparkles, Lightbulb, ArrowUpRight, Link2, FileText,
  Gauge, MapPin, TrendingUp, Users, Zap, Play, Calendar, Repeat,
} from "lucide-react";

export type CategoryId = "on-page" | "off-page" | "technical" | "content" | "local" | "rank";

export interface Suggestion {
  rank: number;
  id: string;
  title: string;
  body: string;
  impact: "critical" | "high" | "medium" | "low";
  effort: "quick" | "focused" | "large";
  time: string;
  category: CategoryId;
  href?: string;
  source: "pattern" | "agent-task" | "qa-fail";
  agentLabel: string | null;
}

export interface AutomationSuggestion {
  id: string;
  title: string;
  body: string;
  cadenceLabel: string;
  trigger: string;
  agentTitle: string;
  agentId: string;
  taskType: string;
  impact: "critical" | "high" | "medium" | "low";
  lift: string;
  timing: string;
}

export interface SuggestionsHubProps {
  suggestions: Suggestion[];
  categoryCounts: Record<CategoryId, number>;
  totalCount: number;
  assignedCount: number;
  highImpactCount: number;
  quickWinsCount: number;
  automation: AutomationSuggestion[];
  empty: boolean;
}

/* ─────────── pillar metadata ─────────── */

const PILLARS: {
  id: CategoryId;
  label: string;
  blurb: string;
  icon: typeof Lightbulb;
  accent: string;
  tint: string;
  fg: string;
}[] = [
  { id: "on-page",   label: "On-Page SEO",   blurb: "Content, meta, headings and internal links",   icon: FileText,   accent: "from-emerald-400 to-teal-500",   tint: "bg-emerald-500/10",  fg: "text-emerald-300" },
  { id: "off-page",  label: "Off-Page SEO",  blurb: "Authority, backlinks and brand mentions",       icon: Link2,      accent: "from-rose-400 to-pink-500",       tint: "bg-rose-500/10",     fg: "text-rose-300" },
  { id: "technical", label: "Technical SEO", blurb: "Crawl, speed, indexation and Core Web Vitals",   icon: Gauge,      accent: "from-indigo-400 to-blue-500",     tint: "bg-indigo-500/10",   fg: "text-indigo-300" },
  { id: "content",   label: "Content",       blurb: "Editorial gaps, freshness, thin pages",         icon: FileText,   accent: "from-emerald-400 to-teal-500",   tint: "bg-emerald-500/10",  fg: "text-emerald-300" },
  { id: "local",     label: "Local SEO",     blurb: "GMB, NAP consistency, neighbourhood pages",     icon: MapPin,     accent: "from-cyan-400 to-sky-500",        tint: "bg-cyan-500/10",     fg: "text-cyan-300" },
  { id: "rank",      label: "Ranking",       blurb: "Position deltas, SERP feature ownership",       icon: TrendingUp, accent: "from-lime-400 to-green-500",      tint: "bg-lime-500/10",     fg: "text-lime-300" },
];

/* ─────────── impact + effort styling ─────────── */

const IMPACT_STYLE: Record<Suggestion["impact"], { label: string; cls: string }> = {
  critical: { label: "CRITICAL",       cls: "bg-rose-500/10 text-rose-300 border-rose-400/30" },
  high:     { label: "HIGH IMPACT",    cls: "bg-rose-500/10 text-rose-300 border-rose-400/30" },
  medium:   { label: "MEDIUM IMPACT",  cls: "bg-amber-500/10 text-amber-300 border-amber-400/30" },
  low:      { label: "LOW IMPACT",     cls: "bg-slate-500/10 text-slate-300 border-slate-400/30" },
};

const EFFORT_STYLE: Record<Suggestion["effort"], { label: string; cls: string }> = {
  quick:   { label: "S · QUICK",   cls: "bg-slate-900/60 text-cyan-200 border-cyan-500/30" },
  focused: { label: "M · FOCUSED", cls: "bg-slate-900/60 text-slate-200 border-slate-500/30" },
  large:   { label: "L · DEEP",    cls: "bg-slate-900/60 text-violet-200 border-violet-500/30" },
};

/* ─────────── main ─────────── */

const PAGE_SIZE = 3;

export function SuggestionsHub(props: SuggestionsHubProps) {
  const [expandedPillars, setExpandedPillars] = useState<Record<string, boolean>>({});
  const togglePillar = (id: string) =>
    setExpandedPillars((p) => ({ ...p, [id]: !p[id] }));

  /** Group ranked suggestions under each pillar. */
  const byPillar = useMemo(() => {
    const m = new Map<CategoryId, Suggestion[]>();
    for (const p of PILLARS) m.set(p.id, []);
    for (const s of props.suggestions) {
      m.get(s.category)?.push(s);
    }
    return m;
  }, [props.suggestions]);

  const visiblePillars = PILLARS.filter((p) => (byPillar.get(p.id)?.length ?? 0) > 0);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-cyan-400/20 bg-[#05070d] text-slate-200">
      {/* ambient */}
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
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.20em] text-cyan-300/80">
              Recommendations · Prioritized
            </div>
            <h1 className="mt-1 text-2xl font-semibold text-white sm:text-3xl">Suggestions</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-400">
              Ranked SEO opportunities surfaced by your agent fleet, grouped by pillar.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-md border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
            >
              <Filter className="h-4 w-4" /> Filter
            </button>
            <Link
              href="/admin/automation"
              className="inline-flex items-center gap-2 rounded-md border border-emerald-400/40 bg-emerald-500/20 px-3 py-1.5 text-sm font-semibold text-emerald-100 shadow-[0_0_20px_rgba(52,211,153,0.25)] hover:bg-emerald-500/30"
            >
              <Sparkles className="h-4 w-4" /> Generate new
            </Link>
          </div>
        </header>

        {props.empty ? (
          <div className="mt-4 rounded-md border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-100">
            No open patterns, proposals, or QA failures right now. As data lands from the nightly
            crons (patterns:detect, seo:scan, qa:run), suggestions appear here.
          </div>
        ) : null}

        {/* KPI ring cards */}
        <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <RingKpi
            label="Total suggestions"
            value={props.totalCount}
            sub="Across all pillars"
            percent={100}
            ringFrom="#22d3ee"
            ringTo="#0ea5e9"
            icon={Lightbulb}
          />
          <RingKpi
            label="Assigned"
            value={props.assignedCount}
            sub={`${props.totalCount ? Math.round((props.assignedCount / props.totalCount) * 100) : 0}% of backlog`}
            percent={props.totalCount ? (props.assignedCount / props.totalCount) * 100 : 0}
            ringFrom="#c084fc"
            ringTo="#e879f9"
            icon={Users}
          />
          <RingKpi
            label="High impact"
            value={props.highImpactCount}
            sub="Ship these first"
            percent={props.totalCount ? (props.highImpactCount / props.totalCount) * 100 : 0}
            ringFrom="#fb7185"
            ringTo="#f43f5e"
            icon={TrendingUp}
          />
          <RingKpi
            label="Quick wins"
            value={props.quickWinsCount}
            sub="Low effort, real lift"
            percent={props.totalCount ? (props.quickWinsCount / props.totalCount) * 100 : 0}
            ringFrom="#34d399"
            ringTo="#14b8a6"
            icon={Zap}
          />
        </section>

        {/* Pillar groups */}
        <div className="mt-8 space-y-4">
          {visiblePillars.map((p) => {
            const items = byPillar.get(p.id) ?? [];
            const highCount = items.filter((s) => s.impact === "critical" || s.impact === "high").length;
            const isExpanded = !!expandedPillars[p.id];
            const shown = isExpanded ? items : items.slice(0, PAGE_SIZE);
            const remaining = items.length - shown.length;
            const Icon = p.icon;
            return (
              <section
                key={p.id}
                className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/40"
              >
                {/* Pillar header */}
                <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/70 px-4 py-3 sm:px-5">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br ${p.accent} text-slate-950 shadow`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <h2 className="truncate text-base font-semibold text-white">{p.label}</h2>
                      <p className="truncate text-xs text-slate-400">{p.blurb}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full border border-slate-700 bg-slate-950/60 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-300">
                      {items.length} item{items.length === 1 ? "" : "s"}
                    </span>
                    {highCount > 0 ? (
                      <span className="rounded-full border border-rose-400/30 bg-rose-500/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-rose-200">
                        {highCount} high impact
                      </span>
                    ) : null}
                  </div>
                </header>

                {/* Suggestions inside */}
                <ul className="divide-y divide-slate-800/60">
                  {shown.map((s) => (
                    <li key={s.id}>
                      <SuggestionRow s={s} pillarTint={p.tint} pillarFg={p.fg} />
                    </li>
                  ))}
                </ul>

                {/* Footer with pager */}
                {items.length > PAGE_SIZE ? (
                  <footer className="flex items-center justify-between border-t border-slate-800/60 px-4 py-3 text-xs sm:px-5">
                    <span className="text-slate-500">
                      Showing {shown.length} of {items.length}
                    </span>
                    <button
                      type="button"
                      onClick={() => togglePillar(p.id)}
                      className="inline-flex items-center gap-1 text-cyan-300 transition hover:text-cyan-200"
                    >
                      {isExpanded ? "Show less" : `View all (${remaining} more)`}
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </button>
                  </footer>
                ) : null}
              </section>
            );
          })}

          {visiblePillars.length === 0 && !props.empty ? (
            <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 p-10 text-center text-sm text-slate-400">
              Suggestions haven&apos;t been categorized yet.
            </div>
          ) : null}
        </div>

        {/* Automation Suggestions */}
        {props.automation.length > 0 ? (
          <section className="mt-8 overflow-hidden rounded-2xl border border-cyan-400/25 bg-slate-900/40">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/70 px-4 py-3 sm:px-5">
              <div className="flex min-w-0 items-center gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-cyan-400 to-blue-500 text-slate-950 shadow">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h2 className="truncate text-base font-semibold text-white">Automation Suggestions</h2>
                  <p className="truncate text-xs text-slate-400">
                    Tasks and workflows your agents can run on a schedule or trigger
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full border border-slate-700 bg-slate-950/60 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-300">
                  {props.automation.length} candidate{props.automation.length === 1 ? "" : "s"}
                </span>
                <Link
                  href="/admin/automation"
                  className="inline-flex items-center gap-1 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-cyan-200 hover:bg-cyan-400/20"
                >
                  Open studio <ArrowUpRight className="h-3 w-3" />
                </Link>
              </div>
            </header>

            <ul className="divide-y divide-slate-800/60">
              {props.automation.map((a) => (
                <li key={a.id}>
                  <AutomationRow a={a} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <div aria-hidden className="h-8" />
      </div>
    </div>
  );
}

/* ─────────── SuggestionRow ─────────── */

function SuggestionRow({
  s,
  pillarTint,
  pillarFg,
}: {
  s: Suggestion;
  pillarTint: string;
  pillarFg: string;
}) {
  const impact = IMPACT_STYLE[s.impact];
  const effort = EFFORT_STYLE[s.effort];
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 px-4 py-4 transition hover:bg-slate-900/60 sm:px-5">
      {/* Glyph */}
      <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${pillarTint}`}>
        <Lightbulb className={`h-4 w-4 ${pillarFg}`} />
      </div>

      {/* Body */}
      <div className="min-w-0">
        <h3 className="truncate text-sm font-semibold text-white">{s.title}</h3>
        <p className="mt-0.5 text-xs leading-relaxed text-slate-400">{s.body}</p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${impact.cls}`}>
            {impact.label}
          </span>
          <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${effort.cls}`}>
            {effort.label}
          </span>
          {s.agentLabel ? (
            <span className={`inline-flex items-center gap-1 rounded border border-slate-500/30 bg-slate-900/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${pillarFg}`}>
              <Users className="h-3 w-3" /> {s.agentLabel}
            </span>
          ) : null}
          <span className="text-[10px] text-slate-500">~{s.time}</span>
        </div>
      </div>

      {/* Action */}
      <div className="shrink-0">
        {s.href ? (
          <Link
            href={s.href}
            className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-900/60 px-2.5 py-1 text-[11px] font-medium text-slate-200 transition hover:border-cyan-400/40 hover:text-cyan-200"
          >
            Review <ArrowUpRight className="h-3 w-3" />
          </Link>
        ) : null}
      </div>
    </div>
  );
}

/* ─────────── AutomationRow ─────────── */

function AutomationRow({ a }: { a: AutomationSuggestion }) {
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 px-4 py-4 transition hover:bg-slate-900/60 sm:px-5">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-cyan-500/25 to-blue-500/25">
        <Sparkles className="h-4 w-4 text-cyan-200" />
      </div>

      <div className="min-w-0">
        <h3 className="truncate text-sm font-semibold text-white">{a.title}</h3>
        <p className="mt-0.5 text-xs leading-relaxed text-slate-400">{a.body}</p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${IMPACT_STYLE[a.impact].cls}`}>
            {IMPACT_STYLE[a.impact].label}
          </span>
          <span className="inline-flex items-center gap-1 rounded border border-emerald-400/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-200">
            <Users className="h-3 w-3" /> {a.agentTitle}
          </span>
          <span className="inline-flex items-center gap-1 rounded border border-slate-500/30 bg-slate-900/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-200">
            <Repeat className="h-3 w-3" /> {a.cadenceLabel}
          </span>
          <span className="inline-flex items-center gap-1 rounded border border-slate-500/30 bg-slate-900/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-200">
            <Calendar className="h-3 w-3" /> {a.trigger}
          </span>
          <span className="inline-flex items-center gap-1 rounded border border-emerald-400/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-200">
            <TrendingUp className="h-3 w-3" /> {a.lift}
          </span>
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span className="text-[10px] text-slate-500">{a.timing}</span>
        <Link
          href={`/admin/automation?agent=${encodeURIComponent(a.agentId)}&task=${encodeURIComponent(a.taskType)}`}
          className="inline-flex items-center gap-1 rounded-md border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-semibold text-cyan-200 transition hover:bg-cyan-400/20"
        >
          <Play className="h-3 w-3" /> Automate
        </Link>
      </div>
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
}: {
  label: string;
  value: string | number;
  sub?: string;
  percent: number;
  ringFrom: string;
  ringTo: string;
  icon: typeof Lightbulb;
}) {
  const pct = Math.max(0, Math.min(100, percent));
  const size = 56;
  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  const gradId = `sug-kpi-${label.replace(/\W+/g, "-")}`;
  return (
    <div className="group relative overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40 p-4">
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
    </div>
  );
}
