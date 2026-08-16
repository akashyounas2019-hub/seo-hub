import { useState } from "react";
import { Search, X } from "lucide-react";
import { AGENTS, CADENCE_LABEL, CATEGORIES } from "../constants";
import type { Cadence, EditorState, Flow, Status } from "../types";

export function FlowEditor({
  state,
  onClose,
  onSave,
}: {
  state: EditorState;
  onClose: () => void;
  onSave: (data: {
    id?: string;
    name: string;
    desc: string;
    category: string;
    cadence: Cadence;
    status: Status;
    assignedAgents: string[];
  }) => void;
}) {
  if (!state) return null;
  const initial =
    state.mode === "edit"
      ? state.flow
      : {
          id: undefined as string | undefined,
          name: state.base?.name ?? "",
          desc: state.base?.desc ?? "",
          category: state.base?.category ?? CATEGORIES[0].id,
          cadence: state.base?.cadence ?? ("weekly" as Cadence),
          status: "draft" as Status,
          assignedAgents: [] as string[],
        };

  const [name, setName] = useState(initial.name);
  const [desc, setDesc] = useState(initial.desc);
  const [category, setCategory] = useState<string>(initial.category);
  const [cadence, setCadence] = useState<Cadence>(initial.cadence);
  const [status, setStatus] = useState<Status>(initial.status);
  const [assignedAgents, setAssignedAgents] = useState<string[]>(
    state.mode === "edit" ? (state.flow.assignedAgents ?? []) : [],
  );
  const [agentQuery, setAgentQuery] = useState("");

  const isEdit = state.mode === "edit";

  function toggleAgent(id: string) {
    setAssignedAgents((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  const filteredAgents = AGENTS.filter(
    (a) =>
      !agentQuery ||
      a.name.toLowerCase().includes(agentQuery.toLowerCase()) ||
      a.role.toLowerCase().includes(agentQuery.toLowerCase()),
  );

  return (
    <Modal onClose={onClose} title={isEdit ? "Edit automation" : "New automation"}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          onSave({
            id: isEdit ? (initial as Flow).id : undefined,
            name: name.trim(),
            desc: desc.trim(),
            category,
            cadence,
            status,
            assignedAgents,
          });
        }}
        className="space-y-3"
      >
        <Field label="Name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Dubai Marina landing pages"
            className="w-full rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400/50 focus:outline-none"
            required
          />
        </Field>
        <Field label="Description">
          <textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            rows={3}
            placeholder="What does this automation do?"
            className="w-full rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400/50 focus:outline-none"
          />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Category">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-md border border-slate-800 bg-slate-900/60 px-2 py-2 text-sm text-slate-100 focus:border-cyan-400/50 focus:outline-none"
            >
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Cadence">
            <select
              value={cadence}
              onChange={(e) => setCadence(e.target.value as Cadence)}
              className="w-full rounded-md border border-slate-800 bg-slate-900/60 px-2 py-2 text-sm text-slate-100 focus:border-cyan-400/50 focus:outline-none"
            >
              {(Object.keys(CADENCE_LABEL) as Cadence[]).map((c) => (
                <option key={c} value={c}>
                  {CADENCE_LABEL[c]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Status">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as Status)}
              className="w-full rounded-md border border-slate-800 bg-slate-900/60 px-2 py-2 text-sm text-slate-100 focus:border-cyan-400/50 focus:outline-none"
            >
              <option value="running">Running</option>
              <option value="paused">Paused</option>
              <option value="draft">Draft</option>
            </select>
          </Field>
        </div>

        <Field label={`Assigned agents${assignedAgents.length ? ` · ${assignedAgents.length} selected` : ""}`}>
          <div className="rounded-md border border-slate-800 bg-slate-950/60 p-2">
            <div className="relative mb-2">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
              <input
                value={agentQuery}
                onChange={(e) => setAgentQuery(e.target.value)}
                placeholder="Search agents…"
                className="w-full rounded border border-slate-800 bg-slate-900/60 py-1.5 pl-7 pr-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-cyan-400/50 focus:outline-none"
              />
            </div>
            <div className="max-h-44 overflow-y-auto pr-1">
              <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                {filteredAgents.map((a) => {
                  const AIcon = a.icon;
                  const selected = assignedAgents.includes(a.id);
                  return (
                    <li key={a.id}>
                      <button
                        type="button"
                        onClick={() => toggleAgent(a.id)}
                        className={`flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs transition ${
                          selected
                            ? "border-cyan-400/50 bg-cyan-400/10 text-cyan-100"
                            : "border-slate-800 bg-slate-900/40 text-slate-300 hover:border-slate-700 hover:bg-slate-900"
                        }`}
                      >
                        <span
                          className={`grid h-6 w-6 shrink-0 place-items-center rounded ${
                            selected ? "bg-cyan-400/20 text-cyan-200" : "bg-slate-800 text-slate-400"
                          }`}
                        >
                          <AIcon className="h-3 w-3" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium leading-tight">{a.name}</span>
                          <span className="block truncate text-[10px] text-slate-500">{a.role}</span>
                        </span>
                        <span
                          className={`grid h-4 w-4 shrink-0 place-items-center rounded border text-[10px] ${
                            selected
                              ? "border-cyan-400/60 bg-cyan-400/20 text-cyan-200"
                              : "border-slate-700 text-transparent"
                          }`}
                          aria-hidden
                        >
                          ✓
                        </span>
                      </button>
                    </li>
                  );
                })}
                {filteredAgents.length === 0 && (
                  <li className="col-span-full py-3 text-center text-[11px] text-slate-500">
                    No agents match “{agentQuery}”.
                  </li>
                )}
              </ul>
            </div>
            {assignedAgents.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-slate-800/70 pt-2">
                {assignedAgents.map((id) => {
                  const a = AGENTS.find((x) => x.id === id);
                  if (!a) return null;
                  return (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2 py-0.5 text-[10px] text-cyan-200"
                    >
                      {a.name}
                      <button
                        type="button"
                        onClick={() => toggleAgent(id)}
                        className="text-cyan-300/70 hover:text-cyan-100"
                        aria-label={`Remove ${a.name}`}
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </span>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setAssignedAgents([])}
                  className="ml-1 text-[10px] uppercase tracking-wider text-slate-500 hover:text-slate-300"
                >
                  Clear all
                </button>
              </div>
            )}
          </div>
        </Field>

        <div className="mt-2 flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-md border border-cyan-400/30 bg-cyan-400/15 px-3 py-1.5 text-xs font-medium text-cyan-200 hover:bg-cyan-400/25"
          >
            {isEdit ? "Save changes" : "Create flow"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function Modal({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-xl border border-slate-800 bg-slate-950 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">{title}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-white" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-slate-500">{label}</div>
      {children}
    </label>
  );
}
