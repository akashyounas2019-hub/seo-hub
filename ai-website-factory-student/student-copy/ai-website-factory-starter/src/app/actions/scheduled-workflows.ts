/**
 * P9 — Scheduled workflow CRUD actions.
 *
 * The runner script (`src/scripts/run-scheduled-workflows.ts`) sweeps
 * the table every minute. These actions just maintain the rows.
 *
 * Common workflows the operator creates here:
 *  - "Publish next blog Monday 9am"     → build:page_generate on a cron
 *  - "Refresh stale pages quarterly"    → build:refresh_recommender weekly
 *  - "Re-validate fan-out keywords monthly" → build:keyword_research monthly
 *
 * Cron is stored as a 5-field POSIX string in the row's `cronExpr`
 * column + `timezone` (IANA, defaults to Asia/Dubai). The runner
 * evaluates next_fire_at lazily — we set it here on insert/toggle.
 */

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { scheduledWorkflows, siteBuildProjects } from "@/db/schema";
import { recordAdminAction } from "@/lib/audit-log";
import { templateByKind } from "@/lib/claude-job-templates";
import { requireAdmin } from "@/lib/server-auth";
import { nextCronFire } from "@/lib/cron-evaluator";

function s(formData: FormData, k: string): string {
  const v = formData.get(k);
  return typeof v === "string" ? v.trim() : "";
}

/** Create a new scheduled workflow row + compute its first next_fire_at. */
export async function createScheduledWorkflowAction(formData: FormData): Promise<void> {
  await ensureSchema();
  const me = await requireAdmin();

  const projectId = s(formData, "projectId");
  const name = s(formData, "name");
  const jobKind = s(formData, "jobKind");
  const cronExpr = s(formData, "cronExpr");
  const timezone = s(formData, "timezone") || "Asia/Dubai";
  const preferWorker = (s(formData, "preferWorker") || "mac") as "mac" | "server" | "any";
  const jobInputJson = s(formData, "jobInputJson") || "{}";

  if (!projectId) redirect("/admin/build?error=missing-projectId");
  if (!name || !jobKind || !cronExpr) {
    redirect(`/admin/build/${projectId}/schedule?error=missing-fields`);
  }

  const [project] = await db()
    .select()
    .from(siteBuildProjects)
    .where(eq(siteBuildProjects.id, projectId))
    .limit(1);
  if (!project) redirect("/admin/build?error=unknown-project");

  // Validate job_kind against known templates
  const template = templateByKind(jobKind);
  if (!template) {
    redirect(`/admin/build/${projectId}/schedule?error=unknown-job-kind`);
  }

  // Validate JSON
  let jobInput: Record<string, unknown>;
  try {
    jobInput = JSON.parse(jobInputJson) as Record<string, unknown>;
  } catch {
    redirect(`/admin/build/${projectId}/schedule?error=invalid-json`);
  }
  // Always carry the project_id for downstream lookups
  jobInput = { ...jobInput!, projectId };

  // Validate cron + compute first fire
  let nextFireAt: Date;
  try {
    nextFireAt = nextCronFire(cronExpr, timezone, new Date());
  } catch (err) {
    const msg = err instanceof Error ? err.message : "invalid-cron";
    redirect(`/admin/build/${projectId}/schedule?error=${encodeURIComponent("cron: " + msg)}`);
  }

  await db().insert(scheduledWorkflows).values({
    projectId: project.id,
    siteId: null, // bound to project, not site (project may not be deployed yet)
    name,
    jobKind,
    jobInput: jobInput!,
    cronExpr,
    timezone,
    preferWorker,
    enabled: true,
    nextFireAt: nextFireAt!,
    createdBy: me.id,
  });

  await recordAdminAction({
    actor: me,
    kind: "scheduled_workflow.create",
    targetType: "other",
    targetId: project.id,
    summary: `Created scheduled workflow "${name}" (${jobKind} @ ${cronExpr} ${timezone})`,
  });

  revalidatePath(`/admin/build/${projectId}/schedule`);
  redirect(`/admin/build/${projectId}/schedule?created=1`);
}

/** Toggle enabled state on a workflow. */
export async function toggleScheduledWorkflowAction(formData: FormData): Promise<void> {
  await ensureSchema();
  const me = await requireAdmin();
  const id = s(formData, "id");
  const projectId = s(formData, "projectId");
  if (!id) return;

  const [wf] = await db()
    .select()
    .from(scheduledWorkflows)
    .where(eq(scheduledWorkflows.id, id))
    .limit(1);
  if (!wf) return;

  // Recompute next_fire_at when re-enabling so the runner picks it up.
  let nextFireAt = wf.nextFireAt;
  if (!wf.enabled) {
    try {
      nextFireAt = nextCronFire(wf.cronExpr, wf.timezone, new Date());
    } catch {
      // Leave existing — operator should fix the cron string before re-enabling.
    }
  }

  await db()
    .update(scheduledWorkflows)
    .set({
      enabled: !wf.enabled,
      nextFireAt,
      updatedAt: new Date(),
    })
    .where(eq(scheduledWorkflows.id, id));

  await recordAdminAction({
    actor: me,
    kind: "scheduled_workflow.toggle",
    targetType: "other",
    targetId: wf.projectId ?? id,
    summary: `${wf.enabled ? "Disabled" : "Enabled"} workflow "${wf.name}"`,
  });

  if (projectId) {
    revalidatePath(`/admin/build/${projectId}/schedule`);
  }
}

/** Permanently delete a workflow. */
export async function deleteScheduledWorkflowAction(formData: FormData): Promise<void> {
  await ensureSchema();
  const me = await requireAdmin();
  const id = s(formData, "id");
  const projectId = s(formData, "projectId");
  if (!id) return;

  const [wf] = await db()
    .select()
    .from(scheduledWorkflows)
    .where(eq(scheduledWorkflows.id, id))
    .limit(1);
  if (!wf) return;

  await db().delete(scheduledWorkflows).where(eq(scheduledWorkflows.id, id));

  await recordAdminAction({
    actor: me,
    kind: "scheduled_workflow.delete",
    targetType: "other",
    targetId: wf.projectId ?? id,
    summary: `Deleted scheduled workflow "${wf.name}"`,
  });

  if (projectId) {
    revalidatePath(`/admin/build/${projectId}/schedule`);
  }
}

/** Dry-run: show the next 5 firing times for a candidate cron expr. */
export async function previewCronAction(formData: FormData): Promise<{ ok: boolean; fires?: string[]; error?: string }> {
  const cronExpr = s(formData, "cronExpr");
  const timezone = s(formData, "timezone") || "Asia/Dubai";
  if (!cronExpr) return { ok: false, error: "cron-required" };
  try {
    const fires: string[] = [];
    let cursor = new Date();
    for (let i = 0; i < 5; i++) {
      cursor = nextCronFire(cronExpr, timezone, cursor);
      fires.push(cursor.toISOString());
    }
    return { ok: true, fires };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// Helper to silence unused-import warnings for `and` (kept for future filters)
void and;
