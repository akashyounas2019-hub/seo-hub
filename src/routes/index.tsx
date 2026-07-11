import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Plus, Minus, Activity, ArrowUpRight } from "lucide-react";
import agentBot from "@/assets/agent-bot.png";
import leaderBot from "@/assets/leader-bot.png";
import { EXPERTS, buildSubAgentId } from "@/lib/agents";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AKS SEO Team — Agent Hierarchy" },
      {
        name: "description",
        content:
          "Hierarchical dashboard of the AKS SEO Team Leader and its specialist sub-agents across On-Page, Off-Page, Technical, Research, and Audit.",
      },
      { property: "og:title", content: "AKS SEO Team — Agent Hierarchy" },
      {
        property: "og:description",
        content:
          "Explore the AKS SEO Team Leader agent and its sub-agent fleet.",
      },
    ],
  }),
  component: Index,
});

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

  useEffect(() => {
    if (!open) return;
    const el = cardRefs.current[open];
    if (!el) return;
    const t = setTimeout(() => {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 200);
    return () => clearTimeout(t);
  }, [open]);

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
        {/* Header */}
        <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 sm:flex sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-slate-900/60 ring-1 ring-cyan-400/30 shadow-[0_0_30px_rgba(34,211,238,0.35)]">
              <img src={agentBot} alt="" className="h-full w-full object-contain" loading="lazy" width={512} height={512} />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold tracking-tight text-white">
                AKS Agent Console
              </h1>
              <p className="truncate text-xs text-slate-400">
                Hierarchical SEO Agent Orchestration
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 rounded-full border border-cyan-500/20 bg-cyan-500/5 px-3 py-1.5 text-xs">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-400" />
            </span>
            <span className="text-cyan-200">All agents online</span>
          </div>
        </header>

        {/* Leader */}
        <section className="mt-12 flex flex-col items-center">
          <div className="relative">
            <div className="absolute inset-0 -m-6 rounded-3xl bg-gradient-to-r from-cyan-500/20 via-blue-500/20 to-cyan-500/20 blur-2xl" />
            <div className="relative flex items-center gap-4 rounded-2xl border border-cyan-400/30 bg-slate-950/70 px-6 py-5 backdrop-blur">
              <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-slate-900/60 ring-1 ring-cyan-400/40 shadow-[0_0_40px_rgba(34,211,238,0.5)]">
                <img src={leaderBot} alt="AKS SEO Team Leader bot" className="h-full w-full object-contain" width={512} height={512} />
              </div>
              <div>
                <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-cyan-300/80">
                  Main Agent
                </div>
                <div className="text-xl font-semibold text-white">
                  AKS SEO Team Leader
                </div>
                <div className="text-xs text-slate-400">
                  Orchestrates 5 experts · 20 sub-agents
                </div>
              </div>
            </div>
          </div>

          {/* leader trunk drops down into the connector row of the grid */}
          <div className="mx-auto mt-2 h-8 w-px bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.5)]" />
        </section>

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

                {/* inline sub-agents removed — all experts render sub-agents in the full-width strip below */}
              </div>
            );
          })}
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

        {/* generous breathing room below the agent graph */}
        <div aria-hidden className="h-24 sm:h-32" />

        {/* footer stats */}
        <section className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { k: "Experts", v: "5" },
            { k: "Sub-agents", v: "20" },
            { k: "Avg. latency", v: "1.2s" },
            { k: "Tasks / day", v: "348" },
          ].map((s) => (
            <div
              key={s.k}
              className="rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3"
            >
              <div className="text-[11px] uppercase tracking-wider text-slate-500">
                {s.k}
              </div>
              <div className="mt-1 text-lg font-semibold text-white">
                {s.v}
              </div>
            </div>
          ))}
        </section>

        <div aria-hidden className="h-16" />
      </div>

      <style>{`
        @keyframes subIn {
          from { opacity: 0; transform: translateY(8px) scale(0.98); filter: blur(2px); }
          to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
        }
      `}</style>
    </div>
  );
}
