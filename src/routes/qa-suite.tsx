import { createFileRoute } from "@tanstack/react-router";
import { TestTube2, CheckCircle2, XCircle, Clock, Play } from "lucide-react";

export const Route = createFileRoute("/qa-suite")({
  head: () => ({
    meta: [
      { title: "QA Suite — AKS SEO Console" },
      { name: "description", content: "Automated QA runs across every published site." },
    ],
  }),
  component: QASuitePage,
});

const suites = [
  { name: "Post-publish Playwright", status: "passing", last: "12m ago", passed: 84, failed: 0, total: 84 },
  { name: "Schema validity (JSON-LD)", status: "passing", last: "1h ago", passed: 42, failed: 0, total: 42 },
  { name: "Core Web Vitals lab", status: "warning", last: "2h ago", passed: 38, failed: 4, total: 42 },
  { name: "Link integrity", status: "failing", last: "3h ago", passed: 217, failed: 3, total: 220 },
  { name: "Accessibility (axe)", status: "passing", last: "6h ago", passed: 96, failed: 0, total: 96 },
];

function pill(status: string) {
  if (status === "passing") return "border-emerald-400/30 bg-emerald-400/10 text-emerald-300";
  if (status === "warning") return "border-amber-400/30 bg-amber-400/10 text-amber-300";
  return "border-rose-400/30 bg-rose-400/10 text-rose-300";
}

function QASuitePage() {
  return (
    <div className="min-h-screen bg-[#05070d] text-slate-200">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <header className="mb-6 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-cyan-500/30 to-blue-600/30 ring-1 ring-cyan-400/40">
            <TestTube2 className="h-5 w-5 text-cyan-200" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-white">QA Suite</h1>
            <p className="text-sm text-slate-400">Every deploy runs the full test pack across mobile, tablet, and desktop.</p>
          </div>
          <button className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-cyan-400 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-300">
            <Play className="h-3.5 w-3.5" /> Run all suites
          </button>
        </header>

        <div className="mb-6 grid gap-3 sm:grid-cols-4">
          {[
            { l: "Total tests", v: "484", i: TestTube2 },
            { l: "Passing", v: "477", i: CheckCircle2, tone: "text-emerald-300" },
            { l: "Failing", v: "7", i: XCircle, tone: "text-rose-300" },
            { l: "Avg runtime", v: "38s", i: Clock },
          ].map((c) => (
            <div key={c.l} className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-wider text-slate-500">{c.l}</span>
                <c.i className={`h-4 w-4 ${c.tone ?? "text-cyan-300"}`} />
              </div>
              <div className={`mt-1.5 text-2xl font-semibold ${c.tone ?? "text-white"}`}>{c.v}</div>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-950/50">
          <div className="border-b border-slate-800 px-5 py-3 text-sm font-semibold text-white">Test suites</div>
          <div className="divide-y divide-slate-800">
            {suites.map((s) => (
              <div key={s.name} className="grid grid-cols-12 items-center gap-3 px-5 py-3.5 text-sm">
                <div className="col-span-5 font-medium text-white">{s.name}</div>
                <div className="col-span-2">
                  <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${pill(s.status)}`}>
                    {s.status}
                  </span>
                </div>
                <div className="col-span-2 text-slate-400">{s.last}</div>
                <div className="col-span-2 font-mono text-xs text-slate-300">
                  <span className="text-emerald-300">{s.passed}</span> / <span className="text-rose-300">{s.failed}</span> / {s.total}
                </div>
                <div className="col-span-1 text-right">
                  <button className="rounded-md border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:border-cyan-400/40 hover:text-white">Run</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
