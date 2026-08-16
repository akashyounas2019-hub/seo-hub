import Link from "next/link";
import { aliasedTable, and, desc, eq, ilike, inArray, notInArray, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { agentProfiles, claudeJobs, sites, taskAudits, tasks, users } from "@/db/schema";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pill, StatusDot } from "@/components/ui/Row";
import { getVisibility } from "@/lib/permissions";
import { requireUser } from "@/lib/server-auth";
import { cn, formatRelative } from "@/lib/utils";
import { TaskTabs } from "./TaskTabs";
import { TodoPanel } from "./TodoPanel";
import {
  CommandCenterHero,
  type CommandTaskRow,
  type RoutingSuggestion,
  type WorkloadEntry,
} from "./CommandCenterHero";

export const dynamic = "force-dynamic";

const COLUMNS = ["todo", "in_progress", "in_review", "blocked", "done"] as const;

const COLUMN_META: Record<
  (typeof COLUMNS)[number],
  { label: string; dot: "neutral" | "warning" | "info" | "danger" | "success" }
> = {
  todo: { label: "To do", dot: "neutral" },
  in_progress: { label: "In progress", dot: "warning" },
  in_review: { label: "In review", dot: "info" },
  blocked: { label: "Blocked", dot: "danger" },
  done: { label: "Done", dot: "success" },
};

