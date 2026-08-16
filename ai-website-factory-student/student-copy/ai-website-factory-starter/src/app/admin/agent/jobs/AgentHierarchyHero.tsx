"use client";

/**
 * AgentHierarchyHero — Lovable-derived visual org chart for /admin/agent/jobs.
 *
 * Replaces the previous SeoAgentTeam component with the dark cyan-grid hero:
 * Main Agent (AKS) on top, five Experts on a T-connector bus below, each
 * expanding to show its skill_instructions parsed into sub-agent chips.
 * Live queued/running/done7d counts from AgentActivityMap render in the
 * expert cards, and the leader row keeps the page's primary CTAs
 * (+ New Job / Assign Jobs / + Add Agent).
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  Plus, Minus, Activity, ArrowUpRight, Trash2, AlertTriangle, TrendingUp,
  FileText, Link2, Settings2, Search, Palette, Feather,
  type LucideIcon,
} from "lucide-react";
import { RobotAvatar } from "./RobotAvatar";

export type AgentActivity = { queued: number; running: number; done7d: number };
export type AgentActivityMap = Record<string, AgentActivity>;

export interface HierarchyCapability {
  label: string;
  href?: string;
  backend?: string;
  hint?: string;
}

export interface HierarchyAgent {
  id: string;
  name: string;
  title: string;
  focus: string;
  isCustom: boolean;
  isActive: boolean;
  skillInstructions: string | null;
  capabilities: HierarchyCapability[];
}

export interface AgentHierarchyHeroProps {
  leader: HierarchyAgent;
  experts: HierarchyAgent[];
  activityByAgent: AgentActivityMap;
  totalActive: number;
  totalQueued: number;
  /** Server action bound at the page. Called on Delete confirm. */
  deleteAgentAction: (formData: FormData) => Promise<void>;
}

interface ExpertViz {
  accent: string;
  /** Solid hex used for RobotAvatar accent + dot indicators. */
  color: string;
  icon: LucideIcon;
  tag: string;
}

const EXPERT_VIZ: Record<string, ExpertViz> = {
  // Row order (see HERO_ROW_IDS in agent-roster.ts):
  // Research → Website Designer → Content Writer → On-Page Expert → Technical Expert → Ranking Monitor.
  research:    { accent: "from-emerald-400 to-teal-500",   color: "#34d399", icon: Search,      tag: "Intelligence & Trends" },
  techseo:     { accent: "from-rose-400 to-pink-500",      color: "#fb7185", icon: Palette,     tag: "Layout & Visual System" },
  blog:        { accent: "from-violet-400 to-fuchsia-500", color: "#a78bfa", icon: Feather,     tag: "Editorial & Voice" },
  onpage:      { accent: "from-cyan-400 to-sky-500",       color: "#22d3ee", icon: FileText,    tag: "Content & Structure" },
  technical:   { accent: "from-amber-400 to-orange-500",   color: "#fbbf24", icon: Settings2,   tag: "Crawl & Performance" },
  ranktracker: { accent: "from-lime-400 to-green-500",     color: "#84cc16", icon: TrendingUp,  tag: "Rank Tracking & Deltas" },
  // Legacy — hidden from the hero row (offpage is filtered out in jobs/page.tsx)
  // but kept here so any place that still hydrates the map by id gets a sensible viz.
  offpage:     { accent: "from-slate-400 to-slate-500",    color: "#94a3b8", icon: Link2,       tag: "Authority & Signals (legacy)" },
};

const FALLBACK_VIZ: ExpertViz = {
  accent: "from-slate-400 to-slate-500",
  color: "#94a3b8",
  icon: Search,
  tag: "Specialist",
};

interface Sub { name: string; desc: string }

// Parse skill_instructions blob into up to 4 sub-agent chips.
function parseSubs(instructions: string | null): Sub[] {
  if (!instructions) return [];
  const sentences = instructions
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 6);
  return sentences.slice(0, 4).map((sentence) => {
    const colonSplit = sentence.split(/\s*[—:–]\s+/);
    if (colonSplit.length >= 2 && colonSplit[0].length <= 40) {
      return { name: cap(colonSplit[0]), desc: colonSplit.slice(1).join(" ").replace(/\.$/, "") };
    }
    const words = sentence.split(/\s+/);
    const nameWords = words.slice(0, 4);
    const rest = words.slice(4).join(" ").replace(/\.$/, "");
    return { name: cap(nameWords.join(" ")), desc: rest || sentence };
  });
}

