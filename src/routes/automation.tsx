import { createFileRoute } from "@tanstack/react-router";
import { Zap, Play, Pause, Plus } from "lucide-react";

export const Route = createFileRoute("/automation")({
  head: () => ({
    meta: [
      { title: "Automation — AKS SEO Console" },
      { name: "description", content: "Configure automated agent workflows, triggers, and schedules." },
    ],
  }),
  component: AutomationPage,
});

const flows = [
  { name: "Daily meta refresh", desc: "Rewrite outdated meta descriptions each morning", status: "running", accent: "from-cyan-400 to-sky-500" },
  { name: "Weekly backlink prospecting", desc: "Discover 25 new outreach targets every Monday", status: "running", accent: "from-violet-400 to-fuchsia-500" },
  { name: "CWV regression alert", desc: "Ping Slack when LCP > 2.5s on any tracked page", status: "paused", accent: "from-amber-400 to-orange-500" },
  { name: "Content brief generator", desc: "Auto-generate briefs from trending keywords", status: "running", accent: "from-emerald-400 to-teal-500" },
];

function AutomationPage() {
  return (
    <div className="min-h-screen bg-[#05070d] text-slate-200">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-white">Automation</h1>
            <p className="mt-1 text-sm text-slate-400">Chain agents together with triggers and schedules.</p>
          </div>
          <button className="inline-flex items-center gap-2 rounded-md border border-cyan-400/30 bg-cyan-400/10 px-3 py-1.5 text-sm font-medium text-cyan-200 hover:bg-cyan-400/20">
            <Plus className="h-4 w-4" /> New flow
          </button>
        </div>

        <ul className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
          {flows.map((f) => (
            <li key={f.name} className="relative overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40 p-5">
              <div className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r ${f.accent}`} />
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className={`grid h-10 w-10 place-items-center rounded-lg bg-gradient-to-br ${f.accent} text-slate-950`}>
                    <Zap className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white">{f.name}</div>
                    <div className="mt-0.5 text-xs text-slate-400">{f.desc}</div>
                  </div>
                </div>
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ${f.status === "running" ? "bg-emerald-400/10 text-emerald-300" : "bg-slate-700/40 text-slate-400"}`}>
                  {f.status === "running" ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
                  {f.status}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
