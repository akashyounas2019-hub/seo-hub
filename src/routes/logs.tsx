import { createFileRoute } from "@tanstack/react-router";
import { ScrollText, Filter, Download } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/logs")({
  head: () => ({
    meta: [
      { title: "Logs — AKS SEO Console" },
      { name: "description", content: "Real-time system logs across all agents and jobs." },
    ],
  }),
  component: LogsPage,
});

type Level = "info" | "warn" | "error" | "debug";
type Row = { ts: string; level: Level; source: string; msg: string };

const seed: Row[] = [
  { ts: "07:12:44", level: "info", source: "build-agent", msg: "Job spotlesscleaningservices → phase=global_research queued" },
  { ts: "07:12:38", level: "info", source: "keyword-scout", msg: "Fetched 214 keywords from Semrush (dubai-cleaning)" },
  { ts: "07:11:20", level: "warn", source: "cwv", msg: "LCP 2.8s > 2.0s budget on /services/deep-clean" },
  { ts: "07:10:02", level: "error", source: "outreach", msg: "SMTP 550: recipient rejected (batch #42)" },
  { ts: "07:08:55", level: "info", source: "auditor", msg: "Rubric audit passed for 4 pages" },
  { ts: "07:07:12", level: "debug", source: "router", msg: "Prefetch /agents/onpage" },
  { ts: "07:06:44", level: "info", source: "gateway", msg: "Anthropic call · 1.2s · $0.014" },
];

const tone: Record<Level, string> = {
  info: "text-cyan-300 bg-cyan-400/10 border-cyan-400/20",
  warn: "text-amber-300 bg-amber-400/10 border-amber-400/20",
  error: "text-rose-300 bg-rose-400/10 border-rose-400/20",
  debug: "text-slate-400 bg-slate-500/10 border-slate-500/20",
};

function LogsPage() {
  const [level, setLevel] = useState<Level | "all">("all");
  const rows = seed.filter((r) => level === "all" || r.level === level);

  return (
    <div className="min-h-screen bg-[#05070d] text-slate-200">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <header className="mb-6 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-cyan-500/30 to-blue-600/30 ring-1 ring-cyan-400/40">
            <ScrollText className="h-5 w-5 text-cyan-200" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-white">System Logs</h1>
            <p className="text-sm text-slate-400">Live tail across every agent, gateway, and job runner.</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="inline-flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-950/60 px-2 py-1.5 text-xs">
              <Filter className="h-3.5 w-3.5 text-slate-400" />
              {(["all", "info", "warn", "error", "debug"] as const).map((l) => (
                <button
                  key={l}
                  onClick={() => setLevel(l)}
                  className={`rounded px-2 py-0.5 text-[11px] uppercase tracking-wider ${level === l ? "bg-cyan-400 text-slate-950 font-semibold" : "text-slate-400 hover:text-white"}`}
                >
                  {l}
                </button>
              ))}
            </div>
            <button className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-300 hover:border-cyan-400/40">
              <Download className="h-3.5 w-3.5" /> Export
            </button>
          </div>
        </header>

        <div className="rounded-2xl border border-slate-800 bg-slate-950/60 overflow-hidden">
          <div className="grid grid-cols-12 gap-3 border-b border-slate-800 bg-slate-950 px-5 py-2 text-[10px] uppercase tracking-wider text-slate-500">
            <div className="col-span-2">Timestamp</div>
            <div className="col-span-1">Level</div>
            <div className="col-span-2">Source</div>
            <div className="col-span-7">Message</div>
          </div>
          <div className="max-h-[60vh] overflow-y-auto font-mono text-[12px]">
            {rows.map((r, i) => (
              <div key={i} className="grid grid-cols-12 gap-3 border-b border-slate-900 px-5 py-2 hover:bg-slate-900/40">
                <div className="col-span-2 text-slate-500">{r.ts}</div>
                <div className="col-span-1">
                  <span className={`inline-flex rounded border px-1.5 py-px text-[9px] uppercase tracking-wider ${tone[r.level]}`}>{r.level}</span>
                </div>
                <div className="col-span-2 text-cyan-300">{r.source}</div>
                <div className="col-span-7 text-slate-200">{r.msg}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