function cap(s: string): string {
  const trimmed = s.trim().replace(/^["']|["']$/g, "");
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function connectorClasses(idx: number, total: number) {
  const isFirst = idx === 0;
  const isLast = idx === total - 1;
  return {
    left: isFirst ? "hidden" : "hidden sm:block",
    right: isLast ? "hidden" : "hidden sm:block",
  };
}

export function AgentHierarchyHero({
  leader,
  experts,
  totalActive,
  totalQueued,
  deleteAgentAction,
}: AgentHierarchyHeroProps) {
  const [open, setOpen] = useState<string | null>(experts[0]?.id ?? null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    if (!open) return;
    const el = cardRefs.current[open];
    if (!el) return;
    const t = setTimeout(() => {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 200);
    return () => clearTimeout(t);
  }, [open]);

  const totalSubs = experts.reduce((n, e) => n + parseSubs(e.skillInstructions).length, 0);

  return (
    <div className="agent-hierarchy relative overflow-hidden rounded-2xl border border-cyan-400/20 bg-[#05070d] text-slate-200">
      {/* ambient glow + grid */}
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

      <div className="relative px-6 py-8 sm:py-10">
        {/* Header — status pill + primary CTAs on one row, right-aligned. */}
        <header className="flex flex-wrap items-center justify-end gap-2">
          <div className="flex shrink-0 items-center gap-2 rounded-full border border-cyan-500/20 bg-cyan-500/5 px-3 py-1.5 text-xs">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-400" />
            </span>
            <span className="text-cyan-200">All agents online</span>
          </div>
          <Link
            href="/admin/agent/roster/new"
            className="whitespace-nowrap rounded-md border border-cyan-400/30 bg-cyan-400/10 px-3 py-1.5 text-xs font-medium text-cyan-100 transition hover:bg-cyan-400/20"
          >
            + Add Agent
          </Link>
          <Link
            href="/admin/agent/tasks/new"
            className="whitespace-nowrap rounded-md border border-cyan-400/30 bg-cyan-400/10 px-3 py-1.5 text-xs font-medium text-cyan-100 transition hover:bg-cyan-400/20"
          >
            Assign Job
          </Link>
          <Link
            href="/admin/agent/jobs/new"
            className="whitespace-nowrap rounded-md border border-emerald-400/40 bg-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-100 shadow-[0_0_20px_rgba(52,211,153,0.35)] transition hover:bg-emerald-500/30"
          >
            + New Job
          </Link>
        </header>

        {/* Leader — centered scout-leader style with strong cyan glow. */}
        <section className="mt-8 flex flex-col items-center">
          <div className="relative w-full max-w-2xl">
            <div className="absolute inset-0 -m-6 rounded-3xl bg-gradient-to-r from-cyan-500/25 via-blue-500/25 to-cyan-500/25 blur-2xl" aria-hidden />
            <Link
              href={`/admin/agent/roster/${leader.id}`}
              className="relative flex items-center gap-5 rounded-2xl border border-cyan-400/40 bg-slate-950/70 px-6 py-5 backdrop-blur transition hover:border-cyan-400/70 hover:bg-slate-950/85 hover:shadow-[0_0_60px_rgba(34,211,238,0.35)]"
            >
              <RobotAvatar
                variant="leader"
                size={88}
                accent="#22d3ee"
                className="ring-2 ring-cyan-400/50 shadow-[0_0_40px_rgba(34,211,238,0.55)]"
              />
              <div className="min-w-0">
                <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-cyan-300/80">
                  Main Agent
                </div>
                <div className="truncate text-2xl font-semibold text-white">
                  {leader.title}
                </div>
                <div className="truncate text-xs text-slate-400">
                  Orchestrates {experts.length} experts · {totalSubs} sub-agents · {totalActive} active · {totalQueued} queued
                </div>
              </div>
            </Link>
          </div>

          <div className="mx-auto mt-2 h-8 w-px bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.5)]" aria-hidden />
        </section>

        {/* Experts grid — continuous horizontal bus above the row */}
        <section className="relative grid grid-cols-1 gap-x-5 gap-y-0 sm:grid-cols-2 lg:grid-cols-5">
          {/* Continuous horizontal bus across expert columns (large screens only) */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-0 right-0 top-4 hidden h-px bg-cyan-400 lg:block"
            style={{ boxShadow: "0 0 6px rgba(34,211,238,0.4)" }}
          />
          {experts.map((e, idx) => {
            const viz = EXPERT_VIZ[e.id] ?? FALLBACK_VIZ;
            const Icon = viz.icon;
            const isOpen = open === e.id;
            const conn = connectorClasses(idx, experts.length);
            const subs = parseSubs(e.skillInstructions);
            return (
              <div
                key={e.id}
                ref={(el) => {
                  cardRefs.current[e.id] = el;
                }}
                className="flex scroll-mt-24 flex-col"
              >
                {/* T-connector — vertical drop only; horizontal bus is drawn once across the section */}
                <div className="relative h-8 w-full" aria-hidden>
                  {/* Small-screen fallback horizontal (visible below lg where the continuous bus is hidden) */}
                  <div className={`absolute top-1/2 left-0 right-1/2 h-px -translate-y-1/2 bg-cyan-400 lg:hidden ${conn.left}`} />
                  <div className={`absolute top-1/2 left-1/2 right-0 h-px -translate-y-1/2 bg-cyan-400 lg:hidden ${conn.right}`} />
                  {/* Vertical drop into the card — visible on all sizes */}
                  <div
                    className={`absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-gradient-to-b ${viz.accent} ${isOpen ? "opacity-100" : "opacity-70"} transition-opacity duration-500`}
                  />
                </div>

                <div className="relative">
                  {/* Delete button — custom agents only, absolute-positioned so
                      it's a sibling of the expand button (avoids nested <button>). */}
                  {e.isCustom ? (
                    <button
                      type="button"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        setConfirmDeleteId(e.id);
                      }}
                      aria-label={`Delete ${e.title}`}
                      title={`Delete ${e.title}`}
                      className="absolute right-3 top-3 z-10 grid h-6 w-6 place-items-center rounded-full border border-rose-400/40 bg-rose-500/10 text-rose-200 shadow-sm transition hover:border-rose-400/70 hover:bg-rose-500/25"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : e.id)}
                    aria-expanded={isOpen}
                    className={`group relative w-full overflow-hidden rounded-xl border text-left transition-all duration-300 ease-out ${
                      isOpen
                        ? "-translate-y-0.5 border-cyan-400/60 bg-slate-900/80 shadow-[0_0_40px_rgba(34,211,238,0.25)] ring-1 ring-cyan-400/30"
                        : "border-slate-800 bg-slate-900/40 hover:-translate-y-0.5 hover:border-cyan-500/40 hover:bg-slate-900/70 hover:shadow-[0_0_20px_rgba(34,211,238,0.1)]"
                    } ${e.isActive ? "" : "opacity-60 grayscale"}`}
                  >
                    <div
                      className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r ${viz.accent} transition-opacity duration-300 ${
                        isOpen ? "opacity-100" : "opacity-60"
                      }`}
                      aria-hidden
                    />
                    <div className="p-4">
                      {/* Robot + expand/collapse button in the top row.
                          Robot is the visual anchor, matching the reference. */}
                      <div className="relative flex items-start justify-between">
                        <RobotAvatar variant="normal" size={80} accent={viz.color} />
                        <div
                          className={`relative grid h-6 w-6 place-items-center rounded-full border transition-all duration-300 ${
                            e.isCustom ? "mr-8" : ""
                          } ${
                            isOpen
                              ? "border-cyan-400/60 bg-cyan-400/15 text-cyan-200 shadow-[0_0_12px_rgba(34,211,238,0.5)]"
                              : "border-slate-700 bg-slate-900/60 text-slate-400 group-hover:border-cyan-500/40 group-hover:text-cyan-300"
                          }`}
                        >
                          <Plus className={`absolute h-3.5 w-3.5 transition-all duration-300 ${isOpen ? "rotate-90 opacity-0 scale-50" : "rotate-0 opacity-100 scale-100"}`} />
                          <Minus className={`absolute h-3.5 w-3.5 transition-all duration-300 ${isOpen ? "rotate-0 opacity-100 scale-100" : "-rotate-90 opacity-0 scale-50"}`} />
                        </div>
                      </div>

                      {/* Title row: role-icon glyph + expert title. */}
                      <div className="mt-5 flex items-center gap-2">
                        <span
                          className="grid h-6 w-6 shrink-0 place-items-center rounded-md shadow"
                          style={{ backgroundColor: `${viz.color}22`, color: viz.color }}
                          aria-hidden
                        >
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                        <div className="text-sm font-semibold leading-tight text-white">
                          {e.title}
                        </div>
                        {!e.isActive ? (
                          <span className="rounded-full border border-rose-400/40 bg-rose-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-rose-200">
                            OFF
                          </span>
                        ) : null}
                      </div>

                      {/* Category tag — e.g. "CONTENT & STRUCTURE". */}
                      <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                        {viz.tag}
                      </div>

                      {/* Bottom row: sub-agent count on the left with a small
                          pulsing dot + Profile pill on the right. Mirrors the
                          reference exactly. */}
                      <div className="mt-4 flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                          <Activity className="h-3 w-3" />
                          {subs.length} sub-agent{subs.length === 1 ? "" : "s"}
                        </div>
                        <Link
                          href={`/admin/agent/roster/${e.id}`}
                          onClick={(ev) => ev.stopPropagation()}
                          className="inline-flex items-center gap-1 rounded-md border border-cyan-400/30 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-cyan-200 transition hover:bg-cyan-400/20"
                        >
                          Profile <ArrowUpRight className="h-3 w-3" />
                        </Link>
                      </div>
                    </div>
                  </button>
                </div>

                {/* Expanded card body — sub-agents stacked directly under the
                    open expert card, mirroring the reference layout. A short
                    vertical connector links the expert card to the first
                    sub-agent tile so the parent → children relationship reads
                    at a glance. */}
                <div
                  className={`grid transition-[grid-template-rows,margin,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                    isOpen ? "mt-3 grid-rows-[1fr] opacity-100" : "mt-0 grid-rows-[0fr] opacity-0"
                  }`}
                >
                  <div className="overflow-hidden">
                    <div
                      className="mx-auto -mt-1 mb-2 h-3 w-px opacity-70"
                      style={{ background: `linear-gradient(to bottom, transparent, ${viz.color})` }}
                      aria-hidden
                    />

                    {subs.length > 0 ? (
                      <div className="space-y-2">
                        {subs.map((s, si) => (
                          <Link
                            key={`${s.name}-${si}`}
                            href={`/admin/agent/roster/${e.id}`}
                            style={{
                              animation: `subIn .45s cubic-bezier(0.22,1,0.36,1) ${si * 70}ms both`,
                              borderColor: `${viz.color}55`,
                              boxShadow: `0 0 0 1px ${viz.color}22`,
                            }}
                            className="group/sub relative flex items-start gap-3 rounded-lg border bg-slate-900/40 p-3 transition hover:-translate-y-0.5 hover:bg-slate-900/70"
                          >
                            <div
                              className="grid h-9 w-9 shrink-0 place-items-center rounded-md border"
                              style={{
                                borderColor: `${viz.color}55`,
                                backgroundColor: `${viz.color}14`,
                              }}
                            >
                              <ArrowUpRight
                                className="h-4 w-4 transition group-hover/sub:scale-110"
                                style={{ color: viz.color }}
                              />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-semibold leading-tight text-white">
                                {s.name}
                              </div>
                              {s.desc ? (
                                <div className="mt-0.5 text-[11px] leading-snug text-slate-400 line-clamp-2">
                                  {s.desc}
                                </div>
                              ) : null}
                            </div>
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <p className="rounded-lg border border-dashed border-slate-800/80 bg-slate-950/40 p-3 text-[11px] italic text-slate-500">
                        No sub-agents yet.{" "}
                        <Link href={`/admin/agent/roster/${e.id}`} className="text-cyan-300 hover:underline">
                          Edit profile →
                        </Link>
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </section>

      </div>

      <style>{`
        @keyframes subIn {
          from { opacity: 0; transform: translateY(8px) scale(0.98); filter: blur(2px); }
          to   { opacity: 1; transform: translateY(0)   scale(1);    filter: blur(0); }
        }
      `}</style>

      {/* Delete-agent confirmation modal — inline so it can call the server
          action via a plain form. Only rendered when an id is set. */}
      {confirmDeleteId ? (
        <ConfirmDeleteModal
          agent={experts.find((x) => x.id === confirmDeleteId) ?? null}
          onCancel={() => setConfirmDeleteId(null)}
          deleteAgentAction={deleteAgentAction}
        />
      ) : null}
    </div>
  );
}

function ConfirmDeleteModal({
  agent,
  onCancel,
  deleteAgentAction,
}: {
  agent: HierarchyAgent | null;
  onCancel: () => void;
  deleteAgentAction: (formData: FormData) => Promise<void>;
}) {
  if (!agent) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-agent-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-rose-400/30 bg-slate-950 p-6 shadow-[0_0_40px_rgba(244,63,94,0.25)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-rose-400/40 bg-rose-500/15 text-rose-200">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 id="delete-agent-title" className="text-base font-semibold text-white">
              Delete this agent?
            </h3>
            <p className="mt-1 text-xs text-slate-400">
              You&rsquo;re about to delete <span className="font-semibold text-slate-200">{agent.title}</span>.
              This removes the agent from the roster; queued and running jobs
              already assigned to it are not deleted, but no new jobs will route here.
            </p>
            <p className="mt-2 text-[11px] text-rose-300">This action cannot be undone.</p>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-xs font-medium text-slate-300 hover:border-slate-500"
          >
            Cancel
          </button>
          <form action={deleteAgentAction}>
            <input type="hidden" name="agentId" value={agent.id} />
            <button
              type="submit"
              className="rounded-md border border-rose-400/50 bg-rose-500/20 px-3 py-1.5 text-xs font-semibold text-rose-100 hover:bg-rose-500/35"
            >
              Delete agent
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

