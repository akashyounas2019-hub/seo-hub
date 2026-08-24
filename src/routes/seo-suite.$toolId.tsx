import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  ChevronRight,
  PlayCircle,
  Download,
  Copy,
  History,
  Sparkles,
  Zap,
  ShieldCheck,
  Radar,
} from "lucide-react";
import { getSeoTool, SEO_CATEGORIES, SEO_TOOLS, type SeoTool } from "@/lib/seo-tools";
import { useSite } from "@/lib/site-context";

export const Route = createFileRoute("/seo-suite/$toolId")({
  head: ({ params }) => {
    const t = getSeoTool(params.toolId);
    const title = t ? `${t.title} — SEO Suite` : "SEO Tool — SEO Suite";
    const desc = t?.description ?? "Advanced SEO tool workspace.";
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
      ],
    };
  },
  loader: ({ params }) => {
    if (!getSeoTool(params.toolId)) throw notFound();
    return { toolId: params.toolId };
  },
  notFoundComponent: ToolNotFound,
  component: SeoToolPage,
});

function ToolNotFound() {
  return (
    <div className="min-h-screen bg-[#05070d] text-slate-200 grid place-items-center px-6">
      <div className="max-w-md text-center">
        <div className="text-xs uppercase tracking-[0.3em] text-cyan-300/70">
          Tool not found
        </div>
        <h1 className="mt-2 text-2xl font-semibold text-white">
          This SEO tool isn't registered
        </h1>
        <Link
          to="/seo-suite"
          className="mt-6 inline-flex items-center gap-2 rounded-full border border-cyan-400/40 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-200 hover:bg-cyan-400/20"
        >
          <ArrowLeft className="h-4 w-4" /> Back to SEO Suite
        </Link>
      </div>
    </div>
  );
}

async function pollSeoSuiteJob(jobId: string, onStatus: (s: string) => void): Promise<{ status: string; outputMarkdown?: string }> {
  const POLL_MS = 3000;
  const MAX_ATTEMPTS = 140; // ~7 minutes
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    const res = await fetch(`/api/jobs/${jobId}`);
    const json = await res.json();
    const status = json?.job?.status;
    if (status === "done") return { status, outputMarkdown: json.job.outputMarkdown };
    if (status === "failed") return { status };
    if (status === "running") onStatus("AKS worker is analysing…");
    else if (status === "claimed") onStatus("AKS worker claimed the job…");
    else onStatus("Waiting for the AKS worker — run `npm run worker` if none is running.");
  }
  return { status: "timeout" };
}

