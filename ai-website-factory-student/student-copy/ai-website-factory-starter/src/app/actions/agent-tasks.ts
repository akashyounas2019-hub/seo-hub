"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import {
  agentTasks,
  claudeJobs,
  gscQuerySnapshots,
  qaChecks,
  sitePatterns,
  sites,
  trafficSnapshots,
} from "@/db/schema";
import { recordAdminAction } from "@/lib/audit-log";
import { AGENT_ROSTER, TASK_TYPES, loadAgent, taskTypesForAgent, type AgentId, type TaskTypeId } from "@/lib/agent-roster";
import { requireAdmin } from "@/lib/server-auth";

function id(formData: FormData, k: string): string {
  const v = formData.get(k);
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Assign a website task to one of the SEO agent team members.
 *
 * Inserts a `claude_jobs` row of kind `agent_task`. The row appears in the
 * standard Agent Jobs list, so nothing new is needed on the tracking side.
 * The `input` JSON captures which agent, which task type, and any custom
 * instructions the operator typed in.
 */
export async function assignSeoAgentTaskAction(formData: FormData): Promise<void> {
  await ensureSchema();
  const me = await requireAdmin();

  const agentId = id(formData, "agentId") as AgentId;
  const taskType = id(formData, "taskType") as TaskTypeId;
  const siteSlug = id(formData, "siteSlug");
  const instructions = id(formData, "instructions");
  const priority = (id(formData, "priority") || "normal") as "low" | "normal" | "high";
  // Optional — defaults to 'manual' when the operator kicks it off through the
  // Scout hub / Agent Jobs assign wizard. Callable programmatically with
  // 'scheduled' for scheduled runs, 'scout' for the Scout hub direct dispatch.
  const triggerSource =
    (id(formData, "triggerSource") || "manual") as "manual" | "scheduled" | "scout";

  // Load persona from the DB so skill_instructions is fresh (built-in seed is
  // just the starting default; the operator may have customised it).
  const persona = await loadAgent(agentId);
  const type = TASK_TYPES.find((t) => t.id === taskType);
  if (!persona || !type) {
    redirect("/admin/agent/tasks/new?error=invalid");
  }

  // Enforce the per-agent task-type allow-list. If the operator submitted
  // something the agent doesn't accept, bounce back to the wizard.
  const allowed = taskTypesForAgent(agentId);
  if (!allowed.includes(taskType)) {
    redirect(`/admin/agent/tasks/new?error=task-not-supported&agent=${encodeURIComponent(agentId)}`);
  }

  let siteId: string | null = null;
  let siteName: string | null = null;
  if (siteSlug) {
    const [site] = await db()
      .select({ id: sites.id, name: sites.name })
      .from(sites)
      .where(eq(sites.slug, siteSlug))
      .limit(1);
    if (site) {
      siteId = site.id;
      siteName = site.name;
    }
  }

  const title = siteName
    ? `${type.label} — ${siteName} (${persona.name})`
    : `${type.label} — ${persona.name}`;

  // For strategic_plan tasks, pre-fetch a real snapshot of GSC / GA / patterns /
  // QA so the SEO Leader has actual numbers to reason over. The template
  // embeds this block verbatim under a "Data snapshot" section.
  let planContext = "";
  if (type.id === "strategic_plan") {
    planContext = await buildPlanContext(siteId);
  }

  const [created] = await db()
    .insert(claudeJobs)
    .values({
      kind: "agent_task",
      title,
      siteId,
      status: "pending",
      priority,
      preferWorker: "mac",
      triggerSource,
      input: {
        agentId: persona.id,
        agentName: persona.name,
        agentTitle: persona.title,
        // Ship the persona's current skill_instructions with the job so the
        // template can build a real prompt without re-reading the DB.
        skillInstructions: persona.skillInstructions ?? "",
        taskTypeId: type.id,
        taskTypeLabel: type.label,
        taskTypeDescription: type.description,
        instructions: instructions || null,
        triggerSource,
        ...(planContext ? { planContext } : {}),
      },
      createdBy: me.id,
    })
    .returning({ id: claudeJobs.id });

  await recordAdminAction({
    actor: me,
    kind: "agent_task.assign_to_seo_agent",
    targetType: "claude_job",
    targetId: created.id,
    summary: `Assigned ${type.label} to ${persona.name}${siteName ? ` for ${siteName}` : ""}`,
    after: {
      agentId: persona.id,
      taskType: type.id,
      siteSlug: siteSlug || null,
      priority,
      triggerSource,
    },
  });

  revalidatePath("/admin/agent/jobs");
  revalidatePath("/admin/scout");
  // Bounce back to the surface the operator dispatched from. Scout hub gets
  // an in-place success flash; everything else follows the old behaviour of
  // opening the job detail page.
  if (triggerSource === "scout") {
    redirect(`/admin/scout?agent=${encodeURIComponent(persona.id)}&ok=queued`);
  }
  redirect(`/admin/agent/jobs/${created.id}?queued=1`);
}

/** Accept an agent task → move it to in_progress. */
export async function acceptAgentTaskAction(formData: FormData): Promise<void> {
  await ensureSchema();
  const me = await requireAdmin();
  const taskId = id(formData, "taskId");
  if (!taskId) return;
  await db()
    .update(agentTasks)
    .set({ status: "in_progress" })
    .where(eq(agentTasks.id, taskId));
  await recordAdminAction({
    actor: me,
    kind: "agent_task.accept",
    targetType: "task",
    targetId: taskId,
    summary: `Accepted agent task ${taskId}`,
  });
  revalidatePath("/admin/patterns");
  revalidatePath("/admin/today");
  revalidatePath("/admin");
}

/** Mark an agent task as done. */
export async function completeAgentTaskAction(formData: FormData): Promise<void> {
  await ensureSchema();
  const me = await requireAdmin();
  const taskId = id(formData, "taskId");
  if (!taskId) return;
  await db()
    .update(agentTasks)
    .set({ status: "done", closedAt: new Date(), closedBy: me.id })
    .where(eq(agentTasks.id, taskId));
  await recordAdminAction({
    actor: me,
    kind: "agent_task.complete",
    targetType: "task",
    targetId: taskId,
    summary: `Completed agent task ${taskId}`,
  });
  revalidatePath("/admin/patterns");
  revalidatePath("/admin/today");
  revalidatePath("/admin");
}

/** Dismiss an agent task — won't reappear unless the pattern fires again with a NEW pattern id. */
export async function dismissAgentTaskAction(formData: FormData): Promise<void> {
  await ensureSchema();
  const me = await requireAdmin();
  const taskId = id(formData, "taskId");
  if (!taskId) return;
  await db()
    .update(agentTasks)
    .set({ status: "dismissed", closedAt: new Date(), closedBy: me.id })
    .where(eq(agentTasks.id, taskId));
  await recordAdminAction({
    actor: me,
    kind: "agent_task.dismiss",
    targetType: "task",
    targetId: taskId,
    summary: `Dismissed agent task ${taskId}`,
  });
  revalidatePath("/admin/patterns");
  revalidatePath("/admin/today");
  revalidatePath("/admin");
}

/** Dismiss a pattern → also dismisses any linked open agent tasks. */
export async function dismissPatternAction(formData: FormData): Promise<void> {
  await ensureSchema();
  const me = await requireAdmin();
  const patternId = id(formData, "patternId");
  if (!patternId) return;
  await db()
    .update(sitePatterns)
    .set({ status: "dismissed", dismissedAt: new Date(), dismissedBy: me.id })
    .where(eq(sitePatterns.id, patternId));
  // Cascade-close any open tasks for this pattern.
  await db()
    .update(agentTasks)
    .set({ status: "dismissed", closedAt: new Date(), closedBy: me.id })
    .where(eq(agentTasks.patternId, patternId));
  await recordAdminAction({
    actor: me,
    kind: "pattern.dismiss",
    targetType: "other",
    targetId: patternId,
    summary: `Dismissed pattern ${patternId}`,
  });
  revalidatePath("/admin/patterns");
  revalidatePath("/admin/today");
}

/**
 * Build a Markdown "Data snapshot" block for strategic_plan tasks.
 * Reads real GSC + GA + patterns + QA data so the SEO Leader plans from
 * numbers, not memory. If a source is empty or missing the block still
 * embeds a "no data available" line so the LLM knows to flag it as a gap.
 *
 * Scope: when siteId is provided, snapshots that site; when null, rolls up
 * network-wide top signals.
 */
async function buildPlanContext(siteId: string | null): Promise<string> {
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 3600_000);
  const twentyEightAgo = new Date(now.getTime() - 28 * 24 * 3600_000);
  const isoDay = (d: Date) => d.toISOString().slice(0, 10);
  const d = db();

  const sections: string[] = [];

  // GSC — top 5 queries + top 5 pages in the last 28-day window.
  const gscBase = d
    .select({
      query: gscQuerySnapshots.query,
      clicks: sql<number>`sum(${gscQuerySnapshots.clicks})::int`,
      impressions: sql<number>`sum(${gscQuerySnapshots.impressions})::int`,
      position: sql<number>`avg(${gscQuerySnapshots.position})::float`,
    })
    .from(gscQuerySnapshots)
    .groupBy(gscQuerySnapshots.query);
  const gscRows = await (siteId
    ? gscBase.where(and(
        eq(gscQuerySnapshots.siteId, siteId),
        gte(gscQuerySnapshots.snapshotDate, isoDay(twentyEightAgo)),
      ))
    : gscBase.where(gte(gscQuerySnapshots.snapshotDate, isoDay(twentyEightAgo))))
    .orderBy(desc(sql`sum(${gscQuerySnapshots.clicks})`))
    .limit(5);

  if (gscRows.length > 0) {
    const lines = ["## GSC · top queries (28d rollup)", "", "| Query | Clicks | Impressions | Avg. Position |", "|---|---:|---:|---:|"];
    for (const r of gscRows) {
      lines.push(`| ${r.query} | ${r.clicks} | ${r.impressions} | ${r.position.toFixed(1)} |`);
    }
    sections.push(lines.join("\n"));
  } else {
    sections.push("## GSC · top queries (28d rollup)\n\nNo GSC snapshots available for this scope.");
  }

  // GA4 traffic — last 7 vs prior 7.
  const gaBase = d
    .select({
      snapshotDate: trafficSnapshots.snapshotDate,
      metrics: trafficSnapshots.metrics,
    })
    .from(trafficSnapshots)
    .where(
      siteId
        ? and(
            eq(trafficSnapshots.siteId, siteId),
            eq(trafficSnapshots.source, "ga4"),
            gte(trafficSnapshots.snapshotDate, isoDay(new Date(now.getTime() - 14 * 24 * 3600_000))),
          )
        : and(
            eq(trafficSnapshots.source, "ga4"),
            gte(trafficSnapshots.snapshotDate, isoDay(new Date(now.getTime() - 14 * 24 * 3600_000))),
          ),
    );
  const gaRows = await gaBase.orderBy(desc(trafficSnapshots.snapshotDate));

  if (gaRows.length > 0) {
    const sumSessions = (rows: typeof gaRows) => rows.reduce((s, r) => s + Number(r.metrics?.sessions ?? 0), 0);
    const recent = gaRows.slice(0, 7);
    const prior = gaRows.slice(7, 14);
    const rec = sumSessions(recent);
    const pri = sumSessions(prior);
    const delta = pri > 0 ? Math.round(((rec - pri) / pri) * 100) : 0;
    sections.push(
      [
        "## GA4 · sessions",
        "",
        `Last 7 days: ${rec.toLocaleString()} sessions`,
        `Prior 7 days: ${pri.toLocaleString()} sessions`,
        `Week-over-week: ${delta > 0 ? "+" : ""}${delta}%`,
      ].join("\n"),
    );
  } else {
    sections.push("## GA4 · sessions\n\nNo GA4 snapshots available for this scope.");
  }

  // Open patterns.
  const patterns = await d
    .select({
      kind: sitePatterns.kind,
      severity: sitePatterns.severity,
      title: sitePatterns.title,
      summary: sitePatterns.summary,
    })
    .from(sitePatterns)
    .where(eq(sitePatterns.status, "open"))
    .orderBy(desc(sitePatterns.detectedAt))
    .limit(8);
  if (patterns.length > 0) {
    const lines = ["## Open cross-site patterns (top 8)", "", "| Severity | Title | Summary |", "|---|---|---|"];
    for (const p of patterns) {
      lines.push(`| ${p.severity} | ${p.title} | ${p.summary.slice(0, 120)} |`);
    }
    sections.push(lines.join("\n"));
  } else {
    sections.push("## Open cross-site patterns\n\nNo open patterns right now.");
  }

  // QA failures in the last 24 h grouped by kind.
  const qaGroups = await d
    .select({
      checkKind: qaChecks.checkKind,
      severity: qaChecks.severity,
      count: sql<number>`count(*)::int`,
    })
    .from(qaChecks)
    .where(
      and(
        eq(qaChecks.status, "fail"),
        eq(qaChecks.suppressed, false),
        gte(qaChecks.createdAt, dayAgo),
      ),
    )
    .groupBy(qaChecks.checkKind, qaChecks.severity)
    .orderBy(desc(sql`count(*)`))
    .limit(10);
  if (qaGroups.length > 0) {
    const lines = ["## QA failures · last 24 h", "", "| Check | Severity | Count |", "|---|---|---:|"];
    for (const g of qaGroups) {
      lines.push(`| ${g.checkKind} | ${g.severity ?? "high"} | ${g.count} |`);
    }
    sections.push(lines.join("\n"));
  } else {
    sections.push("## QA failures · last 24 h\n\nNo failed QA checks in the last 24 hours.");
  }

  return sections.join("\n\n");
}
