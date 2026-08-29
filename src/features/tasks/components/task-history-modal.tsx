import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Clock,
  History,
  Loader2,
  MessageSquare,
  PlusCircle,
  RefreshCw,
  Send,
  Trash2,
  X,
  XCircle,
} from "lucide-react";

type HistoryEntry = {
  id: string;
  actorEmail: string;
  action: string;
  detail: Record<string, unknown>;
  createdAt: string;
};

const ACTION_META: Record<string, { label: string; icon: typeof History; cls: string }> = {
  "task.created": { label: "Task created", icon: PlusCircle, cls: "border-cyan-400/30 bg-cyan-400/10 text-cyan-300" },
  "task.status_changed": { label: "Status changed", icon: RefreshCw, cls: "border-sky-400/30 bg-sky-400/10 text-sky-300" },
  "task.approved": { label: "Approved", icon: CheckCircle2, cls: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" },
  "task.rejected": { label: "Rejected", icon: XCircle, cls: "border-rose-500/30 bg-rose-500/10 text-rose-300" },
  "task.published": { label: "Published", icon: Send, cls: "border-violet-400/30 bg-violet-400/10 text-violet-300" },
  "task.regenerated": { label: "Regenerated", icon: RefreshCw, cls: "border-amber-400/30 bg-amber-400/10 text-amber-300" },
  "task.deleted": { label: "Deleted", icon: Trash2, cls: "border-slate-600/40 bg-slate-800/60 text-slate-300" },
  "task.commented": { label: "Comment added", icon: MessageSquare, cls: "border-indigo-400/30 bg-indigo-400/10 text-indigo-300" },
  "approvals.reevaluated": { label: "Rules re-evaluated", icon: RefreshCw, cls: "border-slate-600/40 bg-slate-800/60 text-slate-300" },
};

function describeEntry(e: HistoryEntry): string {
  const title = (e.detail?.title as string) || (e.detail?.taskId as string) || "task";
  switch (e.action) {
    case "task.created":
      return `Created "${title}" (${(e.detail?.priority as string) || "medium"} priority, assigned to ${(e.detail?.assignee as string) || "unassigned"})`;
    case "task.status_changed":
      return `Moved "${title}" from ${(e.detail?.previousStatus as string) || "?"} → ${(e.detail?.newStatus as string) || "?"}`;
    case "task.approved":
      return `Approved "${title}" → ${(e.detail?.newStatus as string) || "in progress"}${e.detail?.operatorNotes ? ` — note: "${e.detail.operatorNotes}"` : ""}`;
    case "task.rejected":
      return `Rejected "${title}"`;
    case "task.published":
      return `Published "${title}"${e.detail?.publishedUrl ? ` to ${e.detail.publishedUrl}` : ""}`;
    case "task.regenerated":
      return `Regenerated output for "${title}"`;
    case "task.deleted":
      return `Deleted "${title}"${e.detail?.statusAtDeletion ? ` (was in ${e.detail.statusAtDeletion})` : ""}`;
    case "task.commented":
      return `Comment on "${title}": "${(e.detail?.operatorNotes as string) || ""}"`;
    case "approvals.reevaluated":
      return `Re-evaluated approval rules against pending tasks`;
    default:
      return title;
  }
}

/**
 * Real Kanban board history -- reads /api/tasks/history, which is the same
 * audit_log table every approval/publish/regenerate/status-change action in
 * this app already writes to (src/lib/audit.ts). Not a separate feed.
 */
export function TaskHistoryModal({ taskId, onClose }: { taskId?: string; onClose: () => void }) {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState<string>("all");

  const load = () => {
    setError(null);
    const qs = new URLSearchParams({ limit: "300" });
    if (taskId) qs.set("taskId", taskId);
    fetch(`/api/tasks/history?${qs.toString()}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Failed to load history"))))
      .then((data) => {
        if (data?.ok) setEntries(data.entries || []);
        else setError(data?.error || "Failed to load history");
      })
      .catch((err) => setError(err.message || "Failed to load history"));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  const filtered = (entries || []).filter((e) => actionFilter === "all" || e.action === actionFilter);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl">
        <div className="h-1.5 w-full bg-gradient-to-r from-slate-400 to-slate-600" />

        <div className="flex items-center justify-between border-b border-slate-800/80 p-6">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-slate-900 ring-1 ring-slate-700/60 text-slate-300">
              <History className="h-4.5 w-4.5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">{taskId ? "Task History" : "Board History Log"}</h2>
              <p className="text-xs text-slate-400">
                {taskId ? "Full audit trail for this task." : "Every action across the Kanban board — created, moved, approved, rejected, published, deleted."}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-800 bg-slate-900/60 p-2 text-slate-400 hover:border-slate-700 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {!taskId && (
          <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-800/60 px-6 py-3">
            {["all", ...Object.keys(ACTION_META)].map((a) => (
              <button
                key={a}
                onClick={() => setActionFilter(a)}
                className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider transition ${
                  actionFilter === a
                    ? "border-cyan-400/50 bg-cyan-400/15 text-cyan-200"
                    : "border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                }`}
              >
                {a === "all" ? "All" : ACTION_META[a]?.label || a}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-200">{error}</div>
          )}

          {!error && entries === null && (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading history…
            </div>
          )}

          {!error && entries !== null && filtered.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/30 p-10 text-center text-xs text-slate-500">
              No history recorded yet.
            </div>
          )}

          {!error && filtered.length > 0 && (
            <ol className="relative space-y-4 border-l border-slate-800 pl-6">
              {filtered.map((e) => {
                const meta = ACTION_META[e.action] || { label: e.action, icon: History, cls: "border-slate-700 bg-slate-900 text-slate-300" };
                const Icon = meta.icon;
                return (
                  <li key={e.id} className="relative">
                    <span
                      className={`absolute -left-[31px] grid h-6 w-6 place-items-center rounded-full border ${meta.cls}`}
                    >
                      <Icon className="h-3 w-3" />
                    </span>
                    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${meta.cls}`}>
                          {meta.label}
                        </span>
                        <span className="inline-flex items-center gap-1 text-[10px] text-slate-500">
                          <Clock className="h-3 w-3" /> {new Date(e.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-slate-200">{describeEntry(e)}</p>
                      <p className="mt-1 text-[11px] text-slate-500">by {e.actorEmail}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-slate-800/80 p-4 bg-slate-950/80">
          <button
            onClick={load}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-3.5 py-2 text-xs font-semibold text-slate-300 hover:border-cyan-400/40 hover:text-cyan-200"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
