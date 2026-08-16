import { useState } from "react";
import { BookmarkPlus, Plus, Trash2, X } from "lucide-react";
import { PRIORITY_META } from "../constants";
import type { Priority, Template } from "../types";

export function TemplateEditor({
  agents,
  templates,
  onClose,
  onSave,
  onDelete,
}: {
  agents: string[];
  templates: Template[];
  onClose: () => void;
  onSave: (tpl: Omit<Template, "id"> & { id?: string }) => void;
  onDelete: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [defaultAssignee, setDefaultAssignee] = useState<string>(agents[0] ?? "");
  const [priority, setPriority] = useState<Priority>("medium");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !title.trim()) return;
    onSave({
      name: name.trim(),
      title: title.trim(),
      desc: desc.trim(),
      defaultAssignee,
      priority,
    });
    setName("");
    setTitle("");
    setDesc("");
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl overflow-hidden rounded-2xl border border-cyan-500/25 bg-slate-950 shadow-2xl"
      >
        <div className="h-1 w-full bg-gradient-to-r from-violet-400 to-fuchsia-500" />
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-violet-400 to-fuchsia-500 text-slate-950 shadow">
              <BookmarkPlus className="h-4 w-4" />
            </div>
            <div>
              <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-cyan-300/80">
                Templates
              </div>
              <h2 className="text-base font-semibold text-white">Manage Task Templates</h2>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-5 p-5 lg:grid-cols-2">
          <form onSubmit={submit} className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/70 p-4">
            <div className="text-[11px] uppercase tracking-wider text-slate-500">New template</div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-slate-500">Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Blog refresh cadence" className="mt-1 w-full rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2 text-[13px] text-white focus:border-cyan-400/50 focus:outline-none" />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-slate-500">Default task title</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Refresh {{url}}" className="mt-1 w-full rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2 text-[13px] text-white focus:border-cyan-400/50 focus:outline-none" />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-slate-500">Playbook / description</label>
              <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} className="mt-1 w-full rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2 text-[13px] text-white focus:border-cyan-400/50 focus:outline-none" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-slate-500">Default assignee</label>
                <select value={defaultAssignee} onChange={(e) => setDefaultAssignee(e.target.value)} className="mt-1 h-9 w-full rounded-md border border-slate-800 bg-slate-900/60 px-2 text-sm text-slate-100">
                  {agents.map((a) => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-slate-500">Priority</label>
                <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)} className="mt-1 h-9 w-full rounded-md border border-slate-800 bg-slate-900/60 px-2 text-sm text-slate-100">
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
            </div>
            <button type="submit" disabled={!name.trim() || !title.trim()} className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-gradient-to-r from-violet-500 to-fuchsia-500 px-3 py-2 text-[12px] font-semibold text-white shadow transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">
              <Plus className="h-3.5 w-3.5" /> Save template
            </button>
          </form>

          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
            <div className="mb-2 text-[11px] uppercase tracking-wider text-slate-500">Existing ({templates.length})</div>
            <ul className="max-h-[420px] space-y-2 overflow-auto pr-1">
              {templates.map((tpl) => {
                const meta = PRIORITY_META[tpl.priority];
                return (
                  <li key={tpl.id} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-white">{tpl.name}</div>
                        <div className="mt-0.5 line-clamp-2 text-[11px] text-slate-400">{tpl.desc}</div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-px text-[9px] uppercase tracking-wider ${meta.cls}`}>
                            {meta.label}
                          </span>
                          {tpl.defaultAssignee && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-slate-800 bg-slate-950/60 px-1.5 py-px text-[9px] uppercase tracking-wider text-slate-400">
                              {tpl.defaultAssignee}
                            </span>
                          )}
                        </div>
                      </div>
                      {!tpl.builtIn && (
                        <button
                          onClick={() => onDelete(tpl.id)}
                          className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-rose-300"
                          aria-label="Delete template"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-800 bg-slate-950/60 px-5 py-3">
          <button onClick={onClose} className="rounded-md border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-[12px] font-medium text-slate-200 hover:bg-slate-800">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
