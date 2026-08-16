"use client";

import { useMemo, useState } from "react";
import type { AgentRosterItem, TaskType } from "@/lib/agent-roster";

type Props = {
  action: (formData: FormData) => Promise<void>;
  sites: Array<{ slug: string; name: string }>;
  roster: AgentRosterItem[];
  taskTypes: TaskType[];
  defaults: { siteSlug: string; taskType: string; agentId: string };
};

export function AssignAgentTaskForm({ action, sites, roster, taskTypes, defaults }: Props) {
  // Agent is now the primary axis — its taskTypes allow-list drives which
  // task-type chips are visible below. Default to the operator's deep-linked
  // agent (e.g. from /admin/agent/roster/[id]?assign) or the first non-leader
  // agent in the roster.
  const initialAgentId =
    defaults.agentId || roster.find((a) => a.id !== "leader")?.id || roster[0]?.id || "";
  const [agentId, setAgentId] = useState<string>(initialAgentId);

  const selectedAgent = roster.find((a) => a.id === agentId) ?? roster[0];

  // Visible task types = only those in the selected agent's allow-list. Falls
  // back to ['custom'] if the agent has no allow-list defined.
  const visibleTaskTypes = useMemo(() => {
    const allow = selectedAgent?.taskTypes ?? ["custom"];
    return taskTypes.filter((t) => allow.includes(t.id));
  }, [selectedAgent, taskTypes]);

  // Task type auto-selects to the first visible one whenever the agent changes
  // and the current selection is no longer valid.
  const [taskType, setTaskType] = useState<string>(
    defaults.taskType && (selectedAgent?.taskTypes ?? []).includes(defaults.taskType as TaskType["id"])
      ? defaults.taskType
      : visibleTaskTypes[0]?.id ?? "custom",
  );
  const validTaskType = visibleTaskTypes.some((t) => t.id === taskType)
    ? taskType
    : visibleTaskTypes[0]?.id ?? "custom";

  const [siteSlug, setSiteSlug] = useState<string>(defaults.siteSlug || "");
  const [instructions, setInstructions] = useState<string>("");
  const [priority, setPriority] = useState<"low" | "normal" | "high">("normal");
  const [submitting, setSubmitting] = useState(false);

  const selectedType =
    visibleTaskTypes.find((t) => t.id === validTaskType) ?? visibleTaskTypes[0] ?? taskTypes[0];

  return (
    <form
      action={(fd) => {
        setSubmitting(true);
        return action(fd);
      }}
      className="space-y-6"
    >
      {/* Agent picker — first, so we know which task types to show. */}
      <section className="rounded-2xl border border-border bg-surface p-5">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-faint">
              Step 1
            </p>
            <h2 className="mt-0.5 text-sm font-medium text-text">Pick the assignee</h2>
          </div>
          <p className="hidden text-[11px] text-text-muted sm:block">
            Each agent has its own list of accepted task types.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {roster.filter((a) => a.isActive !== false).map((a) => {
            const active = a.id === agentId;
            const nTypes = (a.taskTypes ?? []).length;
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => setAgentId(a.id)}
                className={`rounded-xl border p-3 text-left transition ${
                  active
                    ? "border-accent bg-accent/5"
                    : "border-border bg-surface-2 hover:border-accent/40"
                }`}
              >
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-faint">
                  {a.title}
                </p>
                <p className="mt-1 text-sm font-medium text-text">{a.name}</p>
                <p className="mt-0.5 text-[11px] leading-snug text-text-muted">{a.focus}</p>
                <p className="mt-1.5 text-[10px] text-text-faint">
                  {nTypes} task type{nTypes === 1 ? "" : "s"} available
                </p>
              </button>
            );
          })}
        </div>
        <input type="hidden" name="agentId" value={agentId} />
      </section>

      {/* Task type — filtered to the selected agent's allow-list. */}
      <section className="rounded-2xl border border-border bg-surface p-5">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-faint">
              Step 2
            </p>
            <h2 className="mt-0.5 text-sm font-medium text-text">
              Choose a task type for {selectedAgent?.title ?? "this agent"}
            </h2>
          </div>
          <p className="hidden text-[11px] text-text-muted sm:block">
            Filtered to the tasks this agent accepts.
          </p>
        </div>
        {visibleTaskTypes.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-surface-2 p-3 text-xs text-text-muted">
            No task types configured for this agent.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
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
                  <p className="mt-0.5 text-[11px] leading-snug text-text-muted">{t.description}</p>
                </button>
              );
            })}
          </div>
        )}
        <input type="hidden" name="taskType" value={validTaskType} />
      </section>

      {/* Site + priority + instructions */}
      <section className="rounded-2xl border border-border bg-surface p-5">
        <div className="mb-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-faint">
            Step 3
          </p>
          <h2 className="mt-0.5 text-sm font-medium text-text">
            Add instructions (and target site)
          </h2>
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
            placeholder={placeholderFor(validTaskType)}
            className="mt-1 w-full resize-y rounded-md border border-border bg-surface-2 p-3 font-mono text-[12px] leading-relaxed text-text focus:border-accent focus:outline-none"
          />
          <span className="mt-1 block text-[11px] text-text-faint">
            Appended to {selectedAgent?.name?.split(" ")[0] ?? "this agent"}&apos;s standing skill instructions on the
            Agent Jobs profile.
          </span>
        </label>
      </section>

      {/* Summary + submit */}
      <section className="flex flex-col gap-3 rounded-2xl border border-accent/40 bg-accent/5 p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-text">
          Assigning{" "}
          <strong>{selectedType?.label ?? "task"}</strong> to{" "}
          <strong>{selectedAgent?.name ?? "unknown"}</strong>
          {siteSlug
            ? (
              <>
                {" "}
                for{" "}
                <strong>{sites.find((s) => s.slug === siteSlug)?.name ?? siteSlug}</strong>
              </>
            )
            : " (network-wide)"}
          .
        </p>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-accent px-4 py-1.5 text-xs font-medium text-brand-navy-deep hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Assigning…" : "Assign task →"}
        </button>
      </section>
    </form>
  );
}

function placeholderFor(taskType: string): string {
  switch (taskType) {
    case "blog_writing":
      return "Topic, target keyword, word count, internal links to include, key sources to cite.";
    case "on_page_optimisation":
      return "URLs to optimise, target keywords, current title/meta, any brand voice constraints.";
    case "backlink_building":
      return "Anchor mix targets, DR floor, verticals to prospect, any avoid-list.";
    case "technical_audit":
      return "Focus area (CWV / crawl / redirects), site or page URLs, known symptoms.";
    case "schema_markup":
      return "Page type (LocalBusiness / FAQ / Article / Service), URLs, entity data to include.";
    case "sitemap_refresh":
      return "Site(s) to refresh, canonical rules, hreflang pairs to verify.";
    case "content_brief":
      return "Working title, primary keyword, target SERP position, internal links to hit.";
    case "keyword_research":
      return "Seed topic, geo focus, intent split (informational / commercial), competitors to mine.";
    case "custom":
    default:
      return "Describe the task, acceptance criteria, and any links.";
  }
}
