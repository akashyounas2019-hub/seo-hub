import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Copy,
  FileDown,
  History,
  Loader2,
  RefreshCw,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { Priority, Status, Task } from "../types";
import { EXPERTS } from "@/lib/agents";
import { MarkdownReport } from "@/components/markdown-report";
import { copyToClipboard } from "@/lib/clipboard";
import { TaskHistoryModal } from "./task-history-modal";

type JobStatus = "pending" | "claimed" | "running" | "done" | "failed" | "cancelled";

type JobState = {
  status: JobStatus;
  outputMarkdown?: string | null;
  error?: string | null;
} | null;

const JOB_STATUS_META: Record<JobStatus, { label: string; cls: string }> = {
  pending: { label: "Queued — waiting for the AKS worker", cls: "border-slate-700 bg-slate-800/50 text-slate-300" },
  claimed: { label: "Claimed by worker", cls: "border-cyan-400/30 bg-cyan-400/10 text-cyan-200" },
  running: { label: "Running", cls: "border-cyan-400/30 bg-cyan-400/10 text-cyan-200" },
  done: { label: "Complete", cls: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" },
  failed: { label: "Failed", cls: "border-rose-400/30 bg-rose-400/10 text-rose-300" },
  cancelled: { label: "Cancelled", cls: "border-slate-700 bg-slate-800/50 text-slate-400" },
};

/**
 * Polls the task's real linked claude_jobs row while it's in flight. Replaces
 * the old getSubItemsForTask() fabricated checklist (hardcoded fake URLs,
 * invented DR scores, invented FAQ text keyed off the task title) with the
 * task's actual execution state -- there is nothing to show until a real
 * job exists, and nothing here is invented. `generation` lets a caller
 * (the Regenerate button) force a fresh poll cycle after starting a new job.
 */
function useJobStatus(jobId: string | undefined, generation: number) {
  const [job, setJob] = useState<JobState>(null);
  const [loading, setLoading] = useState(!!jobId);

  useEffect(() => {
    if (!jobId) {
      setJob(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    setLoading(true);

    const poll = async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}`);
        const json = await res.json();
        if (cancelled) return;
        if (json?.ok && json.job) {
          setJob({ status: json.job.status, outputMarkdown: json.job.outputMarkdown, error: json.job.error });
          if (json.job.status === "done" || json.job.status === "failed" || json.job.status === "cancelled") {
            setLoading(false);
            return; // stop polling, terminal state reached
          }
        }
      } catch {
        /* keep last known state on a transient fetch failure */
      }
      setLoading(false);
      timer = setTimeout(poll, 4000);
    };

    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [jobId, generation]);

  return { job, loading };
}

export function TaskItemDetailModal({
  task,
  onClose,
  onUpdate,
  onDelete,
}: {
  task: Task;
  onClose: () => void;
  onUpdate: (id: string, patch: Partial<Task>) => void;
  onDelete: (id: string) => void;
}) {
  const [priority, setPriority] = useState<Priority>(task.priority);
  const [status, setStatus] = useState<Status>(task.status);
  const [assignee, setAssignee] = useState<string>(task.assignee);
  const [currentJobId, setCurrentJobId] = useState<string | undefined>(task.jobId);
  const [generation, setGeneration] = useState(0);
  const [regenerating, setRegenerating] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const { job, loading } = useJobStatus(currentJobId, generation);

  const handleSave = () => {
    onUpdate(task.id, { priority, status, assignee });
    toast.success("Task updated");
    onClose();
  };

  const handleRegenerate = async () => {
    if (regenerating) return;
    setRegenerating(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}/regenerate`, { method: "POST" });
      const json = await res.json();
      if (json?.ok && json.jobId) {
        setCurrentJobId(json.jobId);
        setGeneration((g) => g + 1);
        setStatus("inprogress");
        toast.success("Regenerating — a new AI run has started");
      } else {
        toast.error(json?.error || "Failed to regenerate");
      }
    } catch {
      toast.error("Failed to regenerate");
    } finally {
      setRegenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!job?.outputMarkdown) return;
    const ok = await copyToClipboard(job.outputMarkdown);
    if (ok) toast.success("Report copied");
    else toast.error("Couldn't copy to clipboard — try selecting the text manually");
  };

  const handleDownloadPdf = async () => {
    if (!job?.outputMarkdown || exportingPdf) return;
    setExportingPdf(true);
    try {
      const { exportMarkdownToPdf } = await import("@/lib/export-pdf");
      const slug = task.id.replace(/[^a-z0-9-]+/gi, "-");
      await exportMarkdownToPdf(job.outputMarkdown, `${slug}-report`, task.title);
      toast.success("PDF downloaded");
    } catch (err: any) {
      toast.error(`Could not generate PDF: ${err?.message || "unknown error"}`);
    } finally {
      setExportingPdf(false);
    }
  };

  const statusMeta = job ? JOB_STATUS_META[job.status] : null;
  const jobInFlight = job && ["pending", "claimed", "running"].includes(job.status);
  const canRegenerate = !!task.jobId && !jobInFlight;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl flex flex-col">
        {/* Top Accent Line */}
        <div
          className={`h-1 w-full bg-gradient-to-r ${
            priority === "critical"
              ? "from-rose-500 to-red-500"
              : priority === "high"
              ? "from-amber-400 to-orange-500"
              : priority === "medium"
              ? "from-cyan-400 to-blue-500"
              : "from-slate-600 to-slate-700"
          }`}
        />

        {/* Modal Header */}
        <div className="flex items-start justify-between border-b border-slate-800/80 p-6">
          <div className="min-w-0 flex-1 pr-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-slate-800 bg-slate-900 px-2 py-0.5 text-[10px] font-semibold text-slate-400">
                ID: {task.id}
              </span>
              {statusMeta && (
                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusMeta.cls}`}>
                  {jobInFlight && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
                  {statusMeta.label}
                </span>
              )}
            </div>
            <h2 className="mt-2 text-xl font-bold text-white leading-snug">{task.title}</h2>
            {task.desc && <p className="mt-1 whitespace-pre-line text-xs text-slate-400">{task.desc}</p>}
            {task.approvedBy && (
              <p className="mt-1.5 text-[11px] text-emerald-300">
                Approved by {task.approvedBy}
                {task.approvedAt && ` · ${new Date(task.approvedAt).toLocaleString()}`}
              </p>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={() => setShowHistory(true)}
              title="View this task's full history"
              className="rounded-lg border border-slate-800 bg-slate-900/60 p-2 text-slate-400 hover:border-cyan-400/40 hover:text-cyan-200"
            >
              <History className="h-4 w-4" />
            </button>
            <button
              onClick={onClose}
              className="rounded-lg border border-slate-800 bg-slate-900/60 p-2 text-slate-400 hover:border-slate-700 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Controls Bar */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 rounded-xl border border-slate-800/70 bg-slate-900/40 p-4">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-slate-500">Assignee</label>
              <select
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-xs font-semibold text-white focus:border-cyan-400 focus:outline-none"
              >
                {EXPERTS.map((e) => (
                  <option key={e.id} value={e.title}>
                    {e.title}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-wider text-slate-500">Stage / Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as Status)}
                className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-xs font-semibold text-white focus:border-cyan-400 focus:outline-none"
              >
                <option value="todo">To-Do / Backlog</option>
                <option value="inprogress">In Progress</option>
                <option value="review">Under Review</option>
                <option value="done">Done / Approved</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-wider text-slate-500">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
                className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-xs font-semibold text-white focus:border-cyan-400 focus:outline-none"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
          </div>

          {/* Execution status -- real claude_jobs state, nothing fabricated */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Result</h3>
              {job?.outputMarkdown && (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={handleCopy}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-900/60 px-2.5 py-1 text-[11px] text-slate-300 hover:border-cyan-400/40 hover:text-cyan-200"
                  >
                    <Copy className="h-3 w-3" /> Copy
                  </button>
                  <button
                    onClick={handleDownloadPdf}
                    disabled={exportingPdf}
                    title="Download this result as a PDF"
                    className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-900/60 px-2.5 py-1 text-[11px] text-slate-300 hover:border-cyan-400/40 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <FileDown className="h-3 w-3" /> {exportingPdf ? "Generating…" : "PDF"}
                  </button>
                  <button
                    onClick={handleRegenerate}
                    disabled={!canRegenerate || regenerating}
                    title={jobInFlight ? "Wait for the current run to finish first" : "Run this task again — a real new AI call, not a cached replay"}
                    className="inline-flex items-center gap-1 rounded-md border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-medium text-cyan-200 hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <RefreshCw className={`h-3 w-3 ${regenerating ? "animate-spin" : ""}`} />
                    {regenerating ? "Starting…" : "Regenerate"}
                  </button>
                </div>
              )}
            </div>

            {!currentJobId ? (
              <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/30 p-5 text-center text-xs text-slate-500">
                No job has been started for this task yet. Move it to "In Progress" to enqueue real execution
                through the AKS worker.
              </div>
            ) : loading ? (
              <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/30 p-5 text-xs text-slate-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading job status…
              </div>
            ) : job?.status === "failed" ? (
              <div className="space-y-2">
                <div className="flex items-start gap-2 rounded-xl border border-rose-400/30 bg-rose-500/5 p-4 text-xs text-rose-200">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <div>
                    <div className="font-semibold">Job failed</div>
                    {job.error && <div className="mt-1 whitespace-pre-line text-rose-300/80">{job.error}</div>}
                  </div>
                </div>
                <button
                  onClick={handleRegenerate}
                  disabled={regenerating}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-3 py-1.5 text-xs font-medium text-cyan-200 hover:bg-cyan-400/20 disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${regenerating ? "animate-spin" : ""}`} /> Retry
                </button>
              </div>
            ) : job?.outputMarkdown ? (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs text-emerald-300">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Real output from the AKS worker
                </div>
                <div className="max-h-96 overflow-y-auto rounded-xl border border-slate-800/80 bg-slate-900/60 p-4">
                  <MarkdownReport content={job.outputMarkdown} />
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/30 p-5 text-xs text-slate-500">
                <Clock className="h-3.5 w-3.5" /> Job is queued — output will appear here once the AKS worker
                completes it. (Is a worker running? <code className="text-slate-400">npm run worker</code>)
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex flex-wrap items-center justify-between border-t border-slate-800/80 p-4 bg-slate-950/80">
          <button
            onClick={() => {
              onDelete(task.id);
              toast.error("Task deleted");
              onClose();
            }}
            className="text-xs font-semibold text-rose-400 hover:text-rose-300 hover:underline"
          >
            Delete Task
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="rounded-lg bg-cyan-500 px-5 py-2 text-xs font-bold text-slate-950 shadow-md transition hover:bg-cyan-400"
            >
              Save & Apply Changes
            </button>
          </div>
        </div>
      </div>

      {showHistory && <TaskHistoryModal taskId={task.id} onClose={() => setShowHistory(false)} />}
    </div>
  );
}
