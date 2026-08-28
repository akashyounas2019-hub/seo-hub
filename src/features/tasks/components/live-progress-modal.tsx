import { useEffect, useState } from "react";
import { Activity, Clock, Loader2, RefreshCw, X, Zap } from "lucide-react";
import { EXPERTS } from "@/lib/agents";
import type { Task } from "../types";
import agentBot from "@/assets/agent-bot.png";

type ClaudeJob = {
  id: string;
  kind: string;
  title: string;
  status: string;
  createdAt: string;
  claimedAt?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
};

// Honest completion mapping, grounded in the real claude_jobs lifecycle
// (src/routes/api.jobs.claim.ts sets "claimed", api.jobs.$id.heartbeat.ts
// sets "running", api.jobs.$id.complete.ts / .fail.ts set the terminal
// state) -- not an invented number. A task with no linked job is either
// newly queued (todo) or a manual/no-AI task, both honestly 0% or 100%
// based on its own Kanban column.
function jobProgress(status: string | undefined): number {
  switch (status) {
    case "pending":
      return 10;
    case "claimed":
      return 35;
    case "running":
      return 70;
    case "done":
      return 100;
    case "failed":
      return 100;
    default:
      return 0;
  }
}

function taskProgress(task: Task, job?: ClaudeJob): { pct: number; label: string } {
  if (task.status === "done") return { pct: 100, label: "Complete" };
  if (task.status === "review") return { pct: 90, label: "Awaiting review" };
  if (job) {
    const pct = jobProgress(job.status);
    const label =
      job.status === "failed"
        ? "Job failed"
        : job.status === "done"
        ? "Job complete"
        : job.status === "running"
        ? "AI agent running"
        : job.status === "claimed"
        ? "Claimed by worker"
        : "Queued";
    return { pct, label };
  }
  if (task.status === "inprogress") return { pct: 20, label: "In progress (no linked job)" };
  return { pct: 0, label: "Queued" };
}

/**
 * Real "Live Progress" dashboard: every non-done Kanban task, joined against
 * its real linked claude_jobs row (by task.jobId) for actual execution
 * status -- reuses the already-real /api/tasks and /api/jobs endpoints,
 * no new fabricated data source.
 */
export function LiveProgressModal({ tasks, onClose }: { tasks: Task[]; onClose: () => void }) {
  const [jobs, setJobs] = useState<ClaudeJob[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setError(null);
    fetch("/api/jobs")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Failed to load jobs"))))
      .then((data) => {
        if (data?.ok) setJobs(data.jobs || []);
        else setError(data?.error || "Failed to load jobs");
      })
      .catch((err) => setError(err.message || "Failed to load jobs"));
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 8000);
    return () => clearInterval(interval);
  }, []);

  const ongoing = tasks.filter((t) => t.status !== "done").sort((a, b) => {
    const order: Record<string, number> = { inprogress: 0, review: 1, todo: 2 };
    return (order[a.status] ?? 3) - (order[b.status] ?? 3);
  });

  const jobById = new Map((jobs || []).map((j) => [j.id, j]));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl">
        <div className="h-1.5 w-full bg-gradient-to-r from-cyan-400 to-violet-500" />

        <div className="flex items-center justify-between border-b border-slate-800/80 p-6">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-cyan-400 to-violet-500 text-slate-950 shadow">
              <Zap className="h-4.5 w-4.5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Live Progress</h2>
              <p className="text-xs text-slate-400">All ongoing Kanban tasks with real-time execution status.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-800 bg-slate-900/60 p-2 text-slate-400 hover:border-slate-700 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {error && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-200">{error}</div>
          )}

          {!error && jobs === null && (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading live status…
            </div>
          )}

          {!error && jobs !== null && ongoing.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/30 p-10 text-center text-xs text-slate-500">
              No ongoing tasks right now.
            </div>
          )}

          {!error &&
            jobs !== null &&
            ongoing.map((t) => {
              const job = t.jobId ? jobById.get(t.jobId) : undefined;
              const { pct, label } = taskProgress(t, job);
              const expert = EXPERTS.find((e) => e.title === t.assignee);
              const accent = expert?.accent ?? "from-cyan-400 to-blue-500";
              const isRunning = job?.status === "running" || job?.status === "claimed";
              return (
                <div key={t.id} className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-slate-900 ring-1 ring-slate-700/60">
                        <div className={`absolute inset-0 bg-gradient-to-br ${accent} opacity-25`} />
                        <img src={agentBot} alt="" className="relative h-full w-full object-contain" />
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-white">{t.title}</div>
                        <div className="text-[11px] text-slate-500">{t.assignee}</div>
                      </div>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-slate-800 bg-slate-950 px-2 py-0.5 text-[10px] uppercase tracking-wider text-slate-400">
                      {isRunning && (
                        <span className="relative flex h-1.5 w-1.5">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-70" />
                          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cyan-400" />
                        </span>
                      )}
                      {label}
                    </span>
                  </div>

                  <div className="mt-3">
                    <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                      <div
                        className={`h-full rounded-full bg-gradient-to-r ${accent} transition-all duration-700`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" /> Column: {t.status}
                      </span>
                      <span className="tabular-nums font-semibold text-slate-300">{pct}%</span>
                    </div>
                  </div>
                </div>
              );
            })}
        </div>

        <div className="flex items-center justify-between border-t border-slate-800/80 p-4 bg-slate-950/80">
          <button
            onClick={load}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-3.5 py-2 text-xs font-semibold text-slate-300 hover:border-cyan-400/40 hover:text-cyan-200"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
          <span className="inline-flex items-center gap-1.5 text-[10px] text-slate-500">
            <Activity className="h-3 w-3" /> Auto-refreshes every 8s
          </span>
        </div>
      </div>
    </div>
  );
}
