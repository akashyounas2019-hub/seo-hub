import { useState } from "react";
import { Plus, Sparkles } from "lucide-react";
import { COLUMNS } from "../constants";
import type { Priority, Status, Task, Template } from "../types";
import { isoDaysFromNow } from "../utils/storage";

export function QuickAllocate({
  agents,
  templates,
  onCreate,
}: {
  agents: string[];
  templates: Template[];
  onCreate: (t: Omit<Task, "id" | "createdAt">) => void;
}) {
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState(agents[0] ?? "");
  const [priority, setPriority] = useState<Priority>("medium");
  const [status, setStatus] = useState<Status>("todo");
  const [templateId, setTemplateId] = useState<string>("");

  const applyTemplate = (id: string) => {
    setTemplateId(id);
    if (!id) return;
    const tpl = templates.find((t) => t.id === id);
    if (!tpl) return;
    setTitle(tpl.title);
    if (tpl.defaultAssignee) setAssignee(tpl.defaultAssignee);
    setPriority(tpl.priority);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onCreate({
      title: title.trim(),
      assignee: assignee || agents[0] || "Unassigned",
      priority,
      status,
      due: isoDaysFromNow(3),
      templateId: templateId || undefined,
    });
    setTitle("");
    setTemplateId("");
  };

  return (
    <form
      onSubmit={submit}
      className="relative overflow-hidden rounded-xl border border-cyan-400/25 bg-slate-950/70 p-4"
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-cyan-400 to-blue-500" />
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-cyan-300" />
        <div className="text-sm font-semibold text-white">Quick allocate</div>
      </div>
      <div className="space-y-3">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-slate-500">From template</label>
          <select
            value={templateId}
            onChange={(e) => applyTemplate(e.target.value)}
            className="mt-1 h-9 w-full rounded-md border border-slate-800 bg-slate-900/60 px-2 text-sm text-slate-100"
          >
            <option value="">— none —</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-slate-500">Task title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Compress hero images on /pricing"
            className="mt-1 w-full rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2 text-[13px] text-white placeholder:text-slate-600 focus:border-cyan-400/50 focus:outline-none"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-slate-500">Assignee</label>
            <select
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-slate-800 bg-slate-900/60 px-2 text-sm text-slate-100"
            >
              {agents.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
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
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-slate-500">Place in column</label>
          <div className="mt-1 grid grid-cols-4 gap-1.5">
            {COLUMNS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setStatus(c.id)}
                className={`rounded-md border px-2 py-1.5 text-[11px] transition ${
                  status === c.id
                    ? "border-cyan-400/60 bg-cyan-400/10 text-cyan-100"
                    : "border-slate-800 bg-slate-900/60 text-slate-400 hover:text-white"
                }`}
              >
                {c.title}
              </button>
            ))}
          </div>
        </div>
        <button
          type="submit"
          disabled={!title.trim()}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-gradient-to-r from-cyan-500 to-blue-600 px-3 py-2 text-[12px] font-semibold text-white shadow-[0_0_18px_rgba(34,211,238,0.35)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" /> Allocate task
        </button>
      </div>
    </form>
  );
}
