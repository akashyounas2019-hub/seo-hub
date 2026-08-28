import { useEffect, useState } from "react";
import {
  Activity,
  Bot,
  CheckCircle2,
  Clock,
  Cpu,
  FileCode,
  FileText,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Terminal,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { jobsStore, type AIJob } from "@/lib/jobs-store";
import { TEMPLATES } from "@/lib/job-templates";
import { MarkdownReport } from "@/components/markdown-report";

export function JobsManagerModal({ onClose }: { onClose: () => void }) {
  const [jobs, setJobs] = useState<AIJob[]>([]);
  const [selectedJob, setSelectedJob] = useState<AIJob | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);

  const reload = async () => {
    const list = await jobsStore.getAll();
    setJobs(list);
    setSelectedJob((prev) => {
      if (!prev && list.length > 0) return list[0];
      if (prev) return list.find((j) => j.id === prev.id) || prev;
      return prev;
    });
  };

  useEffect(() => {
    reload();
    const interval = setInterval(reload, 3000);
    return () => clearInterval(interval);
  }, []);

  const pendingCount = jobs.filter((j) => j.status === "pending").length;
  const runningCount = jobs.filter((j) => j.status === "running" || j.status === "claimed").length;
  const doneCount = jobs.filter((j) => j.status === "done").length;

  const [regenerating, setRegenerating] = useState(false);
  const handleRegenerate = async (job: AIJob) => {
    if (regenerating) return;
    setRegenerating(true);
    try {
      // A genuinely new claude_jobs row with the same kind/input -- a real
      // new AI call, not a cached replay of the same output.
      const created = await jobsStore.create({
        kind: job.kind,
        title: job.title,
        input: job.input,
        priority: job.priority,
        createdBy: "Operator (regenerate)",
      });
      if (created) {
        await reload();
        setSelectedJob(created);
      }
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="flex h-[88vh] w-full max-w-6xl overflow-hidden rounded-2xl border border-cyan-500/30 bg-slate-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left Sidebar - Jobs List */}
        <div className="flex w-1/3 min-w-[320px] flex-col border-r border-slate-800 bg-slate-950/70">
          <div className="border-b border-slate-800 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cpu className="h-5 w-5 text-cyan-300" />
                <h2 className="text-base font-semibold text-white">AKS Worker Queue</h2>
              </div>
              <button
                onClick={() => setShowNewModal(true)}
                className="inline-flex items-center gap-1 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 px-2.5 py-1 text-xs font-semibold text-white shadow hover:brightness-110"
              >
                <Plus className="h-3.5 w-3.5" /> Enqueue Job
              </button>
            </div>

            {/* Quick status counters */}
            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[10px]">
              <div className="rounded-md border border-amber-500/20 bg-amber-500/10 py-1.5 font-medium text-amber-300">
                {pendingCount} Pending
              </div>
              <div className="rounded-md border border-cyan-500/20 bg-cyan-500/10 py-1.5 font-medium text-cyan-300">
                {runningCount} Running
              </div>
              <div className="rounded-md border border-emerald-500/20 bg-emerald-500/10 py-1.5 font-medium text-emerald-300">
                {doneCount} Done
              </div>
            </div>
          </div>

          {/* Job Items */}
          <div className="scrollbar-thin flex-1 overflow-y-auto p-2 space-y-1">
            {jobs.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">No jobs in queue yet.</div>
            ) : (
              jobs.map((j) => {
                const isSelected = selectedJob?.id === j.id;
                return (
                  <button
                    key={j.id}
                    onClick={() => setSelectedJob(j)}
                    className={`w-full rounded-xl border p-3 text-left transition ${
                      isSelected
                        ? "border-cyan-400/50 bg-slate-900/90 shadow-[0_0_15px_rgba(34,211,238,0.15)]"
                        : "border-slate-800/80 bg-slate-900/30 hover:border-slate-700 hover:bg-slate-900/60"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-semibold text-white">{j.title}</span>
                      <StatusBadge status={j.status} />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400">
                      <span className="font-mono">{j.kind}</span>
                      <span>{new Date(j.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Panel - Job Details & Output */}
        <div className="flex flex-1 flex-col overflow-hidden bg-slate-950">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-800 p-4">
            {selectedJob ? (
              <div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={selectedJob.status} />
                  <span className="font-mono text-xs text-slate-400">{selectedJob.kind}</span>
                </div>
                <h3 className="mt-1 text-lg font-semibold text-white">{selectedJob.title}</h3>
              </div>
            ) : (
              <div className="text-sm text-slate-400">Select a job to view details</div>
            )}
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Job Body */}
          {selectedJob ? (
            <div className="scrollbar-thin flex-1 overflow-y-auto p-6 space-y-6">
              {/* Telemetry info */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
                  <div className="text-[10px] uppercase text-slate-500">Worker Status</div>
                  <div className="mt-1 text-xs font-semibold text-cyan-300">
                    {selectedJob.workerId || "Waiting for worker"}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
                  <div className="text-[10px] uppercase text-slate-500">Duration</div>
                  <div className="mt-1 text-xs font-semibold text-white">
                    {selectedJob.durationMs
                      ? `${(selectedJob.durationMs / 1000).toFixed(1)}s`
                      : "—"}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
                  <div className="text-[10px] uppercase text-slate-500">Priority</div>
                  <div className="mt-1 text-xs font-semibold uppercase text-slate-300">
                    {selectedJob.priority}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
                  <div className="text-[10px] uppercase text-slate-500">Created At</div>
                  <div className="mt-1 text-xs font-semibold text-slate-300">
                    {new Date(selectedJob.createdAt).toLocaleTimeString()}
                  </div>
                </div>
              </div>

              {/* Output Markdown section */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    AI Output
                  </span>
                  {selectedJob.outputMarkdown && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => navigator.clipboard.writeText(selectedJob.outputMarkdown || "")}
                        className="text-[11px] text-cyan-300 hover:underline"
                      >
                        Copy Output
                      </button>
                      <button
                        onClick={() => handleRegenerate(selectedJob)}
                        disabled={regenerating}
                        title="Runs a real new AI call — not a cached replay"
                        className="inline-flex items-center gap-1 rounded-md border border-cyan-400/30 bg-cyan-400/10 px-2 py-0.5 text-[11px] font-medium text-cyan-200 hover:bg-cyan-400/20 disabled:opacity-50"
                      >
                        <RefreshCw className={`h-3 w-3 ${regenerating ? "animate-spin" : ""}`} /> Regenerate
                      </button>
                    </div>
                  )}
                </div>

                <div className="min-h-[220px] rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                  {selectedJob.outputMarkdown ? (
                    <MarkdownReport content={selectedJob.outputMarkdown} />
                  ) : selectedJob.status === "failed" ? (
                    <div className="text-rose-400">Error: {selectedJob.error}</div>
                  ) : selectedJob.status === "running" || selectedJob.status === "claimed" ? (
                    <div className="flex items-center gap-2 text-cyan-300">
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Claude Code CLI is executing job on local machine...
                    </div>
                  ) : (
                    <div className="text-slate-500">
                      Job is queued. Run <code className="text-cyan-300">node aks-worker.mjs</code> on your machine to execute it via local Claude CLI.
                    </div>
                  )}
                </div>
              </div>

              {/* Action row */}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={async () => {
                    await jobsStore.delete(selectedJob.id);
                    reload();
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-300 hover:bg-rose-500/20"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Remove Job
                </button>
              </div>
            </div>
          ) : (
            <div className="grid flex-1 place-items-center text-sm text-slate-500">
              Select a job from the queue sidebar
            </div>
          )}
        </div>
      </div>

      {showNewModal && (
        <CreateJobModal
          onClose={() => setShowNewModal(false)}
          onCreated={() => {
            setShowNewModal(false);
            reload();
          }}
        />
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: AIJob["status"] }) {
  if (status === "done")
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[9px] font-semibold text-emerald-300">
        <CheckCircle2 className="h-3 w-3" /> Done
      </span>
    );
  if (status === "running" || status === "claimed")
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2 py-0.5 text-[9px] font-semibold text-cyan-300">
        <RefreshCw className="h-3 w-3 animate-spin" /> Running
      </span>
    );
  if (status === "failed")
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-rose-400/30 bg-rose-400/10 px-2 py-0.5 text-[9px] font-semibold text-rose-300">
        Failed
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[9px] font-semibold text-amber-300">
      <Clock className="h-3 w-3" /> Pending
    </span>
  );
}

function CreateJobModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const templateKeys = Object.keys(TEMPLATES);
  const [kind, setKind] = useState(templateKeys[0]);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("https://akscleaning.ae");
  const [topic, setTopic] = useState("Villa Deep Cleaning in Dubai");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalTitle = title.trim() || `${TEMPLATES[kind]?.label || kind} task`;
    await jobsStore.create({
      kind,
      title: finalTitle,
      input: { url, topic, keyword: "deep cleaning dubai", city: "Dubai" },
      priority: "normal",
      createdBy: "Operator",
    });
    onCreated();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="w-full max-w-lg overflow-hidden rounded-2xl border border-cyan-500/30 bg-slate-950 p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h3 className="text-base font-semibold text-white">Enqueue AI Worker Job</h3>
          <button type="button" onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"><X className="h-4 w-4" /></button>
        </div>

        <div className="mt-4 space-y-4">
          <div>
            <label className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Job Kind / Template</label>
            <select value={kind} onChange={(e) => setKind(e.target.value)} className="mt-1 w-full rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-100 focus:border-cyan-400/50 focus:outline-none">
              {templateKeys.map((k) => (
                <option key={k} value={k}>{TEMPLATES[k].label} ({k})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Job Label / Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Audit Technical SEO for akscleaning.ae" className="mt-1 w-full rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-100 focus:border-cyan-400/50 focus:outline-none" required />
          </div>

          <div>
            <label className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Target URL / Topic Input</label>
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://akscleaning.ae" className="mt-1 w-full rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-100 focus:border-cyan-400/50 focus:outline-none" />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2 border-t border-slate-800 pt-4">
          <button type="button" onClick={onClose} className="rounded-md border border-slate-800 bg-slate-900/40 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-900">Cancel</button>
          <button type="submit" className="rounded-md bg-gradient-to-r from-cyan-500 to-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow hover:brightness-110">Enqueue Job</button>
        </div>
      </form>
    </div>
  );
}
