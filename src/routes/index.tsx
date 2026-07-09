import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  FileText,
  Link2,
  Settings2,
  Search,
  ShieldCheck,
  Plus,
  Minus,
  Activity,
} from "lucide-react";
import agentBot from "@/assets/agent-bot.png";
import leaderBot from "@/assets/leader-bot.png";

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

type Expert = {
  id: string;
  title: string;
  tag: string;
  icon: typeof FileText;
  accent: string;
  subs: { name: string; desc: string }[];
};

const EXPERTS: Expert[] = [
  {
    id: "onpage",
    title: "On-Page Expert",
    tag: "Content & Structure",
    icon: FileText,
    accent: "from-cyan-400 to-sky-500",
    subs: [
      { name: "Meta Optimizer", desc: "Titles, descriptions, OG tags" },
      { name: "Content Strategist", desc: "Topical maps & briefs" },
      { name: "Internal Linker", desc: "Anchor & silo planning" },
      { name: "Schema Writer", desc: "JSON-LD structured data" },
    ],
  },
  {
    id: "offpage",
    title: "Off-Page Expert",
    tag: "Authority & Signals",
    icon: Link2,
    accent: "from-sky-400 to-blue-500",
    subs: [
      { name: "Backlink Prospector", desc: "Link opportunity discovery" },
      { name: "Outreach Agent", desc: "Personalized pitches" },
      { name: "Digital PR", desc: "Brand mentions & citations" },
      { name: "Disavow Manager", desc: "Toxic link cleanup" },
    ],
  },
  {
    id: "technical",
    title: "Technical SEO Expert",
    tag: "Crawl & Performance",
    icon: Settings2,
    accent: "from-blue-400 to-indigo-500",
    subs: [
      { name: "Crawl Analyst", desc: "Robots, sitemaps, indexation" },
      { name: "Core Web Vitals", desc: "LCP, INP, CLS tuning" },
      { name: "Rendering Bot", desc: "JS SEO & hydration checks" },
      { name: "Log File Parser", desc: "Bot behavior insights" },
    ],
  },
  {
    id: "research",
    title: "Researcher",
    tag: "Intelligence & Trends",
    icon: Search,
    accent: "from-teal-400 to-cyan-500",
    subs: [
      { name: "Keyword Miner", desc: "Volume, difficulty, intent" },
      { name: "SERP Analyst", desc: "Competitor SERP dissection" },
      { name: "Trend Watcher", desc: "Emerging query patterns" },
      { name: "Audience Profiler", desc: "Persona & intent mapping" },
    ],
  },
  {
    id: "auditor",
    title: "Auditor",
    tag: "Quality & Compliance",
    icon: ShieldCheck,
    accent: "from-cyan-400 to-teal-500",
    subs: [
      { name: "Site Auditor", desc: "Full-site health scan" },
      { name: "Content QA", desc: "E-E-A-T & accuracy checks" },
      { name: "Compliance Bot", desc: "Guidelines & policy review" },
      { name: "Report Generator", desc: "Exec-ready summaries" },
    ],
  },
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

          {/* connector */}
          <div className="relative h-16 w-px bg-gradient-to-b from-cyan-400/60 to-transparent" />
        </section>

        {/* Experts grid */}
        <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-5">
          {EXPERTS.map((e) => {
            const Icon = e.icon;
            const isOpen = open === e.id;
            return (
              <div
                key={e.id}
                ref={(el) => {
                  cardRefs.current[e.id] = el;
                }}
                className="flex scroll-mt-24 flex-col"
              >
                {/* vertical line into card */}
                <div
                  className={`mx-auto w-px transition-all duration-500 ${
                    isOpen
                      ? "h-6 bg-gradient-to-b from-cyan-300 to-cyan-400/60 shadow-[0_0_8px_rgba(34,211,238,0.6)]"
                      : "h-6 bg-gradient-to-b from-cyan-400/40 to-transparent"
                  }`}
                />

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
                        className={`grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br ${e.accent} shadow-lg transition-transform duration-300 ${
                          isOpen ? "scale-110" : "group-hover:scale-105"
                        }`}
                      >
                        <Icon className="h-4 w-4 text-slate-950" />
                      </div>
                      {/* Expand/collapse indicator */}
                      <div
                        className={`relative grid h-6 w-6 place-items-center rounded-full border transition-all duration-300 ${
                          isOpen
                            ? "border-cyan-400/60 bg-cyan-400/15 text-cyan-200 shadow-[0_0_12px_rgba(34,211,238,0.5)]"
                            : "border-slate-700 bg-slate-900/60 text-slate-400 group-hover:border-cyan-500/40 group-hover:text-cyan-300"
                        }`}
                      >
                        <Plus
                          className={`absolute h-3.5 w-3.5 transition-all duration-300 ${
                            isOpen ? "rotate-90 opacity-0 scale-50" : "rotate-0 opacity-100 scale-100"
                          }`}
                        />
                        <Minus
                          className={`absolute h-3.5 w-3.5 transition-all duration-300 ${
                            isOpen ? "rotate-0 opacity-100 scale-100" : "-rotate-90 opacity-0 scale-50"
                          }`}
                        />
                      </div>
                    </div>
                    <div className="mt-3 text-sm font-semibold text-white">
                      {e.title}
                    </div>
                    <div className="text-[11px] uppercase tracking-wider text-slate-500">
                      {e.tag}
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-[11px] text-cyan-300/80">
                        <Activity className="h-3 w-3" />
                        {e.subs.length} sub-agents
                      </div>
                      <span
                        className={`text-[10px] font-medium uppercase tracking-wider transition-colors ${
                          isOpen ? "text-cyan-300" : "text-slate-600"
                        }`}
                      >
                        {isOpen ? "Expanded" : "Tap to open"}
                      </span>
                    </div>
                  </div>
                </button>

                {/* sub-agents */}
                <div
                  className={`grid transition-[grid-template-rows,margin,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                    isOpen
                      ? "mt-3 grid-rows-[1fr] opacity-100"
                      : "mt-0 grid-rows-[0fr] opacity-0"
                  }`}
                >
                  <div className="overflow-hidden">
                    <ul className="space-y-2 pt-1">
                      {e.subs.map((s, i) => (
                        <li
                          key={s.name}
                          className="group/sub relative rounded-lg border border-slate-800/80 bg-slate-950/60 p-3 transition hover:translate-x-0.5 hover:border-cyan-500/40 hover:bg-slate-900/60"
                          style={{
                            animation: isOpen
                              ? `subIn .45s cubic-bezier(0.22,1,0.36,1) ${i * 70}ms both`
                              : undefined,
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={`h-1.5 w-1.5 rounded-full bg-gradient-to-r ${e.accent} shadow-[0_0_6px_rgba(34,211,238,0.6)]`}
                            />
                            <div className="text-xs font-medium text-slate-100">
                              {s.name}
                            </div>
                          </div>
                          <div className="mt-1 pl-3.5 text-[11px] text-slate-500">
                            {s.desc}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            );
          })}
        </section>


        {/* footer stats */}
        <section className="mt-14 grid grid-cols-2 gap-3 sm:grid-cols-4">
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
