import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  Plus,
  Minus,
  Activity,
  ArrowUpRight,
  UserPlus,
  ClipboardList,
  Sparkles,
  Users,
  Zap,
  PowerOff,
  X,
  Search,
  FileText,
  Palette,
  MapPin,
  Target,
  ClipboardCheck,
  Wrench,
  BarChart3,
  Rocket,
  Bot,
  ShieldCheck,
  Globe,
  Network,
  AlertTriangle,
  CheckCircle2,
  type LucideIcon,
} from "lucide-react";

import agentBot from "@/assets/agent-bot.png";
import leaderBot from "@/assets/leader-bot.png";
import { EXPERTS, buildSubAgentId } from "@/lib/agents";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Agents — AKS SEO Console" },
      {
        name: "description",
        content:
          "Manage the AKS agent fleet: total, working, and offline agents at a glance, with the leader and specialist sub-agent hierarchy.",
      },
      { property: "og:title", content: "Agents — AKS SEO Console" },
      {
        property: "og:description",
        content:
          "Add, assign, and orchestrate specialist SEO agents from a single control surface.",
      },
    ],
  }),
  component: Index,
});

const ICON_CHOICES: { id: string; icon: LucideIcon; label: string }[] = [
  { id: "search", icon: Search, label: "Keyword" },
  { id: "content", icon: FileText, label: "Content" },
  { id: "design", icon: Palette, label: "Design" },
  { id: "local", icon: MapPin, label: "Local" },
  { id: "target", icon: Target, label: "Competitor" },
  { id: "audit", icon: ClipboardCheck, label: "Audit" },
  { id: "tech", icon: Wrench, label: "Technical" },
  { id: "analytics", icon: BarChart3, label: "Analytics" },
  { id: "growth", icon: Rocket, label: "Growth" },
  { id: "bot", icon: Bot, label: "Assistant" },
  { id: "shield", icon: ShieldCheck, label: "Security" },
  { id: "globe", icon: Globe, label: "International" },
];

const ACCENT_CHOICES = [
  "from-cyan-400 to-sky-500",
  "from-violet-400 to-fuchsia-500",
  "from-amber-400 to-orange-500",
  "from-emerald-400 to-teal-500",
  "from-rose-400 to-pink-500",
  "from-indigo-400 to-blue-500",
];

type CustomAgent = { id: string; name: string; iconId: string; accent: string; role: string };

// Per-index bus-half visibility for 5 experts at breakpoints:
// base = 1 col (both halves hidden), sm = 2 cols, lg = 5 cols (single row).
// Hide "left half" when the item is a row-start; hide "right half" when it's a row-end.
const CONNECTOR_CLASSES: { left: string; right: string }[] = [
  { left: "hidden", right: "hidden sm:block" },
  { left: "hidden sm:block", right: "hidden sm:hidden lg:block" },
  { left: "hidden sm:hidden lg:block", right: "hidden sm:block" },
  { left: "hidden sm:block", right: "hidden sm:hidden lg:block" },
  { left: "hidden sm:hidden lg:block", right: "hidden" },
];

