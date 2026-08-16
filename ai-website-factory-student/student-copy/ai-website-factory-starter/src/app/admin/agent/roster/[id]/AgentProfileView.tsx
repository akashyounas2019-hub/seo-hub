"use client";

/**
 * AgentProfileView — Lovable-design agent profile page.
 *
 * Rendered by /admin/agent/roster/[id]/page.tsx. Receives fully-fetched
 * data (agent, KPIs, schedules, task history, sub-agents) from the server
 * and hosts the interactive Lovable design: dark cyan grid, gradient
 * accent bar per agent, chip stats, toggle chips, cards.
 *
 * Server bindings preserved verbatim:
 *   - saveAgentSkillAction   → Skill set save
 *   - resetAgentSkillAction  → Reset (built-ins only)
 *   - deleteCustomAgentAction → Delete agent (customs only)
 *   - createAgentScheduleAction → Assign & schedule task
 *   - deleteAgentScheduleAction → Scheduled tasks · delete row
 *
 * Ephemeral UI state (Active toggle · Notify · Autonomy · operator notes ·
 * default priority · preferred model) is persisted per-agent in
 * localStorage under aks-agent-profiles-v1, mirroring the Lovable ZIP's
 * saveProfiles behaviour.
 */

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowLeft, ArrowUpRight, CalendarClock, ListTodo, Plus, Sparkles,
  Trash2, Settings2, Bell, Cpu, Gauge, Power, UserPlus, FileText, Link2,
  Search, ShieldCheck, PenTool, Palette, Feather, Pencil, TrendingUp, Users, type LucideIcon,
} from "lucide-react";

interface AgentDto {
  id: string;
  name: string;
  title: string;
  focus: string;
  isCustom: boolean;
  isActive: boolean;
  skillInstructions: string | null;
}

interface KpiDto { queued: number; running: number; done: number; failed: number }

interface ScheduleDto {
  id: string;
  title: string;
  taskType: string;
  nextFireAtIso: string;
  recurrence: string;
  fireCount: number;
}

interface HistoryDto {
  id: string;
  title: string;
  status: string;
  siteSlug: string | null;
  siteName: string | null;
  createdAtIso: string;
  createdRelative: string;
}

interface SubAgentDto { name: string; desc: string }

interface CapabilityDto {
  label: string;
  href?: string;
  backend?: string;
  hint?: string;
}

interface FlashDto { tone: "ok" | "error"; msg: string }

export interface AgentProfileViewProps {
  agent: AgentDto;
  counts: KpiDto;
  schedules: ScheduleDto[];
  history: HistoryDto[];
  subAgents: SubAgentDto[];
  capabilities: CapabilityDto[];
  siblingExperts: { id: string; name: string; title: string }[];
  isBuiltIn: boolean;
  defaultSkill: string;
  flash: FlashDto | null;
  saveSkillAction: (formData: FormData) => Promise<void>;
  resetSkillAction: (formData: FormData) => Promise<void>;
  deleteAgentAction: (formData: FormData) => Promise<void>;
  createScheduleAction: (formData: FormData) => Promise<void>;
  deleteScheduleAction: (formData: FormData) => Promise<void>;
  setActiveAction: (formData: FormData) => Promise<void>;
  renameAction: (formData: FormData) => Promise<void>;
}

interface Viz { accent: string; icon: LucideIcon; tag: string }
// Keep in sync with EXPERT_VIZ in AgentHierarchyHero.tsx.
const VIZ: Record<string, Viz> = {
  leader:      { accent: "from-cyan-400 to-sky-500",       icon: Users,       tag: "Routing · Audit · Escalation" },
  research:    { accent: "from-emerald-400 to-teal-500",   icon: Search,      tag: "Intelligence & Trends" },
  techseo:     { accent: "from-rose-400 to-pink-500",      icon: Palette,     tag: "Layout & Visual System" },
  blog:        { accent: "from-violet-400 to-fuchsia-500", icon: Feather,     tag: "Editorial & Voice" },
  onpage:      { accent: "from-cyan-400 to-sky-500",       icon: FileText,    tag: "Content & Structure" },
  technical:   { accent: "from-amber-400 to-orange-500",   icon: Settings2,   tag: "Crawl & Performance" },
  ranktracker: { accent: "from-lime-400 to-green-500",     icon: TrendingUp,  tag: "Rank Tracking & Deltas" },
  offpage:     { accent: "from-slate-400 to-slate-500",    icon: Link2,       tag: "Authority & Signals (legacy)" },
};
const FALLBACK: Viz = { accent: "from-slate-400 to-slate-500", icon: Search, tag: "Specialist" };