export default async function TasksPage({
  searchParams,
}: {
  searchParams: {
    mine?: string;
    ok?: string;
    error?: string;
    priority?: string;
    site?: string;
    assignee?: string;
    q?: string;
    view?: string;
  };
}) {
  await ensureSchema();
  const user = await requireUser();
  const visibility = await getVisibility(user);

  if (visibility.kind === "scoped" && visibility.siteIds.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-medium tracking-tightish text-text">Tasks</h1>
        <EmptyState
          glyph="users"
          title="You don't have any sites assigned"
          description="Ask the admin to add you to a site, then your tasks will show up here."
        />
      </div>
    );
  }

  const onlyMine = searchParams.mine === "1";
  const PRIORITIES = ["low", "normal", "high", "urgent"] as const;
  const priority = PRIORITIES.includes(searchParams.priority as (typeof PRIORITIES)[number])
    ? (searchParams.priority as (typeof PRIORITIES)[number])
    : undefined;
  const siteSlug = searchParams.site;
  const assigneeQuery = searchParams.assignee?.trim() || undefined;
  const q = searchParams.q?.trim() || undefined;
  const assignee = aliasedTable(users, "assignee");
  const baseFilters: SQL[] = [];
  if (visibility.kind === "scoped") baseFilters.push(inArray(tasks.siteId, visibility.siteIds));
  if (onlyMine) baseFilters.push(eq(tasks.assigneeId, user.id));
  if (priority) baseFilters.push(eq(tasks.priority, priority));
  if (siteSlug) {
    const [s] = await db().select({ id: sites.id }).from(sites).where(eq(sites.slug, siteSlug)).limit(1);
    if (s && (visibility.kind === "all" || visibility.siteIds.includes(s.id))) {
      baseFilters.push(eq(tasks.siteId, s.id));
    }
  }
  if (assigneeQuery) {
    // Match assignee email (case-insensitive substring); pulls user ids first.
    const matches = await db()
      .select({ id: users.id })
      .from(users)
      .where(ilike(users.email, `%${assigneeQuery}%`));
    if (matches.length === 0) {
      baseFilters.push(eq(tasks.assigneeId, "00000000-0000-0000-0000-000000000000"));
    } else {
      baseFilters.push(inArray(tasks.assigneeId, matches.map((m) => m.id)));
    }
  }
  if (q) {
    const like = `%${q}%`;
    const orClause = or(ilike(tasks.title, like), ilike(tasks.description, like));
    if (orClause) baseFilters.push(orClause);
  }

  const rows = await db()
    .select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      priority: tasks.priority,
      dueAt: tasks.dueAt,
      createdAt: tasks.createdAt,
      siteSlug: sites.slug,
      siteCity: sites.city,
      assigneeId: tasks.assigneeId,
      assigneeEmail: assignee.email,
      assigneeName: assignee.name,
    })
    .from(tasks)
    .innerJoin(sites, eq(sites.id, tasks.siteId))
    .leftJoin(assignee, eq(assignee.id, tasks.assigneeId))
    .where(baseFilters.length ? and(...baseFilters) : undefined)
    .orderBy(desc(tasks.createdAt))
    .limit(500);

  // --- Stat strip: total / overdue / due-today / unassigned / blocked / completed-7d ---
  // Computed from the rows already in memory rather than re-querying, so filters
  // applied above shape these numbers (operator sees the slice they're looking at).
  const now = Date.now();
  const endOfToday = (() => {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d.getTime();
  })();
  const sevenDaysAgo = now - 7 * 24 * 3600_000;
  const openRows = rows.filter((r) => r.status !== "done" && r.status !== "cancelled");
  const stats = {
    total: rows.length,
    open: openRows.length,
    overdue: openRows.filter((r) => r.dueAt && r.dueAt.getTime() < now).length,
    dueToday: openRows.filter((r) => r.dueAt && r.dueAt.getTime() < endOfToday && r.dueAt.getTime() >= now).length,
    unassigned: openRows.filter((r) => !r.assigneeId).length,
    blocked: openRows.filter((r) => r.status === "blocked").length,
    completed7d: rows.filter((r) => r.status === "done" && r.createdAt.getTime() > sevenDaysAgo).length,
  };

  // --- Assignee facet chips: top assignees by open-task count in current filter ---
  const assigneeMap = new Map<string, { id: string; label: string; count: number }>();
  for (const r of openRows) {
    if (!r.assigneeId) continue;
    const key = r.assigneeId;
    const existing = assigneeMap.get(key);
    if (existing) existing.count += 1;
    else assigneeMap.set(key, { id: key, label: r.assigneeName || r.assigneeEmail?.split("@")[0] || "Unknown", count: 1 });
  }
  const assigneeFacets = Array.from(assigneeMap.values()).sort((a, b) => b.count - a.count).slice(0, 8);

  // --- Latest AI verdict per task ---
  // Used to overlay a small badge on each card when an audit has run recently.
  // Pulls the most recent audit row per task via a window-function subquery.
  const taskIds = rows.map((r) => r.id);
  const verdictMap = new Map<string, { verdict: string; runAt: Date }>();
  if (taskIds.length > 0) {
    const auditRows = await db()
      .select({
        taskId: taskAudits.taskId,
        verdict: taskAudits.verdict,
        runAt: taskAudits.runAt,
        rank: sql<number>`(row_number() over (partition by ${taskAudits.taskId} order by ${taskAudits.runAt} desc))::int`,
      })
      .from(taskAudits)
      .where(inArray(taskAudits.taskId, taskIds));
    for (const a of auditRows) {
      if (Number(a.rank) !== 1) continue;
      verdictMap.set(a.taskId, { verdict: a.verdict, runAt: a.runAt });
    }
  }

  const byStatus: Record<string, typeof rows> = {};
  for (const col of COLUMNS) byStatus[col] = [];
  for (const r of rows) (byStatus[r.status] ??= []).push(r);

  const showTodo = searchParams.view === "todo";

  // ─── Command Center hero data ──────────────────────────────────────
  // 4 KPIs (Open / In Flight / Critical / Completed) derived from the
  // same `rows` slice so the numbers respect the operator's filters.
  const heroCounts = {
    open: openRows.length,
    inFlight: openRows.filter((r) => r.status === "in_progress").length,
    critical: openRows.filter((r) => r.priority === "urgent" || r.priority === "high").length,
    completed7d: stats.completed7d,
  };

  // Top ~8 rows for the hero task list — prefer open tasks (ordered by
  // priority, then due date, then createdAt).
  const priorityRank: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
  const heroTaskRows = [...openRows]
    .sort((a, b) => {
      const pa = priorityRank[a.priority] ?? 4;
      const pb = priorityRank[b.priority] ?? 4;
      if (pa !== pb) return pa - pb;
      const da = a.dueAt?.getTime() ?? Number.POSITIVE_INFINITY;
      const db = b.dueAt?.getTime() ?? Number.POSITIVE_INFINITY;
      if (da !== db) return da - db;
      return b.createdAt.getTime() - a.createdAt.getTime();
    })
    .slice(0, 8);

  const heroTasks: CommandTaskRow[] = heroTaskRows.map((r) => ({
    id: r.id,
    ticker: shortTicker(r.id),
    title: r.title,
    siteSlug: r.siteSlug ?? null,
    category: inferCategory(r.title),
    priority: r.priority,
    status: r.status,
    dueLabel: r.dueAt
      ? r.dueAt.toLocaleDateString(undefined, { month: "short", day: "numeric" })
      : "—",
    assignee: r.assigneeId
      ? {
          initials: initialsFor(r.assigneeName, r.assigneeEmail),
          label: r.assigneeName ?? r.assigneeEmail?.split("@")[0] ?? "Unknown",
          kind: "human",
        }
      : null,
  }));

  // Workload — humans first (real open-task counts), then agents (queued+running
  // claude_jobs rows), each converted to a rough 0..100% utilization.
  const HUMAN_CAPACITY_PER_WEEK = 7;   // arbitrary but plausible weekly cap
  const AGENT_CAPACITY = 5;             // agent queue depth we treat as "full"

  // Per-agent accent — mirrors EXPERT_VIZ in AgentHierarchyHero.tsx so the
  // Workload glyph tile shows the same gradient as the Agent Jobs card.
  const AGENT_ACCENT: Record<string, string> = {
    leader:      "from-cyan-400 to-sky-500",
    research:    "from-emerald-400 to-teal-500",
    techseo:     "from-rose-400 to-pink-500",
    blog:        "from-violet-400 to-fuchsia-500",
    onpage:      "from-cyan-400 to-sky-500",
    technical:   "from-amber-400 to-orange-500",
    ranktracker: "from-lime-400 to-green-500",
    offpage:     "from-slate-400 to-slate-500",
  };

  const humanWorkload: WorkloadEntry[] = Array.from(assigneeMap.values())
    .sort((a, b) => b.count - a.count)
    .map((a) => ({
      id: `user:${a.id}`,
      initials: initialsFromLabel(a.label),
      name: a.label,
      role: labelUserRole(rows.find((r) => r.assigneeId === a.id)?.assigneeEmail ?? null),
      kind: "human" as const,
      pct: Math.min(100, Math.round((a.count / HUMAN_CAPACITY_PER_WEEK) * 100)),
      accent: "from-cyan-400 to-sky-500",
    }));

  // Agent workload — one row per active agent with queued/running jobs.
  const agentRows = await db()
    .select({
      id: agentProfiles.id,
      name: agentProfiles.name,
      title: agentProfiles.title,
      isActive: agentProfiles.isActive,
    })
    .from(agentProfiles);

  const agentJobLoads = await db()
    .select({
      agentId: sql<string>`(${claudeJobs.input}->>'agentId')`,
      queued: sql<number>`count(*) filter (where status='pending')::int`,
      running: sql<number>`count(*) filter (where status in ('claimed','running'))::int`,
    })
    .from(claudeJobs)
    .where(and(eq(claudeJobs.kind, "agent_task"), sql`${claudeJobs.input} ? 'agentId'`))
    .groupBy(sql`(${claudeJobs.input}->>'agentId')`);

  const loadByAgent = new Map<string, number>();
  for (const g of agentJobLoads) {
    if (!g.agentId) continue;
    loadByAgent.set(g.agentId, (g.queued ?? 0) + (g.running ?? 0));
  }

  const agentWorkload: WorkloadEntry[] = agentRows
    .filter((a) => a.isActive && a.id !== "leader")
    .map((a) => ({
      id: `agent:${a.id}`,
      initials: initialsFromLabel(a.title),
      name: a.title,           // role, not person name — per earlier UI cleanup
      role: a.title,
      kind: "agent" as const,
      pct: Math.min(100, Math.round(((loadByAgent.get(a.id) ?? 0) / AGENT_CAPACITY) * 100)),
      accent: AGENT_ACCENT[a.id] ?? "from-violet-400 to-fuchsia-500",
    }));

  const heroWorkload = [...humanWorkload, ...agentWorkload].slice(0, 8);

  // Suggested routing — pick the most overloaded assignee (>= 5 open OR >= 2
  // urgent) and their heaviest open task. Nominate the emptiest teammate as
  // the receiver.
  const heroSuggestion: RoutingSuggestion | null = (() => {
    const humansWithLoad = Array.from(assigneeMap.values())
      .map((a) => ({
        ...a,
        urgents: openRows.filter((r) => r.assigneeId === a.id && r.priority === "urgent").length,
      }))
      .filter((a) => a.count >= 5 || a.urgents >= 2)
      .sort((a, b) => b.count + b.urgents * 2 - (a.count + a.urgents * 2));

    if (humansWithLoad.length === 0) return null;
    const overloaded = humansWithLoad[0];

    const heaviestTask = openRows
      .filter((r) => r.assigneeId === overloaded.id)
      .sort((a, b) => (priorityRank[a.priority] ?? 4) - (priorityRank[b.priority] ?? 4))[0];
    if (!heaviestTask) return null;

    // Receiver: lightest human (if any) or lightest agent as fallback.
    const receiver =
      humanWorkload.filter((h) => h.id !== `user:${overloaded.id}`).sort((a, b) => a.pct - b.pct)[0] ??
      agentWorkload.sort((a, b) => a.pct - b.pct)[0];
    if (!receiver) return null;

    return {
      overloadedName: overloaded.label,
      overloadedPct: Math.min(100, Math.round((overloaded.count / HUMAN_CAPACITY_PER_WEEK) * 100)),
      taskTicker: shortTicker(heaviestTask.id),
      taskId: heaviestTask.id,
      reassignTo: receiver.name,
    };
  })();

  return (
    <div className="space-y-6">
      {!showTodo ? (
        <CommandCenterHero
          counts={heroCounts}
          tasks={heroTasks}
          workload={heroWorkload}
          suggestion={heroSuggestion}
          canCreate={user.role !== "student"}
        />
      ) : null}

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium tracking-tightish text-text">
            {showTodo ? "To-Do List" : "Kanban board"}
          </h1>
          <p className="mt-1.5 text-xs sm:text-sm text-text-muted">
            {showTodo
              ? "Quick personal reminders and one-off items."
              : visibility.kind === "all"
                ? "Every task across the network — same data, drag-friendly view."
                : `Across your ${visibility.siteIds.length} assigned site${visibility.siteIds.length === 1 ? "" : "s"} — drag-friendly view.`}
            {!showTodo && onlyMine ? " · Filtered to tasks assigned to you." : ""}
          </p>
        </div>
        {!showTodo ? (
          <div className="flex items-center gap-2">
            <Link
              href={onlyMine ? "/admin/tasks" : "/admin/tasks?mine=1"}
              className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-text-muted transition-colors hover:border-border-strong hover:bg-surface-2 hover:text-text"
            >
              {onlyMine ? "Show all" : "Only mine"}
            </Link>
            {user.role !== "student" ? (
              <Link
                href="/admin/tasks/new"
                className="rounded-md bg-accent px-2.5 py-1.5 text-xs font-medium text-brand-navy-deep shadow-xs hover:bg-accent-hover"
              >
                + New task
              </Link>
            ) : null}
          </div>
        ) : null}
      </header>

      <TaskTabs />

      {searchParams.ok ? (
        <div className="rounded-md border border-success/30 bg-success-tint px-3 py-2 text-xs text-success">
          {searchParams.ok === "deleted" ? "Task deleted." : "Saved."}
        </div>
      ) : null}

      {showTodo ? (
        <TodoPanel />
      ) : (
      <>
      {/* --- KPI strip — shapes the operator's triage in one glance --- */}
      <section className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        <KpiTile label="Open" value={stats.open} tone="accent" />
        <KpiTile label="Overdue" value={stats.overdue} tone={stats.overdue > 0 ? "danger" : "neutral"} />
        <KpiTile label="Due today" value={stats.dueToday} tone={stats.dueToday > 0 ? "warning" : "neutral"} />
        <KpiTile label="Unassigned" value={stats.unassigned} tone={stats.unassigned > 0 ? "warning" : "neutral"} />
        <KpiTile label="Blocked" value={stats.blocked} tone={stats.blocked > 0 ? "danger" : "neutral"} />
        <KpiTile label="Done · 7d" value={stats.completed7d} tone="success" />
      </section>

      {/* --- Assignee facet chips — one-click filter by assignee --- */}
      {assigneeFacets.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-text-faint">
            Assignees
          </span>
          {assigneeFacets.map((a) => {
            const isActive =
              assigneeQuery &&
              (a.label.toLowerCase().includes(assigneeQuery.toLowerCase()) ||
                assigneeQuery.toLowerCase().includes(a.label.toLowerCase()));
            // The existing filter uses an email substring search, so deep-link with
            // the label as a hint (close enough — admin can refine if needed).
            const href = isActive
              ? buildHref(searchParams, { assignee: undefined })
              : buildHref(searchParams, { assignee: a.label });
            return (
              <Link
                key={a.id}
                href={href}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
                  isActive
                    ? "bg-accent text-brand-navy-deep"
                    : "border border-border bg-surface text-text-muted hover:border-accent/40 hover:bg-accent-tint hover:text-accent",
                )}
              >
                {a.label}
                <span
                  className={cn(
                    "tabular-nums",
                    isActive ? "opacity-90" : "opacity-60",
                  )}
                >
                  {a.count}
                </span>
              </Link>
            );
          })}
          {searchParams.assignee || searchParams.mine ? (
            <Link
              href={buildHref(searchParams, { assignee: undefined, mine: undefined })}
              className="ml-1 text-xs text-text-faint hover:text-text-muted"
            >
              clear
            </Link>
          ) : null}
        </div>
      ) : null}

      {/* Filter bar */}
      <form
        method="GET"
        action="/admin/tasks"
        className="grid gap-3 rounded-lg border border-border bg-surface p-3 sm:grid-cols-5"
      >
        <input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="search title…"
          className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
        <select
          name="priority"
          defaultValue={priority ?? ""}
          className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
        >
          <option value="">Any priority</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <input
          name="site"
          defaultValue={siteSlug ?? ""}
          placeholder="site slug"
          className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
        <input
          name="assignee"
          defaultValue={assigneeQuery ?? ""}
          placeholder="assignee email"
          className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
        <div className="flex gap-2">
          <button
            type="submit"
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-brand-navy-deep hover:bg-accent-hover"
          >
            Apply
          </button>
          <Link
            href="/admin/tasks"
            className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs text-text-muted hover:bg-surface-2 hover:text-text"
          >
            Reset
          </Link>
        </div>
      </form>

      {/* Kanban board */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {COLUMNS.map((status) => {
          const meta = COLUMN_META[status];
          const items = byStatus[status] ?? [];
          return (
            <section
              key={status}
              className="flex flex-col rounded-md border border-border bg-surface"
            >
              <header className="flex items-center justify-between border-b border-border px-3 py-2">
                <div className="flex items-center gap-2">
                  <StatusDot tone={meta.dot} />
                  <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-text-faint">
                    {meta.label}
                  </h2>
                </div>
                <span className="tnum text-xs text-text-faint">{items.length}</span>
              </header>
              <ul className="flex-1 divide-y divide-border">
                {items.length === 0 ? (
                  <li className="px-3 py-4 text-center text-xs text-text-faint">empty</li>
                ) : (
                  items.map((t) => {
                    const verdict = verdictMap.get(t.id);
                    return (
                      <li key={t.id} className="p-2.5">
                        <Link
                          href={`/admin/tasks/${t.id}`}
                          className="block rounded-sm transition-colors hover:bg-surface-2 focus-visible:outline-none"
                        >
                          <div className="px-1.5 py-1">
                            <div className="flex items-start gap-2">
                              <div className="flex-1 text-sm font-medium leading-snug text-text">
                                {t.title}
                              </div>
                              {verdict ? <VerdictBadge verdict={verdict.verdict} /> : null}
                            </div>
                            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-faint">
                              <span className="font-mono">{t.siteSlug}</span>
                              <Pill tone={priorityTone(t.priority)}>{t.priority}</Pill>
                              {t.dueAt ? (
                                status === "done" ? (
                                  <span className="tnum text-text-faint">
                                    due {formatRelative(t.dueAt)}
                                  </span>
                                ) : (
                                  <span className={cn("tnum", dueClass(t.dueAt))}>
                                    {t.dueAt < new Date() ? "overdue " : "due "}
                                    {formatRelative(t.dueAt)}
                                  </span>
                                )
                              ) : null}
                              {t.assigneeEmail && t.assigneeId ? (
                                <span className="ml-auto text-text-muted">
                                  → {t.assigneeName ?? t.assigneeEmail.split("@")[0]}
                                </span>
                              ) : (
                                <span className="ml-auto text-text-faint">unassigned</span>
                              )}
                            </div>
                          </div>
                        </Link>
                      </li>
                    );
                  })
                )}
              </ul>
            </section>
          );
        })}
      </div>
      </>
      )}
    </div>
  );
}

