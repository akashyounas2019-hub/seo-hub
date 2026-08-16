/**
 * /admin/automation — live view over agent_schedules, rendered on the dark
 * cyan-grid canvas we already use on /admin/agent/jobs.
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { agentProfiles, agentSchedules, claudeJobs, sites } from "@/db/schema";
import { requireAdmin } from "@/lib/server-auth";
import { TASK_TYPES, loadRoster } from "@/lib/agent-roster";
import {
  createAutomationAction,
  deleteAgentScheduleAction,
  toggleAgentScheduleAction,
  updateAutomationAction,
} from "@/app/actions/agent-profiles";
import { formatRelative } from "@/lib/utils";
import { AutomationHub, type FlowRow } from "./AutomationHub";

export const dynamic = "force-dynamic";

const CADENCE_LABEL: Record<string, string> = {
  once: "One-off",
  hourly: "Hourly",
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

export default async function AutomationPage({
  searchParams = {},
}: {
  searchParams?: { ok?: string; error?: string };
}) {
  await ensureSchema();
  await requireAdmin();
  const d = db();

  const rows = await d
    .select({
      s: agentSchedules,
      agentTitle: agentProfiles.title,
      agentName: agentProfiles.name,
      siteName: sites.name,
      siteSlug: sites.slug,
    })
    .from(agentSchedules)
    .leftJoin(agentProfiles, eq(agentProfiles.id, agentSchedules.agentId))
    .leftJoin(sites, eq(sites.id, agentSchedules.siteId))
    .orderBy(desc(agentSchedules.updatedAt));

  const jobStats = await d
    .select({
      scheduleId: sql<string>`(${claudeJobs.input}->>'scheduleId')`,
      done: sql<number>`count(*) filter (where status='done')::int`,
      failed: sql<number>`count(*) filter (where status='failed')::int`,
    })
    .from(claudeJobs)
    .where(and(eq(claudeJobs.kind, "agent_task"), sql`${claudeJobs.input} ? 'scheduleId'`))
    .groupBy(sql`(${claudeJobs.input}->>'scheduleId')`);
  const statsById = new Map(jobStats.map((r) => [r.scheduleId, r]));

  const flows: FlowRow[] = rows.map(({ s, agentTitle, agentName, siteName, siteSlug }) => {
    const stats = statsById.get(s.id);
    const total = (stats?.done ?? 0) + (stats?.failed ?? 0);
    const successRate = total > 0 ? Math.round(((stats?.done ?? 0) / total) * 100) : 0;
    const taskLabel = TASK_TYPES.find((t) => t.id === s.taskType)?.label ?? s.taskType;
    return {
      id: s.id,
      title: s.title,
      instructions: s.instructions,
      agentId: s.agentId,
      agentTitle: agentTitle ?? s.agentId,
      agentName: agentName ?? s.agentId,
      taskType: s.taskType,
      taskLabel,
      siteName: siteName ?? null,
      siteSlug: siteSlug ?? null,
      recurrence: s.recurrence,
      cadenceLabel: CADENCE_LABEL[s.recurrence] ?? s.recurrence,
      enabled: s.enabled,
      lastRunLabel: s.lastFireAt ? formatRelative(s.lastFireAt) : "—",
      nextFireIso: s.nextFireAt.toISOString(),
      fireCount: s.fireCount,
      successRate,
      totalRuns: total,
      category: classifyFlow(s.agentId, s.taskType),
    };
  });

  const roster = await loadRoster();
  const active = roster.filter((r) => r.isActive !== false);

  const siteList = await d
    .select({ slug: sites.slug, name: sites.name })
    .from(sites)
    .orderBy(sites.name);

  return (
    <AutomationHub
      flows={flows}
      roster={active.map((r) => ({
        id: r.id,
        title: r.title,
        name: r.name,
        taskTypes: r.taskTypes ?? ["custom"],
      }))}
      taskTypes={TASK_TYPES.map((t) => ({
        id: t.id,
        label: t.label,
        description: t.description,
      }))}
      sites={siteList.map((s) => ({ slug: s.slug, name: s.name }))}
      flash={
        searchParams.ok
          ? { tone: "ok", msg: flashMessage(searchParams.ok) }
          : searchParams.error
            ? { tone: "error", msg: flashMessage(searchParams.error) }
            : null
      }
      createAction={createAutomationAction}
      updateAction={updateAutomationAction}
      toggleAction={toggleAgentScheduleAction}
      deleteAction={deleteAgentScheduleAction}
    />
  );
}

/** Bucket a live schedule into a category based on its agent + task. */
function classifyFlow(agentId: string, taskType: string): string {
  if (agentId === "onpage") {
    if (taskType === "schema_markup") return "onpage";
    return "local";
  }
  if (agentId === "blog") return "onpage";
  if (agentId === "offpage") return "offpage";
  if (agentId === "technical") return "technical";
  if (agentId === "research") return "research";
  if (agentId === "ranktracker") return "reporting";
  if (agentId === "leader") return "reporting";
  return "reporting";
}

function flashMessage(code: string): string {
  switch (code) {
    case "created":  return "Automation created. First fire is queued.";
    case "updated":  return "Automation updated.";
    case "paused":   return "Automation paused. The runner will skip it until you resume.";
    case "resumed":  return "Automation resumed.";
    case "schedule-deleted": return "Automation deleted.";
    case "missing-fields":   return "Fill in name and agent before saving.";
    case "bad-time":         return "That fire-at time didn't parse.";
    default:                 return code;
  }
}
