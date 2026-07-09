import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Crown,
  FileText,
  Link2,
  Settings2,
  Search,
  ShieldCheck,
  ChevronDown,
  Activity,
  Sparkles,
} from "lucide-react";

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
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 shadow-[0_0_30px_rgba(34,211,238,0.35)]">
              <Sparkles className="h-5 w-5 text-slate-950" />
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
              <div className="grid h-14 w-14 place-items-center rounded-xl bg-gradient-to-br from-cyan-300 to-blue-600 shadow-[0_0_40px_rgba(34,211,238,0.5)]">
                <Crown className="h-7 w-7 text-slate-950" />
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
              <div key={e.id} className="flex flex-col">
                {/* vertical line into card */}
                <div className="mx-auto h-6 w-px bg-gradient-to-b from-cyan-400/40 to-transparent" />

                <button
                  onClick={() => setOpen(isOpen ? null : e.id)}
                  className={`group relative overflow-hidden rounded-xl border text-left transition-all ${
                    isOpen
                      ? "border-cyan-400/50 bg-slate-900/80 shadow-[0_0_30px_rgba(34,211,238,0.15)]"
                      : "border-slate-800 bg-slate-900/40 hover:border-cyan-500/30 hover:bg-slate-900/70"
                  }`}
                >
                  <div
                    className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r ${e.accent}`}
                  />
                  <div className="p-4">
                    <div className="flex items-center justify-between">
                      <div
                        className={`grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br ${e.accent} shadow-lg`}
                      >
                        <Icon className="h-4 w-4 text-slate-950" />
                      </div>
                      <ChevronDown
                        className={`h-4 w-4 text-slate-500 transition-transform ${
                          isOpen ? "rotate-180 text-cyan-300" : ""
                        }`}
                      />
                    </div>
                    <div className="mt-3 text-sm font-semibold text-white">
                      {e.title}
                    </div>
                    <div className="text-[11px] uppercase tracking-wider text-slate-500">
                      {e.tag}
                    </div>
                    <div className="mt-3 flex items-center gap-1.5 text-[11px] text-cyan-300/80">
                      <Activity className="h-3 w-3" />
                      {e.subs.length} sub-agents
                    </div>
                  </div>
                </button>

                {/* sub-agents */}
                <div
                  className={`grid transition-all duration-300 ${
                    isOpen
                      ? "mt-3 grid-rows-[1fr] opacity-100"
                      : "grid-rows-[0fr] opacity-0"
                  }`}
                >
                  <div className="overflow-hidden">
                    <ul className="space-y-2">
                      {e.subs.map((s, i) => (
                        <li
                          key={s.name}
                          className="group relative rounded-lg border border-slate-800/80 bg-slate-950/60 p-3 transition hover:border-cyan-500/40 hover:bg-slate-900/60"
                          style={{
                            animation: isOpen
                              ? `fadeUp .35s ease ${i * 60}ms both`
                              : undefined,
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={`h-1.5 w-1.5 rounded-full bg-gradient-to-r ${e.accent}`}
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
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
