"use client";

/**
 * ScoutHubClient — client half of /admin/scout.
 * Left: agent grid (click to select).
 * Right: task-type list filtered to the selected agent's allow-list + form.
 * Submits to assignSeoAgentTaskAction with triggerSource='scout'.
 */
import { useMemo, useState } from "react";

interface Load { pending: number; claimed: number; running: number; done7d: number }

interface Agent {
  id: string;
  name: string;
  title: string;
  focus: string;
  isCustom: boolean;
  taskTypes: string[];
  load: Load;
}

interface TaskType { id: string; label: string; description: string }

interface Site { slug: string; name: string }

export interface ScoutHubClientProps {
  roster: Agent[];
  taskTypes: TaskType[];
  sites: Site[];
  preselectedAgentId: string;
  assignAction: (formData: FormData) => Promise<void>;
}

export function ScoutHubClient({
  roster,
  taskTypes,
  sites,
  preselectedAgentId,
  assignAction,
}: ScoutHubClientProps) {
  const [agentId, setAgentId] = useState<string>(preselectedAgentId);
  const selectedAgent = roster.find((a) => a.id === agentId) ?? roster[0];

  const visibleTaskTypes = useMemo(() => {
    const allow = selectedAgent?.taskTypes ?? ["custom"];
    return taskTypes.filter((t) => allow.includes(t.id));
  }, [selectedAgent, taskTypes]);

  const [taskType, setTaskType] = useState<string>(visibleTaskTypes[0]?.id ?? "custom");
  const validTaskType = visibleTaskTypes.some((t) => t.id === taskType)
    ? taskType
    : visibleTaskTypes[0]?.id ?? "custom";

  const [siteSlug, setSiteSlug] = useState<string>("");
  const [instructions, setInstructions] = useState<string>("");
  const [priority, setPriority] = useState<"low" | "normal" | "high">("normal");
  const [submitting, setSubmitting] = useState(false);

  const selectedType = visibleTaskTypes.find((t) => t.id === validTaskType) ?? visibleTaskTypes[0];

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
      {/* LEFT: agent list */}
      <aside className="rounded-2xl border border-border bg-surface p-4">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-faint">
          Team ({roster.length})
        </p>
        <ul className="space-y-2">
          {roster.map((a) => {
            const active = a.id === agentId;
            const busy = a.load.pending + a.load.claimed + a.load.running;
            return (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => {
                    setAgentId(a.id);
                    // Reset task type to first valid one for the new agent.
                    const firstValid = taskTypes.find((t) => a.taskTypes.includes(t.id));
                    if (firstValid) setTaskType(firstValid.id);
                  }}
                  className={`group relative w-full rounded-xl border p-3 text-left transition ${
                    active
                      ? "border-accent bg-accent-tint/30"
                      : "border-border bg-surface-2 hover:border-accent/40 hover:bg-surface-2"
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.10em] text-text-faint">
                      {a.title}
                    </p>
                    {busy > 0 ? (
                      <span className="rounded-full border border-warning/30 bg-warning-tint px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-warning">
                        {busy} busy
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-sm font-medium text-text">{a.name}</p>
                  <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-text-muted">
                    {a.focus}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {a.taskTypes.slice(0, 4).map((tid) => {
                      const t = taskTypes.find((x) => x.id === tid);
                      if (!t) return null;
                      return (
                        <span
                          key={tid}
                          className="rounded bg-surface-3 px-1.5 py-0.5 text-[9px] font-medium text-text-muted"
                        >
                          {t.label}
                        </span>
                      );
                    })}
                    {a.taskTypes.length > 4 ? (
                      <span className="rounded bg-surface-3 px-1.5 py-0.5 text-[9px] font-medium text-text-faint">
                        +{a.taskTypes.length - 4}
                      </span>
                    ) : null}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* RIGHT: dispatch form */}
      <form
        action={(fd) => {
          setSubmitting(true);
          return assignAction(fd);
        }}
        className="space-y-4"
      >
        <input type="hidden" name="agentId" value={agentId} />
        <input type="hidden" name="taskType" value={validTaskType} />
        <input type="hidden" name="triggerSource" value="scout" />

        {/* Task type grid — filtered */}
        <section className="rounded-2xl border border-border bg-surface p-5">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-faint">
                Step 1
              </p>
              <h2 className="mt-0.5 text-sm font-medium text-text">
                Task type for {selectedAgent?.title ?? "this agent"}
              </h2>
            </div>
            <p className="hidden text-[11px] text-text-muted sm:block">
              Only shows the tasks this agent accepts.
            </p>
          </div>
          {visibleTaskTypes.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border bg-surface-2 p-3 text-xs text-text-muted">
              No task types configured for this agent.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {visibleTaskTypes.map((t) => {
                const active = t.id === validTaskType;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTaskType(t.id)}
                    className={`rounded-xl border p-3 text-left transition ${
                      active
                        ? "border-accent bg-accent/5"
                        : "border-border bg-surface-2 hover:border-accent/40"
                    }`}
                  >
                    <p className="text-sm font-medium text-text">{t.label}</p>
                    <p className="mt-0.5 text-[11px] leading-snug text-text-muted">
                      {t.description}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Site + priority + instructions */}
        <section className="rounded-2xl border border-border bg-surface p-5">
          <div className="mb-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-faint">
              Step 2
            </p>
            <h2 className="mt-0.5 text-sm font-medium text-text">Instructions + scope</h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="block text-xs font-medium uppercase tracking-[0.06em] text-text-faint">
                Target site (optional)
              </span>
              <select
                name="siteSlug"
                value={siteSlug}
                onChange={(e) => setSiteSlug(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-xs outline-none focus:border-accent"
              >
                <option value="">— network-wide —</option>
                {sites.map((s) => (
                  <option key={s.slug} value={s.slug}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="block text-xs font-medium uppercase tracking-[0.06em] text-text-faint">
                Priority
              </span>
              <select
                name="priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value as "low" | "normal" | "high")}
                className="mt-1 w-full rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-xs outline-none focus:border-accent"
              >
                <option value="high">High</option>
                <option value="normal">Normal</option>
                <option value="low">Low</option>
              </select>
            </label>
          </div>

          <label className="mt-4 block">
            <span className="block text-xs font-medium uppercase tracking-[0.06em] text-text-faint">
              Specific instructions
            </span>
            <textarea
              name="instructions"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={5}
              placeholder="Describe the concrete deliverable. Left blank the agent will infer from task type + its standing skill instructions."
              className="mt-1 w-full resize-y rounded-md border border-border bg-surface-2 p-3 font-mono text-[12px] leading-relaxed text-text focus:border-accent focus:outline-none"
            />
            <span className="mt-1 block text-[11px] text-text-faint">
              Appended to {selectedAgent?.name?.split(" ")[0] ?? "the agent"}&apos;s standing skill
              instructions before the job runs.
            </span>
          </label>
        </section>

        {/* Summary + submit */}
        <section className="flex flex-col gap-3 rounded-2xl border border-accent/40 bg-accent/5 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-text">
            Dispatching{" "}
            <strong>{selectedType?.label ?? "task"}</strong> to{" "}
            <strong>{selectedAgent?.name ?? "unknown"}</strong>
            {siteSlug
              ? (
                <>
                  {" "}for{" "}
                  <strong>{sites.find((s) => s.slug === siteSlug)?.name ?? siteSlug}</strong>
                </>
              )
              : " (network-wide)"}
            . Marked <span className="font-mono">trigger_source=scout</span>.
          </p>
          <button
            type="submit"
            disabled={submitting || !selectedAgent || !selectedType}
            className="rounded-md bg-accent px-4 py-1.5 text-xs font-medium text-brand-navy-deep hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Dispatching…" : "Dispatch →"}
          </button>
        </section>
      </form>
    </div>
  );
}