function SeoToolPage() {
  const { toolId } = Route.useParams();
  const tool = getSeoTool(toolId) as SeoTool;
  const Icon = tool.icon;
  const { currentSite } = useSite();
  const [running, setRunning] = useState(false);
  const [statusLabel, setStatusLabel] = useState("");
  const [ranAt, setRanAt] = useState<string | null>(null);
  const [reportMarkdown, setReportMarkdown] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const peers = SEO_TOOLS.filter((t) => t.id !== tool.id).slice(0, 6);

  async function onRun(e: React.FormEvent) {
    e.preventDefault();
    if (running) return;

    const formData = new FormData(formRef.current!);
    const inputs: Record<string, string> = {};
    for (const field of tool.inputs) {
      const v = formData.get(field.label);
      if (typeof v === "string" && v.trim()) inputs[field.label] = v.trim();
    }

    setRunning(true);
    setStatusLabel("Starting run…");
    try {
      const res = await fetch("/api/seo-suite/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolId: tool.id, siteId: currentSite?.id, inputs }),
      });
      const json = await res.json();
      if (!json?.ok || !json.jobId) {
        toast.error(json?.error || "Failed to start tool run");
        return;
      }

      setStatusLabel("Waiting for the AKS worker — run `npm run worker` if none is running.");
      const { status, outputMarkdown } = await pollSeoSuiteJob(json.jobId, setStatusLabel);

      if (status === "done") {
        setReportMarkdown(outputMarkdown || "_(No output returned.)_");
        setRanAt(new Date().toLocaleTimeString("en-GB"));
        toast.success(`${tool.title} run complete`);
      } else if (status === "failed") {
        toast.error("Run failed. Check the worker logs.");
      } else {
        toast.info("Still running in the background — check back shortly.");
      }
    } catch {
      toast.error("Failed to start tool run");
    } finally {
      setRunning(false);
      setStatusLabel("");
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#05070d] text-slate-200">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-[400px] w-[400px] rounded-full bg-violet-600/10 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.10]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(56,189,248,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,.08) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
      </div>

      <div className="relative mx-auto max-w-7xl px-6 py-8">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-xs text-slate-400">
          <Link to="/seo-suite" className="inline-flex items-center gap-1 hover:text-cyan-300">
            <ArrowLeft className="h-3.5 w-3.5" /> SEO Suite
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-slate-300">{SEO_CATEGORIES[tool.category].label}</span>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-cyan-300">{tool.title}</span>
        </nav>

        {/* Hero */}
        <section className="mt-4 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/60 backdrop-blur">
          <div className={`h-1 w-full bg-gradient-to-r ${tool.accent}`} />
          <div className="grid gap-6 p-6 md:grid-cols-[auto_1fr_auto] md:items-center">
            <div className="relative">
              <div className={`absolute -inset-3 rounded-3xl bg-gradient-to-r ${tool.accent} opacity-30 blur-2xl`} />
              <div className={`relative grid h-20 w-20 place-items-center rounded-2xl bg-gradient-to-br ${tool.accent} shadow-[0_0_24px_rgba(34,211,238,0.3)]`}>
                <Icon className="h-9 w-9 text-slate-950" />
              </div>
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-cyan-200">
                  <Radar className="h-3 w-3" />
                  {SEO_CATEGORIES[tool.category].label}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900/60 px-2 py-0.5 text-[10px] uppercase tracking-wider text-slate-300">
                  <Zap className="h-3 w-3 text-cyan-300" /> {tool.runtime}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900/60 px-2 py-0.5 text-[10px] uppercase tracking-wider text-slate-300">
                  Output · {tool.output}
                </span>
              </div>
              <h1 className="mt-3 text-2xl font-semibold text-white sm:text-3xl">
                {tool.title}
              </h1>
              <p className="mt-1 max-w-2xl text-sm text-slate-400">{tool.description}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 md:justify-end">
              <button className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs text-slate-200 hover:border-cyan-400/40 hover:text-cyan-200">
                <History className="h-4 w-4" /> Runs
              </button>
              <button className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs text-slate-200 hover:border-cyan-400/40 hover:text-cyan-200">
                <Download className="h-4 w-4" /> Export
              </button>
            </div>
          </div>
        </section>

        {/* Workspace */}
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {/* Input form */}
          <form
            ref={formRef}
            onSubmit={onRun}
            className="lg:col-span-2 rounded-2xl border border-slate-800 bg-slate-950/50 p-5"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/70">
                  Run configuration
                </div>
                <h2 className="mt-1 text-lg font-semibold text-white">Inputs</h2>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-200">
                <ShieldCheck className="h-3 w-3" /> Server action
              </span>
            </div>

            <div className="mt-5 space-y-4">
              {tool.inputs.map((field) => (
                <div key={field.label}>
                  <label className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                    {field.label}
                  </label>
                  {field.type === "textarea" ? (
                    <textarea
                      name={field.label}
                      rows={3}
                      placeholder={field.placeholder}
                      className="mt-1.5 w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-cyan-400/40 focus:ring-1 focus:ring-cyan-400/30"
                    />
                  ) : (
                    <input
                      name={field.label}
                      type={field.type ?? "text"}
                      placeholder={field.placeholder}
                      className="mt-1.5 w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-cyan-400/40 focus:ring-1 focus:ring-cyan-400/30"
                    />
                  )}
                </div>
              ))}

              <details className="rounded-lg border border-slate-800 bg-slate-950/40 open:bg-slate-950/60">
                <summary className="cursor-pointer list-none px-3 py-2 text-[12px] text-slate-300 hover:text-cyan-200">
                  Advanced options
                </summary>
                <div className="grid gap-3 px-3 pb-3 pt-1 sm:grid-cols-2">
                  <label className="text-[11px] uppercase tracking-wider text-slate-500">
                    Market
                    <select className="mt-1 w-full rounded-md border border-slate-800 bg-slate-950/60 px-2 py-1.5 text-[12px] normal-case text-slate-200 focus:border-cyan-400/40">
                      <option>UAE · Dubai</option>
                      <option>UAE · Abu Dhabi</option>
                      <option>UAE · Sharjah</option>
                    </select>
                  </label>
                  <label className="text-[11px] uppercase tracking-wider text-slate-500">
                    Language
                    <select className="mt-1 w-full rounded-md border border-slate-800 bg-slate-950/60 px-2 py-1.5 text-[12px] normal-case text-slate-200 focus:border-cyan-400/40">
                      <option>English + Arabic</option>
                      <option>English</option>
                      <option>Arabic</option>
                    </select>
                  </label>
                </div>
              </details>
            </div>

            <div className="mt-5 flex items-center justify-between border-t border-slate-800 pt-4">
              <button
                type="button"
                className="text-[11px] text-slate-500 hover:text-cyan-300"
              >
                Save as preset
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs text-slate-200 hover:border-cyan-400/40 hover:text-cyan-200"
                >
                  Save draft
                </button>
                <button
                  type="submit"
                  disabled={running}
                  className={`inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r ${tool.accent} px-4 py-2 text-xs font-semibold text-slate-950 shadow hover:brightness-110 disabled:cursor-wait disabled:opacity-70`}
                >
                  <PlayCircle className="h-4 w-4" />
                  {running ? (statusLabel || "Running…") : "Run analysis"}
                </button>
              </div>
            </div>
          </form>

          {/* Live status */}
          <aside className="rounded-2xl border border-slate-800 bg-slate-950/50 p-5">
            <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/70">
              Live status
            </div>
            <div className="mt-2 text-sm font-semibold text-white">
              {running ? (statusLabel || "Running…") : ranAt ? "Last run complete" : "Idle"}
            </div>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-800">
              <div
                className={`h-full rounded-full bg-gradient-to-r ${tool.accent} transition-all`}
                style={{ width: running ? "70%" : ranAt ? "100%" : "8%" }}
              />
            </div>
            <div className="mt-2 text-[11px] text-slate-500">
              {ranAt ? `Finished at ${ranAt}` : "Awaiting run"}
            </div>

            <div className="mt-5 space-y-3 border-t border-slate-800 pt-4">
              {["Fetching target", "Parsing signals", "Scoring", "Formatting report"].map((step, i) => (
                <div key={step} className="flex items-center gap-2 text-[12px] text-slate-400">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      ranAt || running ? "bg-cyan-300 shadow-[0_0_6px_rgba(103,232,249,0.9)]" : "bg-slate-700"
                    }`}
                    style={
                      running
                        ? {
                            animation: `ledPulse 1.6s ease-in-out ${i * 0.15}s infinite`,
                          }
                        : undefined
                    }
                  />
                  {step}
                </div>
              ))}
            </div>

            <button
              type="button"
              disabled={!reportMarkdown}
              onClick={() => {
                if (!reportMarkdown) return;
                navigator.clipboard.writeText(reportMarkdown).then(() => toast.success("Report copied"));
              }}
              className="mt-5 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-[11px] text-slate-400 hover:border-cyan-400/30 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Copy className="h-3 w-3" /> Copy last report
            </button>
          </aside>
        </div>

        {/* Report preview */}
        <section className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/50 p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/70">
                Report preview
              </div>
              <h2 className="mt-1 text-lg font-semibold text-white">
                {tool.title} · Markdown output
              </h2>
            </div>
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${
              reportMarkdown ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-200" : "border-slate-700 bg-slate-900/60 text-slate-300"
            }`}>
              <Sparkles className="h-3 w-3" /> {reportMarkdown ? "Live result" : "No run yet"}
            </span>
          </div>
          <pre className="mt-4 max-h-96 overflow-auto rounded-xl border border-slate-800 bg-black/40 p-4 text-[12px] leading-relaxed text-slate-300 whitespace-pre-wrap">
{reportMarkdown || `Run "${tool.title}" to generate a real report here.\n\nThis tool executes through the real claude_jobs pipeline — the AKS worker (npm run worker) must be running to pick up the job.`}
          </pre>
        </section>

        {/* Peer tools */}
        <div className="mt-8 mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-cyan-300/80">
          <span className="h-px flex-1 bg-slate-800" />
          <span>Jump to another tool</span>
          <span className="h-px flex-1 bg-slate-800" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {peers.map((p) => {
            const PIcon = p.icon;
            return (
              <Link
                key={p.id}
                to="/seo-suite/$toolId"
                params={{ toolId: p.id }}
                className="group relative overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40 p-3 text-left transition hover:-translate-y-0.5 hover:border-cyan-400/40"
              >
                <div className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r ${p.accent}`} />
                <div className="flex items-center gap-2">
                  <span className={`grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br ${p.accent}`}>
                    <PIcon className="h-3.5 w-3.5 text-slate-950" />
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-xs font-semibold text-white">
                      {p.title}
                    </div>
                    <div className="truncate text-[10px] uppercase tracking-wider text-slate-500">
                      {SEO_CATEGORIES[p.category].label}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        <div aria-hidden className="h-16" />
      </div>

      <style>{`@keyframes ledPulse { 0%,100%{opacity:1} 50%{opacity:.35} }`}</style>
    </div>
  );
}
