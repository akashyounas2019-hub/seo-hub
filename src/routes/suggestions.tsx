import { createFileRoute } from "@tanstack/react-router";
import { Lightbulb, ArrowUpRight } from "lucide-react";

export const Route = createFileRoute("/suggestions")({
  head: () => ({
    meta: [
      { title: "Suggestions — AKS SEO Console" },
      { name: "description", content: "AI-generated recommendations from your agent fleet." },
    ],
  }),
  component: SuggestionsPage,
});

const items = [
  { title: "Consolidate 3 competing pages on ‘keyword research tools’", impact: "High", accent: "from-rose-400 to-pink-500" },
  { title: "Add FAQ schema to 12 top-performing articles", impact: "Medium", accent: "from-amber-400 to-orange-500" },
  { title: "Reclaim 8 unlinked brand mentions", impact: "High", accent: "from-violet-400 to-fuchsia-500" },
  { title: "Improve LCP on /pricing (currently 3.1s)", impact: "High", accent: "from-cyan-400 to-sky-500" },
  { title: "Refresh 5 posts with declining traffic", impact: "Medium", accent: "from-emerald-400 to-teal-500" },
];

function SuggestionsPage() {
  return (
    <div className="min-h-screen bg-[#05070d] text-slate-200">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <h1 className="text-2xl font-semibold text-white">Suggestions</h1>
        <p className="mt-1 text-sm text-slate-400">Ranked opportunities surfaced by your agents.</p>

        <ul className="mt-8 space-y-3">
          {items.map((s) => (
            <li key={s.title} className="group relative overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40 p-4 transition hover:border-cyan-500/40 hover:bg-slate-900/70">
              <div className={`absolute inset-y-0 left-0 w-1 bg-gradient-to-b ${s.accent}`} />
              <div className="flex items-center justify-between pl-3">
                <div className="flex items-center gap-3">
                  <div className={`grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br ${s.accent} text-slate-950`}>
                    <Lightbulb className="h-4 w-4" />
                  </div>
                  <div className="text-sm font-medium text-white">{s.title}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 text-[10px] uppercase tracking-wider text-slate-300">
                    {s.impact} impact
                  </span>
                  <ArrowUpRight className="h-4 w-4 text-slate-500 transition group-hover:text-cyan-300" />
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