const MODEL_OPTIONS = [
  { id: "claude-opus-4-7",   label: "Opus 4.7 · most capable" },
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6 · faster" },
  { id: "claude-haiku-4-5",  label: "Haiku 4.5 · cheapest" },
];

interface LocalState {
  notify: boolean;
  autonomy: number;
  notes: string;
  defaultPriority: "low" | "medium" | "high";
  model: string;
}
const DEFAULT_LOCAL: LocalState = {
  notify: true,
  autonomy: 60,
  notes: "",
  defaultPriority: "medium",
  model: "claude-opus-4-7",
};
const STORAGE_KEY = "aks-agent-profiles-v1";
type StoredMap = Record<string, LocalState>;

function loadLocal(id: string): LocalState {
  if (typeof window === "undefined") return DEFAULT_LOCAL;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_LOCAL;
    const map = JSON.parse(raw) as StoredMap;
    return { ...DEFAULT_LOCAL, ...(map[id] ?? {}) };
  } catch { return DEFAULT_LOCAL; }
}
function saveLocal(id: string, next: LocalState) {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const map: StoredMap = raw ? JSON.parse(raw) : {};
    map[id] = next;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {}
}

export function AgentProfileView(props: AgentProfileViewProps) {
  const {
    agent, counts, schedules, history, subAgents, capabilities, siblingExperts,
    isBuiltIn, defaultSkill, flash,
    saveSkillAction, resetSkillAction, deleteAgentAction,
    createScheduleAction, deleteScheduleAction, setActiveAction, renameAction,
  } = props;

  // Edit-identity form is collapsed by default so it doesn't crowd the hero.
  const [editingIdentity, setEditingIdentity] = useState(false);

  const viz = VIZ[agent.id] ?? FALLBACK;
  const Icon = viz.icon;
  const isLeader = agent.id === "leader";
  const roleWord = agent.title;   // e.g. "On-page Expert" — used in helper copy in place of the person's name

  const [local, setLocal] = useState<LocalState>(DEFAULT_LOCAL);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setLocal(loadLocal(agent.id));
    setHydrated(true);
  }, [agent.id]);
  useEffect(() => {
    if (!hydrated) return;
    saveLocal(agent.id, local);
  }, [local, agent.id, hydrated]);
  const patch = (p: Partial<LocalState>) => setLocal((prev) => ({ ...prev, ...p }));

  const totalTasks = counts.queued + counts.running + counts.done + counts.failed;

  return (
    <div className="agent-profile relative min-h-screen overflow-hidden border-y border-cyan-400/20 bg-[#05070d] text-slate-200">
      {/* ambient */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute top-[-10%] left-1/2 h-[500px] w-[900px] -translate-x-1/2 rounded-full bg-cyan-500/10 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.10]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(56,189,248,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,.08) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
      </div>

      <div className="relative px-4 py-8 sm:px-6 sm:py-10">
        {/* Breadcrumb / back */}
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/admin/agent/jobs"
            className="inline-flex items-center gap-2 rounded-md border border-slate-800 bg-slate-900/40 px-3 py-1.5 text-xs text-slate-300 transition hover:border-cyan-400/40 hover:text-cyan-200"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to console
          </Link>
          <div className="text-xs text-slate-500">
            <Link href="/admin/agent/jobs" className="hover:text-cyan-300">Console</Link>
            <span className="mx-1.5">/</span>
            <span className="text-slate-300">{agent.title}</span>
          </div>
        </div>

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

        {/* HERO */}
        <section className="mt-6 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/60 backdrop-blur">
          <div className={`h-1 w-full bg-gradient-to-r ${viz.accent}`} aria-hidden />
          <div className="grid gap-5 p-6 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
            <div className="relative grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-2xl bg-slate-900/60 ring-1 ring-cyan-400/40 shadow-[0_0_30px_rgba(34,211,238,0.35)]">
              <div className={`absolute inset-0 bg-gradient-to-br ${viz.accent} opacity-20`} aria-hidden />
              <Icon className="relative h-9 w-9 text-slate-100" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-2">
                <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-cyan-300/80">
                  Agent Profile
                </div>
                <span className="rounded-full border border-slate-700 bg-slate-900/60 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-300">
                  {agent.isCustom ? "Custom" : "Built-in"}
                </span>
                {!agent.isActive ? (
                  <span className="rounded-full border border-rose-400/40 bg-rose-500/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-rose-200">
                    OFF
                  </span>
                ) : null}
              </div>
              <div className="mt-1 flex items-center gap-2">
                <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-md bg-gradient-to-br ${viz.accent} shadow`} aria-hidden>
                  <Icon className="h-4 w-4 text-slate-950" />
                </span>
                <h1 className="truncate text-2xl font-semibold text-white">
                  {agent.title}
                </h1>
                <button
                  type="button"
                  onClick={() => setEditingIdentity((s) => !s)}
                  aria-expanded={editingIdentity}
                  aria-label={editingIdentity ? "Close edit identity" : "Edit identity"}
                  title={editingIdentity ? "Close" : "Edit name, title, focus"}
                  className={`ml-1 inline-flex h-6 w-6 items-center justify-center rounded-md border transition ${
                    editingIdentity
                      ? "border-cyan-400/60 bg-cyan-400/15 text-cyan-200"
                      : "border-slate-700 bg-slate-900/60 text-slate-400 hover:border-cyan-400/40 hover:text-cyan-200"
                  }`}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                {viz.tag} · {subAgents.length} sub-agent{subAgents.length === 1 ? "" : "s"}
                {isLeader ? "" : " · reports to AKS SEO Team Leader"}
                {agent.focus ? ` · ${agent.focus}` : ""}
              </p>

              {/* Inline Edit-identity form. Server action = renameAction. */}
              {editingIdentity ? (
                <form
                  action={renameAction}
                  className="mt-3 grid gap-2 rounded-lg border border-cyan-400/30 bg-slate-950/60 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
                >
                  <input type="hidden" name="agentId" value={agent.id} />
                  <label className="block sm:col-span-1">
                    <span className="block text-[10px] uppercase tracking-wider text-slate-400">Display name</span>
                    <input
                      name="name"
                      defaultValue={agent.name}
                      required
                      minLength={2}
                      className="mt-1 w-full rounded-md border border-slate-800 bg-slate-900/60 px-2 py-1 text-xs text-slate-100 focus:border-cyan-400/60 focus:outline-none"
                    />
                  </label>
                  <label className="block sm:col-span-1">
                    <span className="block text-[10px] uppercase tracking-wider text-slate-400">Role title</span>
                    <input
                      name="title"
                      defaultValue={agent.title}
                      className="mt-1 w-full rounded-md border border-slate-800 bg-slate-900/60 px-2 py-1 text-xs text-slate-100 focus:border-cyan-400/60 focus:outline-none"
                    />
                  </label>
                  <label className="block sm:col-span-1">
                    <span className="block text-[10px] uppercase tracking-wider text-slate-400">Focus tag</span>
                    <input
                      name="focus"
                      defaultValue={agent.focus ?? ""}
                      placeholder="one-line summary"
                      className="mt-1 w-full rounded-md border border-slate-800 bg-slate-900/60 px-2 py-1 text-xs text-slate-100 focus:border-cyan-400/60 focus:outline-none"
                    />
                  </label>
                  <div className="flex items-end gap-1.5">
                    <button
                      type="submit"
                      className={`rounded-md bg-gradient-to-r ${viz.accent} px-3 py-1.5 text-[11px] font-semibold text-slate-950 shadow hover:opacity-90`}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingIdentity(false)}
                      className="rounded-md border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-[11px] text-slate-300 hover:border-slate-500"
                    >
                      Cancel
                    </button>
                  </div>
                  <p className="text-[10px] italic text-slate-500 sm:col-span-full">
                    Database id ({agent.id}) is never renamed — job routing keeps working.
                  </p>
                </form>
              ) : null}
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              <StatChip label="Queued" value={counts.queued} />
              <StatChip label="Running" value={counts.running} tone="warn" />
              <StatChip label="Done" value={counts.done} tone="ok" />
              <StatChip label="Failed" value={counts.failed} tone={counts.failed > 0 ? "warn" : "default"} />
              {/* Active is server-persisted (agent_profiles.is_active).
                  Uses a plain form submit so the change flows through
                  setActiveAction and revalidates the jobs page too. */}
              <form action={setActiveAction}>
                <input type="hidden" name="agentId" value={agent.id} />
                <input type="hidden" name="isActive" value={agent.isActive ? "false" : "true"} />
                <ActiveToggleButton
                  isActive={agent.isActive}
                  activeAccent={viz.accent}
                />
              </form>
              <ToggleChip
                label="Notify"
                icon={<Bell className="h-3.5 w-3.5" />}
                checked={local.notify}
                onCheckedChange={(v) => patch({ notify: v })}
                activeAccent={viz.accent}
              />
              {agent.isCustom ? (
                <form action={deleteAgentAction}>
                  <input type="hidden" name="agentId" value={agent.id} />
                  <button
                    type="submit"
                    className="rounded-md border border-rose-400/40 bg-rose-500/10 px-2.5 py-1.5 text-[11px] font-medium text-rose-200 hover:bg-rose-500/20"
                  >
                    <Trash2 className="inline h-3 w-3 mr-1" /> Delete
                  </button>
                </form>
              ) : null}
            </div>
          </div>
        </section>

        {/* MAIN GRID */}
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          {/* LEFT COLUMN */}
          <div className="space-y-6 lg:col-span-1">
            {/* Skill set */}
            <Card title="Skill instructions" icon={<Sparkles className="h-4 w-4" />} accent={viz.accent}>
              <form action={saveSkillAction} className="space-y-3">
                <input type="hidden" name="agentId" value={agent.id} />
                <textarea
                  name="skillInstructions"
                  defaultValue={agent.skillInstructions ?? ""}
                  rows={7}
                  placeholder={defaultSkill || "Add task-specific instructions for this agent…"}
                  className="min-h-[140px] w-full resize-y rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2 font-mono text-[12px] leading-relaxed text-slate-100 focus:border-cyan-400/60 focus:outline-none"
                />
                <p className="text-[11px] text-slate-500">
                  Appended to every job assigned to the {roleWord}. Saved to the server.
                </p>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="submit"
                    className={`rounded-md bg-gradient-to-r ${viz.accent} px-3 py-1.5 text-[11px] font-semibold text-slate-950 shadow hover:opacity-90`}
                  >
                    Save instructions
                  </button>
                </div>
              </form>
              {isBuiltIn ? (
                <form action={resetSkillAction} className="mt-2 flex justify-end">
                  <input type="hidden" name="agentId" value={agent.id} />
                  <button
                    type="submit"
                    className="rounded-md border border-slate-700 bg-slate-900/50 px-3 py-1.5 text-[11px] text-slate-300 hover:border-cyan-400/40 hover:text-cyan-200"
                  >
                    Reset to default
                  </button>
                </form>
              ) : null}
            </Card>

            {/* Wired capabilities — the merge glue from Categories 2–5.
                Each row is either a clickable tool page (href) or a documented
                backend module (backend). Empty state prompts the operator to
                extend AGENT_CAPABILITIES in src/lib/agent-capabilities.ts. */}
            <Card
              title={`Wired capabilities (${capabilities.length})`}
              icon={<Sparkles className="h-4 w-4" />}
              accent={viz.accent}
            >
              {capabilities.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-800 bg-slate-900/30 p-4 text-center text-[11px] italic text-slate-500">
                  Not yet wired to any Category 2–5 workflow.
                </div>
              ) : (
                <ul className="space-y-2">
                  {capabilities.map((c, i) => (
                    <li key={`${c.label}-${i}`}>
                      {c.href ? (
                        <Link
                          href={c.href}
                          className="group/cap relative flex items-center gap-2 rounded-lg border border-slate-800/80 bg-slate-950/60 p-2.5 transition hover:border-cyan-400/40 hover:bg-slate-900/60"
                        >
                          <span className={`h-1.5 w-1.5 rounded-full bg-gradient-to-r ${viz.accent}`} aria-hidden />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-xs font-medium text-slate-100">{c.label}</div>
                            {c.hint ? (
                              <div className="truncate text-[11px] text-slate-500">{c.hint}</div>
                            ) : null}
                          </div>
                          <span className="rounded bg-slate-800/70 px-1.5 py-0.5 font-mono text-[9px] text-slate-400">{c.href}</span>
                          <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-slate-500 opacity-0 transition group-hover/cap:opacity-100" />
                        </Link>
                      ) : (
                        <div className="flex items-center gap-2 rounded-lg border border-slate-800/60 bg-slate-950/40 p-2.5">
                          <span className={`h-1.5 w-1.5 rounded-full bg-gradient-to-r ${viz.accent}`} aria-hidden />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-xs font-medium text-slate-100">{c.label}</div>
                            {c.hint ? (
                              <div className="truncate text-[11px] text-slate-500">{c.hint}</div>
                            ) : null}
                          </div>
                          <span className="rounded bg-slate-800/70 px-1.5 py-0.5 font-mono text-[9px] text-slate-400">
                            {c.backend}
                          </span>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {/* Sub-agents (parsed from skill_instructions) */}
            <Card
              title={`Sub-agents (${subAgents.length})`}
              icon={<ListTodo className="h-4 w-4" />}
              accent={viz.accent}
              action={
                <Link
                  href={`/admin/agent/roster/new?parent=${encodeURIComponent(agent.id)}`}
                  className="inline-flex items-center gap-1 rounded-md border border-cyan-400/30 bg-cyan-400/10 px-2 py-1 text-[11px] font-medium text-cyan-200 transition hover:bg-cyan-400/20"
                >
                  <UserPlus className="h-3 w-3" /> Add
                </Link>
              }
            >
              {subAgents.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-800 bg-slate-900/30 p-4 text-center text-[11px] italic text-slate-500">
                  No sub-agents yet — add skill instructions above.
                </div>
              ) : (
                <ul className="space-y-2">
                  {subAgents.map((s, i) => (
                    <li key={s.name + i}>
                      <div className="group/sub relative flex items-center gap-2 rounded-lg border border-slate-800/80 bg-slate-950/60 p-2.5 transition hover:border-cyan-400/40 hover:bg-slate-900/60">
                        <span className="relative grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-md bg-slate-900 ring-1 ring-slate-700/60">
                          <span className={`absolute inset-0 bg-gradient-to-br ${viz.accent} opacity-25`} aria-hidden />
                          <Icon className="relative h-4 w-4 text-slate-100" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-medium text-slate-100">{s.name}</div>
                          {s.desc ? (
                            <div className="truncate text-[11px] text-slate-500">{s.desc}</div>
                          ) : null}
                        </div>
                        <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-slate-500 opacity-0 transition group-hover/sub:opacity-100" />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {/* Sibling experts (only shown for non-leaders) */}
            {!isLeader && siblingExperts.length > 0 ? (
              <Card title="Team" icon={<Users className="h-4 w-4" />} accent={viz.accent}>
                <ul className="space-y-2">
                  {siblingExperts.map((sib) => {
                    const sibViz = VIZ[sib.id] ?? FALLBACK;
                    return (
                      <li key={sib.id}>
                        <Link
                          href={`/admin/agent/roster/${sib.id}`}
                          className="group/tm flex items-center gap-2 rounded-lg border border-slate-800/80 bg-slate-950/60 p-2.5 transition hover:border-cyan-400/40 hover:bg-slate-900/60"
                        >
                          <span className={`h-1.5 w-1.5 rounded-full bg-gradient-to-r ${sibViz.accent}`} aria-hidden />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-xs font-medium text-slate-100">{sib.title}</div>
                          </div>
                          <ArrowUpRight className="h-3.5 w-3.5 text-slate-500 opacity-0 transition group-hover/tm:opacity-100" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            ) : null}
          </div>

          {/* RIGHT COLUMN */}
          <div className="space-y-6 lg:col-span-2">
            {/* Assign & schedule task — wired to createAgentScheduleAction */}
            <Card
              title="Assign & schedule task"
              icon={<CalendarClock className="h-4 w-4" />}
              accent={viz.accent}
            >
              <form action={createScheduleAction} className="space-y-3">
                <input type="hidden" name="agentId" value={agent.id} />
                <input
                  name="title"
                  type="text"
                  required
                  placeholder="Task title (e.g. Audit homepage schema)"
                  className="h-10 w-full rounded-md border border-slate-800 bg-slate-900/60 px-3 text-sm text-slate-100 focus:border-cyan-400/60 focus:outline-none"
                />
                <div className="grid gap-2 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-[11px] text-slate-400">Task type</label>
                    <select
                      name="taskType"
                      defaultValue="custom"
                      className="h-9 w-full rounded-md border border-slate-800 bg-slate-900/60 px-2 text-sm text-slate-100"
                    >
                      <option value="custom">Custom Task</option>
                      <option value="blog_writing">Blog Writing</option>
                      <option value="on_page_optimisation">On-page Optimisation</option>
                      <option value="backlink_building">Backlink Building</option>
                      <option value="technical_audit">Technical Audit</option>
                      <option value="schema_markup">Schema Markup</option>
                      <option value="sitemap_refresh">Sitemap Refresh</option>
                      <option value="content_brief">Content Brief</option>
                      <option value="keyword_research">Keyword Research</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] text-slate-400">Run at</label>
                    <input
                      name="runAt"
                      type="datetime-local"
                      required
                      className="h-9 w-full rounded-md border border-slate-800 bg-slate-900/60 px-2 text-sm text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] text-slate-400">Recurrence</label>
                    <select
                      name="recurrence"
                      defaultValue="once"
                      className="h-9 w-full rounded-md border border-slate-800 bg-slate-900/60 px-2 text-sm text-slate-100"
                    >
                      <option value="once">Once</option>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </div>
                </div>
                <textarea
                  name="instructions"
                  rows={3}
                  placeholder="Instructions (optional) — extra context for the agent…"
                  className="w-full resize-y rounded-md border border-slate-800 bg-slate-900/60 p-2.5 font-mono text-[11px] text-slate-100 focus:border-cyan-400/60 focus:outline-none"
                />
                <button
                  type="submit"
                  className={`w-full rounded-md bg-gradient-to-r ${viz.accent} px-4 py-2.5 text-sm font-semibold text-slate-950 shadow hover:opacity-90`}
                >
                  <Plus className="mr-1 inline h-4 w-4" /> Schedule task
                </button>
              </form>
            </Card>

            {/* Scheduled tasks — from agent_schedules */}
            <Card
              title={`Scheduled tasks (${schedules.length})`}
              icon={<ListTodo className="h-4 w-4" />}
              accent={viz.accent}
            >
              {schedules.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-800 bg-slate-900/30 p-6 text-center text-xs text-slate-500">
                  No tasks scheduled yet.
                </div>
              ) : (
                <div className="max-h-[380px] space-y-2 overflow-auto pr-1">
                  {schedules.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-900/50 p-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm text-slate-100">{s.title}</div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                          <span className="rounded bg-slate-800/70 px-1.5 py-0.5 font-mono text-slate-300">
                            {s.taskType}
                          </span>
                          <span className="flex items-center gap-1">
                            <CalendarClock className="h-3 w-3" />
                            {new Date(s.nextFireAtIso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                          </span>
                          <span className="capitalize">{s.recurrence}</span>
                          <span>Fires: {s.fireCount}</span>
                        </div>
                      </div>
                      <form action={deleteScheduleAction}>
                        <input type="hidden" name="scheduleId" value={s.id} />
                        <input type="hidden" name="agentId" value={agent.id} />
                        <button
                          type="submit"
                          className="rounded-md p-1.5 text-slate-500 transition hover:bg-slate-800 hover:text-rose-300"
                          aria-label="Remove scheduled task"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </form>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Agent settings — pure local state */}
            <Card title="Agent settings" icon={<Settings2 className="h-4 w-4" />} accent={viz.accent}>
              <div className="grid gap-4 sm:grid-cols-2">
                <SettingRow icon={<Gauge className="h-4 w-4" />} label="Default priority">
                  <select
                    value={local.defaultPriority}
                    onChange={(e) => patch({ defaultPriority: e.target.value as LocalState["defaultPriority"] })}
                    className="h-8 rounded-md border border-slate-800 bg-slate-900/60 px-2 text-xs text-slate-100"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </SettingRow>
                <SettingRow icon={<Cpu className="h-4 w-4" />} label="Model">
                  <select
                    value={local.model}
                    onChange={(e) => patch({ model: e.target.value })}
                    className="h-8 rounded-md border border-slate-800 bg-slate-900/60 px-2 text-xs text-slate-100"
                  >
                    {MODEL_OPTIONS.map((m) => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))}
                  </select>
                </SettingRow>
                <div className="sm:col-span-2">
                  <label className="mb-2 block text-[11px] text-slate-400">
                    Autonomy level — {local.autonomy}%
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={local.autonomy}
                    onChange={(e) => patch({ autonomy: Number(e.target.value) })}
                    className="w-full accent-cyan-400"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-[11px] text-slate-400">Operator notes</label>
                  <textarea
                    value={local.notes}
                    onChange={(e) => patch({ notes: e.target.value })}
                    placeholder="Runbook, quirks, escalation contacts…"
                    rows={3}
                    className="min-h-[90px] w-full resize-y rounded-md border border-slate-800 bg-slate-900/60 p-2.5 text-xs text-slate-100 focus:border-cyan-400/60 focus:outline-none"
                  />
                  <p className="mt-1 text-[10px] text-slate-500">Saved locally to this browser.</p>
                </div>
              </div>
            </Card>

            {/* Task history — from claude_jobs */}
            <Card title={`Task history (${history.length})`} icon={<ListTodo className="h-4 w-4" />} accent={viz.accent}>
              {history.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-800 bg-slate-900/30 p-6 text-center text-xs text-slate-500">
                  No tasks yet for the {roleWord}. {totalTasks === 0 ? "" : "(All history archived.)"}
                </div>
              ) : (
                <ul className="space-y-2">
                  {history.map((h) => (
                    <li key={h.id}>
                      <Link
                        href={`/admin/agent/jobs/${h.id}`}
                        className="group/hist flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-900/50 p-3 transition hover:border-cyan-400/40 hover:bg-slate-900/70"
                      >
                        <StatusPill status={h.status} />
                        <span className="min-w-0 flex-1 truncate text-xs text-slate-100">{h.title}</span>
                        {h.siteName ? (
                          <span className="shrink-0 text-[11px] text-slate-500">{h.siteName}</span>
                        ) : null}
                        <span className="shrink-0 text-[11px] text-slate-500">{h.createdRelative}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────── atoms ─────────── */

function Card({
  title,
  icon,
  accent,
  action,
  children,
}: {
  title: string;
  icon: ReactNode;
  accent: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950/60 backdrop-blur">
      <div className={`h-px w-full bg-gradient-to-r ${accent}`} aria-hidden />
      <div className="flex items-center justify-between border-b border-slate-800/70 px-4 py-2.5">
        <div className="flex items-center gap-2 text-cyan-200">
          <span className={`grid h-6 w-6 place-items-center rounded-md bg-gradient-to-br ${accent} text-slate-950`} aria-hidden>
            {icon}
          </span>
          <span className="text-sm font-semibold text-white">{title}</span>
        </div>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function SettingRow({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2">
      <div className="flex items-center gap-2 text-xs text-slate-300">
        <span className="text-slate-400">{icon}</span>
        {label}
      </div>
      {children}
    </div>
  );
}

function StatChip({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string | number;
  tone?: "default" | "ok" | "warn";
}) {
  const toneCls =
    tone === "ok"
      ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
      : tone === "warn"
        ? "border-amber-400/30 bg-amber-400/10 text-amber-200"
        : "border-slate-800 bg-slate-900/60 text-slate-200";
  return (
    <div className={`rounded-lg border px-3 py-1.5 text-center ${toneCls}`}>
      <div className="text-[10px] uppercase tracking-wider opacity-70">{label}</div>
      <div className="text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function ToggleChip({
  label,
  icon,
  checked,
  onCheckedChange,
  activeAccent,
}: {
  label: string;
  icon: ReactNode;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  activeAccent: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
      className={`group inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition ${
        checked
          ? "border-cyan-400/40 bg-slate-900/70 shadow-[0_0_16px_rgba(34,211,238,0.15)]"
          : "border-slate-800 bg-slate-900/40 hover:border-slate-700"
      }`}
    >
      <span
        className={`grid h-6 w-6 place-items-center rounded-md transition ${
          checked ? `bg-gradient-to-br ${activeAccent} text-slate-950` : "bg-slate-800 text-slate-500"
        }`}
      >
        {icon}
      </span>
      <span className="flex flex-col leading-none">
        <span className="text-[9px] uppercase tracking-wider text-slate-400">{label}</span>
        <span className={`text-xs font-semibold ${checked ? "text-cyan-100" : "text-slate-400"}`}>
          {checked ? "On" : "Off"}
        </span>
      </span>
      <span
        className={`relative ml-1 inline-flex h-4 w-7 shrink-0 items-center rounded-full transition ${
          checked ? "bg-cyan-400/80" : "bg-slate-700"
        }`}
        aria-hidden
      >
        <span
          className={`inline-block h-3 w-3 transform rounded-full bg-slate-950 shadow transition ${
            checked ? "translate-x-3.5" : "translate-x-0.5"
          }`}
        />
      </span>
    </button>
  );
}

/**
 * Server-form-submit variant of the ToggleChip for the Active flag.
 * Looks identical to ToggleChip but is a <button type="submit"> inside a
 * <form action={setActiveAction}>; the hidden inputs above carry the
 * agentId + the new isActive value (already flipped).
 */
function ActiveToggleButton({
  isActive,
  activeAccent,
}: {
  isActive: boolean;
  activeAccent: string;
}) {
  return (
    <button
      type="submit"
      role="switch"
      aria-checked={isActive}
      aria-label={isActive ? "Deactivate agent" : "Activate agent"}
      title={isActive ? "Click to deactivate — agent shows OFF" : "Click to activate"}
      className={`group inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition ${
        isActive
          ? "border-cyan-400/40 bg-slate-900/70 shadow-[0_0_16px_rgba(34,211,238,0.15)]"
          : "border-rose-400/40 bg-slate-900/40 hover:border-rose-400/60"
      }`}
    >
      <span
        className={`grid h-6 w-6 place-items-center rounded-md transition ${
          isActive ? `bg-gradient-to-br ${activeAccent} text-slate-950` : "bg-rose-500/20 text-rose-200"
        }`}
      >
        <Power className="h-3.5 w-3.5" />
      </span>
      <span className="flex flex-col leading-none">
        <span className="text-[9px] uppercase tracking-wider text-slate-400">Active</span>
        <span className={`text-xs font-semibold ${isActive ? "text-cyan-100" : "text-rose-200"}`}>
          {isActive ? "On" : "Off"}
        </span>
      </span>
      <span
        className={`relative ml-1 inline-flex h-4 w-7 shrink-0 items-center rounded-full transition ${
          isActive ? "bg-cyan-400/80" : "bg-rose-400/70"
        }`}
        aria-hidden
      >
        <span
          className={`inline-block h-3 w-3 transform rounded-full bg-slate-950 shadow transition ${
            isActive ? "translate-x-3.5" : "translate-x-0.5"
          }`}
        />
      </span>
    </button>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "done" ? "bg-emerald-500/20 text-emerald-200 border-emerald-400/30" :
    status === "failed" ? "bg-rose-500/20 text-rose-200 border-rose-400/30" :
    status === "running" || status === "claimed" ? "bg-cyan-500/20 text-cyan-200 border-cyan-400/30" :
    status === "cancelled" ? "bg-slate-700/40 text-slate-300 border-slate-600/40" :
    "bg-amber-500/20 text-amber-200 border-amber-400/30";
  return (
    <span className={`inline-flex shrink-0 items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${tone}`}>
      {status}
    </span>
  );
}

// Keep the import list happy in strict mode: intentionally re-export used types
export type { AgentDto, KpiDto, ScheduleDto, HistoryDto, SubAgentDto, FlashDto };
