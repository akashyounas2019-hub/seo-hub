import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, GripVertical, Loader2, Sparkles, Timer, Trash2, Users, XCircle } from "lucide-react";
import { PRIORITY_META } from "../constants";
import type { Priority, Task } from "../types";
import { relativeDue } from "../utils/storage";

export function KanbanCard({
  task,
  dragging,
  onDragStart,
  onDragEnd,
  onRemove,
  onPriorityChange,
  onClick,
  onPublished,
}: {
  task: Task;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onRemove: () => void;
  onPriorityChange: (p: Priority) => void;
  onClick?: () => void;
  // Called after a real successful WordPress publish so the board can
  // refresh -- only relevant for cards in the "review" column.
  onPublished?: () => void;
}) {
  const [publishing, setPublishing] = useState(false);

  const handlePublish = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (publishing) return;
    setPublishing(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}/publish`, { method: "POST" });
      const json = await res.json();
      if (json?.ok) {
        toast.success("Published to WordPress", { description: json.publishedUrl });
        onPublished?.();
      } else {
        toast.error(json?.error || "Failed to publish");
      }
    } catch {
      toast.error("Failed to publish");
    } finally {
      setPublishing(false);
    }
  };

  const handleCancel = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      });
      const json = await res.json();
      if (json?.error) throw new Error(json.error);
      toast.success("Task cancelled");
      onPublished?.(); // reuse the same "refresh the board" callback
    } catch (err: any) {
      toast.error(err?.message || "Failed to cancel task");
    }
  };
  const meta = PRIORITY_META[task.priority];
  const due = relativeDue(task.due);
  const overdue = task.due ? new Date(task.due).getTime() < Date.now() && task.status !== "done" : false;

  return (
    <article
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("button") || (e.target as HTMLElement).closest("select")) return;
        onClick?.();
      }}
      className={`group relative cursor-pointer overflow-hidden rounded-lg border bg-slate-950/70 p-3 shadow-sm transition active:cursor-grabbing ${
        dragging
          ? "rotate-1 scale-[0.98] border-cyan-400/60 opacity-70"
          : `border-slate-800 hover:-translate-y-0.5 hover:border-cyan-400/40 hover:shadow-[0_6px_24px_rgba(34,211,238,0.08)] ${meta.ring}`
      }`}
    >
      <div
        className={`absolute inset-y-0 left-0 w-[3px] bg-gradient-to-b ${
          task.priority === "critical"
            ? "from-rose-500 to-red-500"
            : task.priority === "high"
            ? "from-amber-400 to-orange-500"
            : task.priority === "medium"
            ? "from-cyan-400 to-blue-500"
            : "from-slate-600 to-slate-700"
        }`}
      />

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-1.5">
            <GripVertical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-600 group-hover:text-slate-400" />
            <div className="min-w-0 text-[13px] font-medium leading-snug text-white">{task.title}</div>
          </div>
          {task.desc && (
            <div className="mt-1 pl-5 text-[11px] leading-relaxed text-slate-400 line-clamp-2">{task.desc}</div>
          )}
        </div>
        <button
          onClick={onRemove}
          className="rounded p-1 text-slate-600 opacity-0 transition hover:bg-slate-800 hover:text-rose-300 group-hover:opacity-100"
          aria-label="Delete task"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 pl-5">
        <select
          value={task.priority}
          onChange={(e) => onPriorityChange(e.target.value as Priority)}
          className={`appearance-none rounded-full border px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider focus:outline-none ${meta.cls}`}
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="critical">Critical</option>
        </select>
        <span className="inline-flex items-center gap-1 rounded-full border border-slate-800 bg-slate-950/60 px-1.5 py-px text-[9px] uppercase tracking-wider text-slate-400">
          <Users className="h-2.5 w-2.5" /> {task.assignee}
        </span>
        {due && (
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-px text-[9px] uppercase tracking-wider ${
              overdue
                ? "border-rose-500/40 bg-rose-500/10 text-rose-200"
                : "border-slate-800 bg-slate-950/60 text-slate-400"
            }`}
          >
            <Timer className="h-2.5 w-2.5" /> {due}
          </span>
        )}
        {(task.jobId || task.outputMarkdown) && (
          <span className="inline-flex items-center gap-1 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-1.5 py-px text-[9px] font-mono text-cyan-300">
            <Sparkles className="h-2.5 w-2.5 text-cyan-300" /> AI Worker Linked
          </span>
        )}
      </div>

      {task.status === "review" && (
        <div className="mt-2.5 flex items-center gap-1.5 border-t border-slate-800/70 pt-2.5 pl-5">
          <button
            onClick={handleCancel}
            className="inline-flex flex-1 items-center justify-center gap-1 rounded-md border border-rose-400/30 bg-rose-500/10 px-2 py-1 text-[10px] font-medium text-rose-200 hover:bg-rose-500/20"
          >
            <XCircle className="h-3 w-3" /> Reject & Cancel
          </button>
          <button
            onClick={handlePublish}
            disabled={publishing || !task.outputMarkdown}
            title={!task.outputMarkdown ? "No AI output to publish yet" : "Publish to WordPress"}
            className="inline-flex flex-1 items-center justify-center gap-1 rounded-md border border-emerald-400/30 bg-emerald-500/10 px-2 py-1 text-[10px] font-medium text-emerald-200 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {publishing ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
            {publishing ? "Publishing…" : "Approve & Publish"}
          </button>
        </div>
      )}
    </article>
  );
}