function priorityTone(p: string): "danger" | "warning" | "neutral" {
  if (p === "urgent") return "danger";
  if (p === "high") return "warning";
  return "neutral";
}

function dueClass(due: Date): string {
  const ms = due.getTime() - Date.now();
  if (ms < 0) return "text-danger";
  if (ms < 1000 * 60 * 60 * 24) return "text-warning";
  return "text-text-faint";
}

/** Small stat tile for the kanban-header KPI strip. Tone drives the left bar
 *  + the number colour, so the eye lands on whichever bucket actually needs
 *  triage today (overdue/blocked/unassigned). */
function KpiTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "accent" | "warning" | "danger" | "success" | "neutral";
}) {
  const num =
    tone === "danger" && value > 0
      ? "text-danger"
      : tone === "warning" && value > 0
        ? "text-warning"
        : tone === "success" && value > 0
          ? "text-success"
          : "text-text";
  return (
    <div
      className="relative overflow-hidden rounded-xl border border-border px-4 py-3"
      style={{ background: "linear-gradient(180deg, var(--surface), var(--surface-2))" }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-3 top-0 h-px"
        style={{
          background: "linear-gradient(90deg, transparent, var(--border-strong), transparent)",
        }}
      />
      <div className="text-xs uppercase tracking-[0.10em] font-semibold text-text-faint">{label}</div>
      <div className={`mt-2 text-3xl font-semibold leading-none tabular-nums tracking-tight ${num}`}>{value}</div>
    </div>
  );
}

/** AI-audit verdict badge — sits in the top-right of a kanban card when the
 *  audit agent has scored this task. Visual tone tells the operator at a glance
 *  whether the auditor thinks the work actually got done. */
function VerdictBadge({ verdict }: { verdict: string }) {
  const config: Record<string, { label: string; cls: string }> = {
    done: { label: "AI: done", cls: "bg-success-tint text-success" },
    partial: { label: "AI: partial", cls: "bg-warning-tint text-warning" },
    not_started: { label: "AI: ⌀", cls: "bg-danger-tint text-danger" },
    no_show: { label: "AI: no-show", cls: "bg-danger-tint text-danger" },
    ambiguous: { label: "AI: ?", cls: "bg-surface-3 text-text-muted" },
  };
  const c = config[verdict] ?? { label: `AI: ${verdict}`, cls: "bg-surface-3 text-text-muted" };
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${c.cls}`}
      title={`Latest AI audit verdict: ${verdict}`}
    >
      {c.label}
    </span>
  );
}

/** Build a /admin/tasks?... URL preserving every existing query param and
 *  letting the caller override a few. Used by the assignee facet chips so the
 *  "click to filter" doesn't blow away the operator's search text / priority. */
function buildHref(
  current: Record<string, string | undefined>,
  patch: Record<string, string | undefined>,
): string {
  const params = new URLSearchParams();
  const merged = { ...current, ...patch };
  for (const [k, v] of Object.entries(merged)) {
    // Skip the in-band response flags so refreshes don't keep echoing them.
    if (k === "ok" || k === "error") continue;
    if (v !== undefined && v !== "") params.set(k, v);
  }
  const qs = params.toString();
  return qs ? `/admin/tasks?${qs}` : "/admin/tasks";
}

/* ─────────── Command Center helpers ─────────── */

/** Short ticker from a uuid — first 4 hex chars, uppercased and prefixed. */
function shortTicker(id: string): string {
  const hex = id.replace(/-/g, "").slice(0, 4).toUpperCase();
  return `T-${hex}`;
}

/** Two-letter initials from a display label. */
function initialsFromLabel(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Assignee initials from name or (fallback) email. */
function initialsFor(name: string | null, email: string | null): string {
  if (name && name.trim()) return initialsFromLabel(name);
  if (email) return email.slice(0, 2).toUpperCase();
  return "?";
}

/** Best-effort user role from an email domain — purely cosmetic. */
function labelUserRole(email: string | null): string {
  if (!email) return "team";
  const [local] = email.split("@");
  if (/lead|owner|founder/i.test(local)) return "SEO Lead";
  if (/write|content|editor|blog/i.test(local)) return "Content";
  if (/dev|eng|tech/i.test(local)) return "Engineering";
  return "team";
}

/** Guess a task category chip label from title text. */
function inferCategory(title: string): string {
  const t = title.toLowerCase();
  if (/meta|title|h1|schema|on.?page/.test(t)) return "ON-PAGE";
  if (/lcp|cwv|core web|inp|cls|perf|speed/.test(t)) return "CORE WEB VITALS";
  if (/backlink|outreach|off.?page|anchor|referring/.test(t)) return "OFF-PAGE";
  if (/audit|crawl|indexation|sitemap/.test(t)) return "AUDIT";
  if (/gmb|local|neighbou?rhood|city|dubai|abu dhabi|sharjah/.test(t)) return "LOCAL";
  if (/keyword|serp|research|competitor/.test(t)) return "RESEARCH";
  if (/blog|content|brief|draft|write|copy/.test(t)) return "CONTENT";
  return "TASK";
}
