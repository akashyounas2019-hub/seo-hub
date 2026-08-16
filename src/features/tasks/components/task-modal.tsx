import { useState } from "react";
import { ClipboardList, Plus, X } from "lucide-react";
import { COLUMNS } from "../constants";
import type { Priority, Status, Task, Template } from "../types";

export function TaskModal({
  agents,
  templates,
  initial,
  onClose,
  onSave,
}: {
  agents: string[];
  templates: Template[];
  initial: Partial<Task> | null;
  onClose: () => void;
  onSave: (t: Omit<Task, "id" | "createdAt">) => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [desc, setDesc] = useState(initial?.desc ?? "");
  const [assignee, setAssignee] = useState(initial?.assignee ?? agents[0] ?? "");
  const [priority, setPriority] = useState<Priority>(initial?.priority ?? "medium");
  const [status, setStatus] = useState<Status>(initial?.status ?? "todo");
  const [due, setDue] = useState<string>(initial?.due?.slice(0, 16) ?? "");
  const [templateId, setTemplateId] = useState<string>(initial?.templateId ?? "");

  const applyTemplate = (id: string) => {
    setTemplateId(id);
    if (!id) return;
    const tpl = templates.find((t) => t.id === id);
    if (!tpl) return;
    setTitle(tpl.title);
    setDesc(tpl.desc);
    if (tpl.defaultAssignee) setAssignee(tpl.defaultAssignee);
    setPriority(tpl.priority);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSave({
      title: title.trim(),
      desc: desc.trim() || undefined,
      assignee,
      priority,
      status,
      due: due ? new Date(due).toISOString() : undefined,
      templateId: templateId || undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4 backdrop-blur-sm" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl overflow-hidden rounded-2xl border border-cyan-500/25 bg-slate-950 shadow-2xl"
      >
        <div className="h-1 w-full bg-gradient-to-r from-cyan-400 to-blue-500" />
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-cyan-400 to-blue-500 text-slate-950 shadow">
              <ClipboardList className="h-4 w-4" />
            </div>
            <div>
              <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-cyan-300/80">
                Task Allocation
              </div>
              <h2 className="text-base font-semibold text-white">New Task</h2>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-4 px-5 py-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="text-[10px] uppercase tracking-wider text-slate-500">Template (optional)</label>
            <select
              value={templateId}
              onChange={(e) => applyTemplate(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-slate-800 bg-slate-900/60 px-2 text-sm text-slate-100"
            >
              <option value="">— start from scratch —</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="text-[10px] uppercase tracking-wider text-slate-500">Title</label>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs to happen?"
              className="mt-1 w-full rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2 text-[13px] text-white placeholder:text-slate-600 focus:border-cyan-400/50 focus:outline-none"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-[10px] uppercase tracking-wider text-slate-500">Description</label>
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              rows={3}
              placeholder="Context, acceptance criteria, links…"
              className="mt-1 w-full rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2 text-[13px] text-white placeholder:text-slate-600 focus:border-cyan-400/50 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-slate-500">Assignee</label>
            <select
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-slate-800 bg-slate-900/60 px-2 text-sm text-slate-100"
            >
              {agents.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-slate-500">Priority</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as Priority)}
              className="mt-1 h-9 w-full rounded-md border border-slate-800 bg-slate-900/60 px-2 text-sm text-slate-100"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-slate-500">Column</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as Status)}
              className="mt-1 h-9 w-full rounded-md border border-slate-800 bg-slate-900/60 px-2 text-sm text-slate-100"
            >
              {COLUMNS.map((c) => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-slate-500">Due</label>
            <input
              type="datetime-local"
              value={due}
              onChange={(e) => setDue(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-slate-800 bg-slate-900/60 px-2 text-sm text-slate-100"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-800 bg-slate-950/60 px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-md border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-[12px] font-medium text-slate-200 hover:bg-slate-800">
            Cancel
          </button>
          <button
            type="submit"
            disabled={!title.trim()}
            className="inline-flex items-center gap-1.5 rounded-md bg-gradient-to-r from-cyan-500 to-blue-600 px-3 py-1.5 text-[12px] font-semibold text-white shadow-[0_0_18px_rgba(34,211,238,0.35)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" /> Create task
          </button>
        </div>
      </form>
    </div>
  );
}
