import { Activity, CheckCircle2, Clock, Filter, Sparkles, UserCheck, X } from "lucide-react";
import { EXPERTS } from "@/lib/agents";
import type { Task } from "../types";
import agentBot from "@/assets/agent-bot.png";

export function WorkloadTasksModal({
  agentName,
  tasks,
  onClose,
  onOpenTaskDetail,
  onFilterKanban,
}: {
  agentName: string;
  tasks: Task[];
  onClose: () => void;
  onOpenTaskDetail: (task: Task) => void;
  onFilterKanban: (agentName: string) => void;
}) {
  const expert = EXPERTS.find((e) => e.title === agentName);
  const accent = expert?.accent ?? "from-cyan-400 to-blue-500";
  const agentTasks = tasks.filter((t) => t.assignee === agentName);
  const activeTasks = agentTasks.filter((t) => t.status !== "done");

  const criticalCount = activeTasks.filter((t) => t.priority === "critical").length;
  const highCount = activeTasks.filter((t) => t.priority === "high").length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl flex flex-col">
        {/* Top Gradient Accent */}
        <div className={`h-1.5 w-full bg-gradient-to-r ${accent}`} />

        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800/80 p-6">
          <div className="flex items-center gap-4 min-w-0">
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-slate-900 ring-1 ring-slate-700/60">
              <div className={`absolute inset-0 bg-gradient-to-br ${accent} opacity-30`} />
              <img src={agentBot} alt="" className="relative h-full w-full object-contain" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white truncate">{agentName}</h2>
                <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-semibold text-cyan-300">
                  {expert?.tag || "Expert Agent"}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-400">
                Assigned Workload: <span className="font-mono font-bold text-white">{activeTasks.length} active tasks</span> ({criticalCount} critical · {highCount} high priority)
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

        {/* Body Tasks List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {agentTasks.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/30 p-10 text-center text-xs text-slate-500">
              No tasks currently assigned to {agentName}.
            </div>
          ) : (
            agentTasks.map((t) => {
              const isDone = t.status === "done";
              return (
                <div
                  key={t.id}
                  onClick={() => {
                    onClose();
                    onOpenTaskDetail(t);
                  }}
                  className={`group relative overflow-hidden rounded-xl border p-4 transition cursor-pointer ${
                    isDone
                      ? "border-slate-800/60 bg-slate-900/30 opacity-70 hover:border-slate-700"
                      : "border-slate-800 bg-slate-900/50 hover:-translate-y-0.5 hover:border-cyan-400/40 hover:bg-slate-900/80 shadow-sm"
                  }`}
                >
                  <div
                    className={`absolute inset-y-0 left-0 w-1 ${
                      t.priority === "critical"
                        ? "bg-rose-500"
                        : t.priority === "high"
                        ? "bg-amber-400"
                        : t.priority === "medium"
                        ? "bg-cyan-400"
                        : "bg-slate-600"
                    }`}
                  />

                  <div className="flex items-start justify-between gap-3 pl-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-white group-hover:text-cyan-300 transition">
                          {t.title}
                        </span>
                      </div>
                      {t.desc && <p className="mt-1 text-xs text-slate-400 line-clamp-2">{t.desc}</p>}

                      <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[10px]">
                        <span className="rounded-full border border-slate-800 bg-slate-950 px-2 py-0.5 uppercase tracking-wider font-semibold text-slate-300">
                          Status: {t.status}
                        </span>
                        <span
                          className={`rounded-full border px-2 py-0.5 uppercase tracking-wider font-semibold ${
                            t.priority === "critical"
                              ? "border-rose-500/40 bg-rose-500/10 text-rose-300"
                              : t.priority === "high"
                              ? "border-amber-400/40 bg-amber-400/10 text-amber-300"
                              : "border-slate-700 bg-slate-900 text-slate-300"
                          }`}
                        >
                          {t.priority} Priority
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="shrink-0 rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-3 py-1.5 text-xs font-semibold text-cyan-300 transition group-hover:bg-cyan-400 group-hover:text-slate-950"
                    >
                      View Items & Approval →
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-800/80 p-4 bg-slate-950/80">
          <button
            onClick={() => {
              onFilterKanban(agentName);
              onClose();
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-xs font-bold text-cyan-200 transition hover:bg-cyan-400/20"
          >
            <Filter className="h-3.5 w-3.5" /> Filter Kanban Board for {agentName}
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