function Index() {
  const [open, setOpen] = useState<string | null>("onpage");
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [showAdd, setShowAdd] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [showNewJob, setShowNewJob] = useState(false);
  const [customAgents, setCustomAgents] = useState<CustomAgent[]>([]);

  useEffect(() => {
    if (!open) return;
    const el = cardRefs.current[open];
    if (!el) return;
    const t = setTimeout(() => {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 200);
    return () => clearTimeout(t);
  }, [open]);

  const totalSubs = EXPERTS.reduce((a, e) => a + e.subs.length, 0);
  const totalAgents = 1 /* leader */ + EXPERTS.length + totalSubs + customAgents.length;
  const working = Math.round(totalAgents * 0.72);
  const offline = totalAgents - working;

  return (
    <div className="min-h-screen bg-[#05070d] text-slate-200 relative overflow-hidden">
      {/* ambient glow */}
      <div className="pointer-events-none absolute inset-0">
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

      <div className="relative mx-auto max-w-7xl px-6 py-10">
        {/* Fleet Control top bar: title + horizontal action row */}
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-slate-900/60 ring-1 ring-cyan-400/30 shadow-[0_0_30px_rgba(34,211,238,0.35)]">
              <img src={agentBot} alt="" className="h-full w-full object-contain" loading="lazy" width={512} height={512} />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-cyan-300/80">
                Fleet Control
              </div>
              <h1 className="truncate text-xl font-semibold tracking-tight text-white">Agent Fleet Control</h1>
              <p className="truncate text-xs text-slate-400">
                Orchestrate the AKS SEO agent hierarchy
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setShowAdd(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-gradient-to-r from-cyan-500 to-blue-600 px-3 py-2 text-[12px] font-semibold text-white shadow-[0_0_18px_rgba(34,211,238,0.35)] transition hover:brightness-110"
            >
              <UserPlus className="h-3.5 w-3.5" /> Add Agent
            </button>
            <button
              onClick={() => setShowAssign(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 text-[12px] font-semibold text-cyan-100 transition hover:bg-cyan-400/20"
            >
              <ClipboardList className="h-3.5 w-3.5" /> Assign Job
            </button>
            <button
              onClick={() => setShowNewJob(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900/70 px-3 py-2 text-[12px] font-semibold text-slate-200 transition hover:border-cyan-400/40 hover:text-white"
            >
              <Sparkles className="h-3.5 w-3.5" /> New Job
            </button>
          </div>
        </header>

        {/* Detailed summary cards */}
        <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { k: "Total Agents", v: totalAgents, sub: "in fleet", a: "from-cyan-400 to-blue-500", i: Users },
            { k: "Working", v: working, sub: "active jobs", a: "from-emerald-400 to-teal-500", i: Zap, pulse: true },
            { k: "Offline", v: offline, sub: "idle / paused", a: "from-slate-500 to-slate-700", i: PowerOff },
            { k: "Sub-agents", v: totalSubs, sub: "across experts", a: "from-violet-400 to-fuchsia-500", i: Network },
            { k: "Activity", v: "348", sub: "tasks / day", a: "from-amber-400 to-orange-500", i: Activity },
            { k: "Alerts", v: 2, sub: "need attention", a: "from-rose-400 to-red-500", i: AlertTriangle },
          ].map((s) => (
            <div key={s.k} className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
              <div className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r ${s.a}`} />
              <div className="flex items-start justify-between">
                <div className={`inline-flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br ${s.a} text-slate-950 shadow`}>
                  <s.i className="h-4 w-4" />
                </div>
                {s.pulse && (
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                  </span>
                )}
              </div>
              <div className="mt-3 text-[10px] uppercase tracking-wider text-slate-500">{s.k}</div>
              <div className="mt-0.5 flex items-baseline gap-1.5">
                <span className="text-2xl font-semibold tabular-nums text-white">{s.v}</span>
                <span className="text-[11px] text-slate-500">{s.sub}</span>
              </div>
            </div>
          ))}
        </section>

        {/* Leader — clean, centered, no inline buttons */}
        <section className="mt-8 flex flex-col items-center">
          <div className="relative w-full max-w-2xl">
            <div className="absolute inset-0 -m-6 rounded-3xl bg-gradient-to-r from-cyan-500/20 via-blue-500/20 to-cyan-500/20 blur-2xl" />
            <div className="relative flex items-center gap-4 rounded-2xl border border-cyan-400/30 bg-slate-950/70 px-5 py-4 backdrop-blur">
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-slate-900/60 ring-1 ring-cyan-400/40 shadow-[0_0_40px_rgba(34,211,238,0.5)]">
                <img src={leaderBot} alt="AKS SEO Team Leader bot" className="h-full w-full object-contain" width={512} height={512} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-cyan-300/80">
                  Main Agent
                </div>
                <div className="truncate text-lg font-semibold text-white">AKS SEO Team Leader</div>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    </span>
                    All agents online
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-900/60 px-2 py-0.5 text-[10px] font-medium text-slate-300">
                    <CheckCircle2 className="h-3 w-3 text-emerald-400" /> Healthy
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-900/60 px-2 py-0.5 text-[10px] font-medium text-slate-300">
                    <Network className="h-3 w-3 text-cyan-300" /> {EXPERTS.length} experts · {totalSubs} sub-agents
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* leader trunk drops into connector bus */}
          <div className="mx-auto mt-4 h-8 w-px bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.5)]" />
        </section>

        {/* Fleet container — clearly separates the rest of the hierarchy from the leader */}
        <section className="mt-4 rounded-3xl border border-slate-800 bg-gradient-to-b from-slate-950/80 to-slate-900/30 p-5 sm:p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Network className="h-4 w-4 text-cyan-300" />
              <div>
                <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-cyan-300/80">
                  Reporting to the Leader
                </div>
                <h2 className="text-sm font-semibold text-white">Specialist Agent Fleet</h2>
              </div>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-900/60 px-2 py-0.5 text-[10px] font-medium text-slate-300">
              {EXPERTS.length} experts · {totalSubs} sub-agents
            </span>
          </div>

          {/* Experts grid */}
          <section className="grid grid-cols-1 gap-x-5 gap-y-0 sm:grid-cols-2 lg:grid-cols-5">
            {EXPERTS.map((e, idx) => {
              const Icon = e.icon;
              const isOpen = open === e.id;
              const conn = CONNECTOR_CLASSES[idx];
              return (
                <div
                  key={e.id}
                  ref={(el) => {
                    cardRefs.current[e.id] = el;
                  }}
                  className="flex scroll-mt-24 flex-col"
                >
                  {/* T-connector: solid horizontal bus halves + accent vertical drop */}
                  <div className="relative h-8 w-full">
                    <div className={`absolute top-1/2 left-0 right-1/2 h-px -translate-y-1/2 bg-cyan-400 ${conn.left}`} />
                    <div className={`absolute top-1/2 left-1/2 right-0 h-px -translate-y-1/2 bg-cyan-400 ${conn.right}`} />
                    <div
                      className={`absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-gradient-to-b ${e.accent} ${isOpen ? "opacity-100" : "opacity-70"} transition-opacity duration-500`}
                    />
                  </div>

                  <button
                    onClick={() => setOpen(isOpen ? null : e.id)}
                    aria-expanded={isOpen}
                    className={`group relative overflow-hidden rounded-xl border text-left transition-all duration-300 ease-out ${
                      isOpen
                        ? "-translate-y-0.5 border-cyan-400/60 bg-slate-900/80 shadow-[0_0_40px_rgba(34,211,238,0.25)] ring-1 ring-cyan-400/30"
                        : "border-slate-800 bg-slate-900/40 hover:-translate-y-0.5 hover:border-cyan-500/40 hover:bg-slate-900/70 hover:shadow-[0_0_20px_rgba(34,211,238,0.1)]"
                    }`}
                  >
                    <div
                      className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r ${e.accent} transition-opacity duration-300 ${
                        isOpen ? "opacity-100" : "opacity-60"
                      }`}
                    />
                    <div className="p-4">
                      <div className="flex items-center justify-between">
                        <div
                          className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-slate-950/60 ring-1 transition-all duration-300 ${
                            isOpen
                              ? "scale-110 ring-cyan-400/60 shadow-[0_0_20px_rgba(34,211,238,0.4)]"
                              : "ring-slate-700/60 group-hover:scale-105 group-hover:ring-cyan-500/40"
                          }`}
                        >
                          <div className={`absolute inset-0 bg-gradient-to-br ${e.accent} opacity-20`} />
                          <img
                            src={agentBot}
                            alt=""
                            className="relative h-full w-full object-contain"
                            loading="lazy"
                            width={512}
                            height={512}
                          />
                        </div>
                        <div
                          className={`relative grid h-6 w-6 place-items-center rounded-full border transition-all duration-300 ${
                            isOpen
                              ? "border-cyan-400/60 bg-cyan-400/15 text-cyan-200 shadow-[0_0_12px_rgba(34,211,238,0.5)]"
                              : "border-slate-700 bg-slate-900/60 text-slate-400 group-hover:border-cyan-500/40 group-hover:text-cyan-300"
                          }`}
                        >
                          <Plus className={`absolute h-3.5 w-3.5 transition-all duration-300 ${isOpen ? "rotate-90 opacity-0 scale-50" : "rotate-0 opacity-100 scale-100"}`} />
                          <Minus className={`absolute h-3.5 w-3.5 transition-all duration-300 ${isOpen ? "rotate-0 opacity-100 scale-100" : "-rotate-90 opacity-0 scale-50"}`} />
                        </div>
                      </div>
                      <div className="mt-3 flex items-center gap-2">
                        <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-md bg-gradient-to-br ${e.accent} shadow`}>
                          <Icon className="h-3.5 w-3.5 text-slate-950" />
                        </span>
                        <div className="text-sm font-semibold text-white leading-tight">
                          {e.title}
                        </div>
                      </div>
                      <div className="mt-1 text-[11px] uppercase tracking-wider text-slate-500">
                        {e.tag}
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-[11px] text-cyan-300/80">
                          <Activity className="h-3 w-3" />
                          {e.subs.length} sub-agents
                        </div>
                        <Link
                          to="/agents/$id"
                          params={{ id: e.id }}
                          onClick={(ev) => ev.stopPropagation()}
                          className="inline-flex items-center gap-1 rounded-md border border-cyan-400/30 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-cyan-200 transition hover:bg-cyan-400/20"
                        >
                          Profile <ArrowUpRight className="h-3 w-3" />
                        </Link>
                      </div>
                    </div>
                  </button>
                </div>
              );
            })}
          </section>
        </section>

        {/* Full-width horizontal sub-agent strip for the currently open expert */}
        {open && (() => {
          const current = EXPERTS.find((x) => x.id === open);
          if (!current) return null;
          const SUB_ACCENTS = [
            "from-cyan-400 to-sky-500",
            "from-violet-400 to-fuchsia-500",
            "from-amber-400 to-orange-500",
            "from-emerald-400 to-teal-500",
            "from-rose-400 to-pink-500",
            "from-indigo-400 to-blue-500",
          ];
          return (
            <section className="mt-6">
              <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-cyan-300/80">
                <span className="h-px flex-1 bg-slate-800" />
                <span>{current.title} · Sub-agents</span>
                <span className="h-px flex-1 bg-slate-800" />
              </div>
              <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {current.subs.map((s, i) => {
                  const accent = SUB_ACCENTS[i % SUB_ACCENTS.length];
                  return (
                    <li
                      key={s.name}
                      style={{ animation: `subIn .45s cubic-bezier(0.22,1,0.36,1) ${i * 70}ms both` }}
                    >
                      <Link
                        to="/agents/$id"
                        params={{ id: buildSubAgentId(current.id, s.name) }}
                        className="group/sub relative block overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40 p-4 transition hover:-translate-y-0.5 hover:border-cyan-500/40 hover:bg-slate-900/70 hover:shadow-[0_0_20px_rgba(34,211,238,0.1)]"
                      >
                        <div className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r ${accent}`} />
                        <div className="flex items-center justify-between">
                          <div className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-slate-950/60 ring-1 ring-slate-700/60 transition group-hover/sub:scale-105`}>
                            <div className={`absolute inset-0 bg-gradient-to-br ${accent} opacity-25`} />
                            <img src={agentBot} alt="" className="relative h-full w-full object-contain" loading="lazy" width={512} height={512} />
                          </div>
                          <ArrowUpRight className="h-4 w-4 text-slate-500 transition group-hover/sub:text-cyan-300" />
                        </div>
                        <div className="mt-3 flex items-center gap-2">
                          <span className={`h-2 w-2 shrink-0 rounded-full bg-gradient-to-r ${accent} shadow-[0_0_8px_rgba(34,211,238,0.5)]`} />
                          <div className="text-sm font-semibold text-white leading-tight">{s.name}</div>
                        </div>
                        <div className="mt-1 text-[11px] uppercase tracking-wider text-slate-500">
                          Sub-agent
                        </div>
                        <div className="mt-3 text-xs text-slate-400">{s.desc}</div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })()}

        {/* Custom agents added via Add Agent modal */}
        {customAgents.length > 0 && (
          <section className="mt-8">
            <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-cyan-300/80">
              <span className="h-px flex-1 bg-slate-800" />
              <span>Custom Agents</span>
              <span className="h-px flex-1 bg-slate-800" />
            </div>
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {customAgents.map((a) => {
                const Icon = ICON_CHOICES.find((c) => c.id === a.iconId)?.icon ?? Bot;
                return (
                  <li key={a.id} className="group/sub relative overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40 p-4 transition hover:-translate-y-0.5 hover:border-cyan-500/40 hover:bg-slate-900/70">
                    <div className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r ${a.accent}`} />
                    <div className="flex items-start justify-between">
                      <div className={`relative grid h-14 w-14 place-items-center overflow-hidden rounded-xl bg-slate-950/60 ring-1 ring-slate-700/60`}>
                        <div className={`absolute inset-0 bg-gradient-to-br ${a.accent} opacity-25`} />
                        <Icon className="relative h-6 w-6 text-white" />
                      </div>
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-1.5 py-0.5 text-[9px] font-medium text-emerald-300">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> New
                      </span>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full bg-gradient-to-r ${a.accent}`} />
                      <div className="text-sm font-semibold text-white leading-tight">{a.name}</div>
                    </div>
                    <div className="mt-1 text-[11px] uppercase tracking-wider text-slate-500">{a.role}</div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* generous breathing room below the agent graph */}
        <div aria-hidden className="h-24 sm:h-32" />

        <div aria-hidden className="h-8" />
      </div>

      {showAdd && (
        <AddAgentModal
          onClose={() => setShowAdd(false)}
          onCreate={(agent) => {
            setCustomAgents((prev) => [...prev, agent]);
            setShowAdd(false);
          }}
        />
      )}
      {showAssign && <AssignJobModal onClose={() => setShowAssign(false)} customAgents={customAgents} />}
      {showNewJob && <NewJobModal onClose={() => setShowNewJob(false)} />}

      <style>{`
        @keyframes subIn {
          from { opacity: 0; transform: translateY(8px) scale(0.98); filter: blur(2px); }
          to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
        }
      `}</style>
    </div>
  );
}

function AddAgentModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (a: CustomAgent) => void;
}) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("Specialist");
  const [iconId, setIconId] = useState(ICON_CHOICES[0].id);
  const [accent, setAccent] = useState(ACCENT_CHOICES[0]);
  const SelectedIcon = ICON_CHOICES.find((c) => c.id === iconId)?.icon ?? Bot;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onCreate({
      id: `custom-${Date.now()}`,
      name: name.trim(),
      role: role.trim() || "Specialist",
      iconId,
      accent,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-cyan-500/25 bg-slate-950 shadow-2xl"
      >
        <div className={`h-1 w-full bg-gradient-to-r ${accent}`} />
        <div className="flex items-start justify-between border-b border-slate-800 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className={`relative grid h-11 w-11 place-items-center overflow-hidden rounded-xl bg-slate-900 ring-1 ring-cyan-400/30`}>
              <div className={`absolute inset-0 bg-gradient-to-br ${accent} opacity-25`} />
              <SelectedIcon className="relative h-5 w-5 text-white" />
            </div>
            <div>
              <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-cyan-300/80">
                Fleet · New Agent
              </div>
              <h2 className="text-base font-semibold text-white">Add Agent</h2>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-slate-500">Agent name</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. International SEO Scout"
              className="mt-1 w-full rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2 text-[13px] text-white placeholder:text-slate-600 focus:border-cyan-400/50 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-slate-500">Role / tag</label>
            <input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="e.g. Specialist"
              className="mt-1 w-full rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2 text-[13px] text-white placeholder:text-slate-600 focus:border-cyan-400/50 focus:outline-none"
            />
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-wider text-slate-500">Logo icon</label>
            <div className="mt-2 grid grid-cols-6 gap-2">
              {ICON_CHOICES.map((c) => {
                const I = c.icon;
                const active = iconId === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setIconId(c.id)}
                    title={c.label}
                    className={`relative grid aspect-square place-items-center rounded-lg border transition ${
                      active
                        ? "border-cyan-400/60 bg-cyan-400/10 text-white shadow-[0_0_14px_rgba(34,211,238,0.35)]"
                        : "border-slate-800 bg-slate-900/60 text-slate-400 hover:border-cyan-400/40 hover:text-white"
                    }`}
                  >
                    <I className="h-4 w-4" />
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-wider text-slate-500">Accent</label>
            <div className="mt-2 flex flex-wrap gap-2">
              {ACCENT_CHOICES.map((a) => {
                const active = a === accent;
                return (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setAccent(a)}
                    className={`h-7 w-10 rounded-md bg-gradient-to-br ${a} transition ${
                      active ? "ring-2 ring-white/70 ring-offset-2 ring-offset-slate-950" : "opacity-70 hover:opacity-100"
                    }`}
                  />
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-800 bg-slate-950/60 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-[12px] font-medium text-slate-200 hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!name.trim()}
            className="inline-flex items-center gap-1.5 rounded-md bg-gradient-to-r from-cyan-500 to-blue-600 px-3 py-1.5 text-[12px] font-semibold text-white shadow-[0_0_18px_rgba(34,211,238,0.35)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <UserPlus className="h-3.5 w-3.5" /> Create Agent
          </button>
        </div>
      </form>
    </div>
  );
}
