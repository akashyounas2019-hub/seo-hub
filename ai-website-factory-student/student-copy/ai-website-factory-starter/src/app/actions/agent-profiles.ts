"use server";

/**
 * Server actions for the SEO agent roster.
 *
 * Skill instructions and custom-agent metadata live in `agent_profiles`. All
 * three mutations go through here and revalidate the roster + Agent Jobs
 * screens so the sidebar and hero re-render on next navigation.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { agentProfiles, agentSchedules } from "@/db/schema";
import { recordAdminAction } from "@/lib/audit-log";
import {
  AGENT_ROSTER,
  BUILT_IN_DEFAULT_SKILLS,
  isBuiltInAgentId,
  type BuiltInAgentId,
} from "@/lib/agent-roster";
import { requireAdmin } from "@/lib/server-auth";

function s(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}

/** Turn a display name into a stable custom-agent id. */
function slugifyCustomId(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "agent";
  const suffix = Math.random().toString(36).slice(2, 6);
  return `custom-${base}-${suffix}`;
}

/**
 * Save the skill instructions for one agent. Works for both built-in and
 * custom agents. Called from the profile page's textarea form.
 */
export async function saveAgentSkillAction(formData: FormData): Promise<void> {
  await ensureSchema();
  const me = await requireAdmin();

  const agentId = s(formData, "agentId");
  const skill = s(formData, "skillInstructions");
  if (!agentId) redirect("/admin/agent/jobs?error=invalid-agent");

  const [existing] = await db()
    .select({ id: agentProfiles.id })
    .from(agentProfiles)
    .where(eq(agentProfiles.id, agentId))
    .limit(1);
  if (!existing) redirect("/admin/agent/jobs?error=agent-not-found");

  await db()
    .update(agentProfiles)
    .set({ skillInstructions: skill || null, updatedAt: new Date() })
    .where(eq(agentProfiles.id, agentId));

  await recordAdminAction({
    actor: me,
    kind: "agent_profile.skill_update",
    targetType: "other",
    targetId: agentId,
    summary: `Updated skill instructions for agent ${agentId}`,
  });

  revalidatePath(`/admin/agent/roster/${agentId}`);
  revalidatePath("/admin/agent/jobs");
  redirect(`/admin/agent/roster/${agentId}?ok=skill-saved`);
}

/**
 * Rename an agent — updates display name, role title, and focus tag line.
 * Works for both built-in and custom agents. The database id ('onpage',
 * 'research', a slugged custom id, etc.) is NEVER touched here, so job
 * routing that references the id keeps working after a rename.
 *
 * Expected form fields:
 *   agentId   — the row to update
 *   name      — new display name (min 2 chars)
 *   title     — role title (defaults to previous value if blank)
 *   focus     — one-line tag (optional; empty string clears it)
 */
export async function renameAgentAction(formData: FormData): Promise<void> {
  await ensureSchema();
  const me = await requireAdmin();

  const agentId = s(formData, "agentId");
  const name = s(formData, "name");
  const title = s(formData, "title");
  const focusRaw = formData.get("focus");
  const focus = typeof focusRaw === "string" ? focusRaw.trim() : "";

  if (!agentId) redirect("/admin/agent/jobs?error=invalid-agent");
  if (!name || name.length < 2) {
    redirect(`/admin/agent/roster/${agentId}?error=name-too-short`);
  }

  const [existing] = await db()
    .select({ id: agentProfiles.id, oldName: agentProfiles.name, oldTitle: agentProfiles.title })
    .from(agentProfiles)
    .where(eq(agentProfiles.id, agentId))
    .limit(1);
  if (!existing) redirect("/admin/agent/jobs?error=agent-not-found");

  await db()
    .update(agentProfiles)
    .set({
      name,
      title: title || existing.oldTitle,
      focus: focus || null,
      updatedAt: new Date(),
    })
    .where(eq(agentProfiles.id, agentId));

  await recordAdminAction({
    actor: me,
    kind: "agent_profile.rename",
    targetType: "other",
    targetId: agentId,
    summary: `Renamed agent ${agentId}: "${existing.oldName} · ${existing.oldTitle}" → "${name} · ${title || existing.oldTitle}"`,
  });

  revalidatePath(`/admin/agent/roster/${agentId}`);
  revalidatePath("/admin/agent/jobs");
  redirect(`/admin/agent/roster/${agentId}?ok=renamed`);
}

/** Reset a built-in agent's skill instructions back to the seeded default. */
export async function resetAgentSkillAction(formData: FormData): Promise<void> {
  await ensureSchema();
  const me = await requireAdmin();
  const agentId = s(formData, "agentId");
  if (!isBuiltInAgentId(agentId)) redirect("/admin/agent/jobs?error=not-built-in");

  const defaultSkill = BUILT_IN_DEFAULT_SKILLS[agentId as BuiltInAgentId];
  const seed = AGENT_ROSTER.find((a) => a.id === agentId);
  await db()
    .update(agentProfiles)
    .set({
      skillInstructions: defaultSkill,
      // Also reset the focus (tag line) so the UI stays in sync with the seed
      // when we update BUILT_IN_DEFAULT_SKILLS + focus copy together.
      ...(seed ? { focus: seed.focus } : {}),
      updatedAt: new Date(),
    })
    .where(eq(agentProfiles.id, agentId));

  await recordAdminAction({
    actor: me,
    kind: "agent_profile.skill_reset",
    targetType: "other",
    targetId: agentId,
    summary: `Reset skill for built-in agent ${agentId}`,
  });

  revalidatePath(`/admin/agent/roster/${agentId}`);
  revalidatePath("/admin/agent/jobs");
  redirect(`/admin/agent/roster/${agentId}?ok=skill-reset`);
}

/**
 * Create a new custom agent from the "Add New Agent" form.
 */
export async function createCustomAgentAction(formData: FormData): Promise<void> {
  await ensureSchema();
  const me = await requireAdmin();

  const name = s(formData, "name");
  const title = s(formData, "title") || "Custom Agent";
  const focus = s(formData, "focus");
  const skill = s(formData, "skillInstructions");

  if (!name || name.length < 2) {
    redirect("/admin/agent/roster/new?error=name-required");
  }

  const id = slugifyCustomId(name);
  await db().insert(agentProfiles).values({
    id,
    name,
    title,
    focus: focus || null,
    skillInstructions: skill || null,
    isCustom: true,
    createdBy: me.id,
  });

  await recordAdminAction({
    actor: me,
    kind: "agent_profile.create",
    targetType: "other",
    targetId: id,
    summary: `Created custom agent "${name}"`,
    after: { title, focus: focus || null },
  });

  revalidatePath("/admin/agent/jobs");
  redirect(`/admin/agent/jobs?ok=agent-created&name=${encodeURIComponent(name)}`);
}

/** Delete a custom agent. Built-ins are never deletable. */
export async function deleteCustomAgentAction(formData: FormData): Promise<void> {
  await ensureSchema();
  const me = await requireAdmin();
  const agentId = s(formData, "agentId");
  if (isBuiltInAgentId(agentId)) {
    redirect(`/admin/agent/roster/${agentId}?error=cannot-delete-builtin`);
  }
  await db()
    .delete(agentProfiles)
    .where(and(eq(agentProfiles.id, agentId), eq(agentProfiles.isCustom, true)));
  await recordAdminAction({
    actor: me,
    kind: "agent_profile.delete",
    targetType: "other",
    targetId: agentId,
    summary: `Deleted custom agent ${agentId}`,
  });
  revalidatePath("/admin/agent/jobs");
  redirect("/admin/agent/jobs?ok=agent-deleted");
}

/**
 * Create a scheduled task for an agent. The runner will pick this row up at
 * `next_fire_at` and enqueue a `claude_jobs` row of kind `agent_task`.
 */
export async function createAgentScheduleAction(formData: FormData): Promise<void> {
  await ensureSchema();
  const me = await requireAdmin();

  const agentId = s(formData, "agentId");
  const taskType = s(formData, "taskType") || "custom";
  const title = s(formData, "title");
  const instructions = s(formData, "instructions");
  const runAtRaw = s(formData, "runAt");
  const recurrence = s(formData, "recurrence") || "once";

  if (!agentId || !title || !runAtRaw) {
    redirect(`/admin/agent/roster/${agentId || ""}?error=schedule-invalid`);
  }

  const runAt = new Date(runAtRaw);
  if (Number.isNaN(runAt.getTime())) {
    redirect(`/admin/agent/roster/${agentId}?error=schedule-bad-time`);
  }

  await db().insert(agentSchedules).values({
    agentId,
    taskType,
    title,
    instructions: instructions || null,
    nextFireAt: runAt,
    recurrence,
    createdBy: me.id,
  });

  await recordAdminAction({
    actor: me,
    kind: "agent_schedule.create",
    targetType: "other",
    targetId: agentId,
    summary: `Scheduled "${title}" for ${agentId} at ${runAt.toISOString()} (${recurrence})`,
  });

  revalidatePath(`/admin/agent/roster/${agentId}`);
  redirect(`/admin/agent/roster/${agentId}?ok=schedule-created`);
}

/**
 * Toggle an agent's active status. Deactivated agents render OFF on the
 * hero and (by convention) should not receive new dispatched work. Applies to
 * both built-ins and customs — nothing is deleted, just the flag flips.
 *
 * Expected form fields:
 *   agentId  — the agent to toggle
 *   isActive — "true" or "false" (as a string)
 */
export async function setAgentActiveAction(formData: FormData): Promise<void> {
  await ensureSchema();
  const me = await requireAdmin();

  const agentId = s(formData, "agentId");
  const raw = s(formData, "isActive").toLowerCase();
  const isActive = raw === "true" || raw === "1" || raw === "on";
  if (!agentId) redirect("/admin/agent/jobs?error=invalid-agent");

  const [existing] = await db()
    .select({ id: agentProfiles.id })
    .from(agentProfiles)
    .where(eq(agentProfiles.id, agentId))
    .limit(1);
  if (!existing) redirect("/admin/agent/jobs?error=agent-not-found");

  await db()
    .update(agentProfiles)
    .set({ isActive, updatedAt: new Date() })
    .where(eq(agentProfiles.id, agentId));

  await recordAdminAction({
    actor: me,
    kind: isActive ? "agent_profile.activate" : "agent_profile.deactivate",
    targetType: "other",
    targetId: agentId,
    summary: `${isActive ? "Activated" : "Deactivated"} agent ${agentId}`,
  });

  revalidatePath(`/admin/agent/roster/${agentId}`);
  revalidatePath("/admin/agent/jobs");
  redirect(`/admin/agent/roster/${agentId}?ok=${isActive ? "activated" : "deactivated"}`);
}

/**
 * Toggle a schedule's enabled flag — the /admin/automation UI's play/pause.
 * Doesn't delete or reschedule, just flips agent_schedules.enabled so the
 * agent_schedules cron runner skips (or resumes) it on next tick.
 */
export async function toggleAgentScheduleAction(formData: FormData): Promise<void> {
  await ensureSchema();
  const me = await requireAdmin();
  const scheduleId = s(formData, "scheduleId");
  const desiredRaw = s(formData, "enabled").toLowerCase();
  const desired = desiredRaw === "true" || desiredRaw === "1" || desiredRaw === "on";
  if (!scheduleId) redirect("/admin/automation?error=invalid");

  await db()
    .update(agentSchedules)
    .set({ enabled: desired, updatedAt: new Date() })
    .where(eq(agentSchedules.id, scheduleId));

  await recordAdminAction({
    actor: me,
    kind: desired ? "agent_schedule.resume" : "agent_schedule.pause",
    targetType: "other",
    targetId: scheduleId,
    summary: `${desired ? "Resumed" : "Paused"} schedule ${scheduleId}`,
  });

  revalidatePath("/admin/automation");
  redirect(`/admin/automation?ok=${desired ? "resumed" : "paused"}`);
}

/**
 * Create a new automation directly from /admin/automation without going through
 * the profile page. Accepts the same fields as createAgentScheduleAction, plus
 * an optional recurrence — defaults to weekly, which is the most common cadence
 * for cleaning-vertical work.
 */
export async function createAutomationAction(formData: FormData): Promise<void> {
  await ensureSchema();
  const me = await requireAdmin();

  const agentId = s(formData, "agentId");
  const taskType = s(formData, "taskType") || "custom";
  const title = s(formData, "title");
  const instructions = s(formData, "instructions");
  const runAtRaw = s(formData, "runAt");
  const recurrence = s(formData, "recurrence") || "weekly";

  if (!agentId || !title) {
    redirect("/admin/automation?error=missing-fields");
  }

  const runAt = runAtRaw ? new Date(runAtRaw) : new Date(Date.now() + 60_000);
  if (Number.isNaN(runAt.getTime())) {
    redirect("/admin/automation?error=bad-time");
  }

  await db().insert(agentSchedules).values({
    agentId,
    taskType,
    title,
    instructions: instructions || null,
    nextFireAt: runAt,
    recurrence,
    createdBy: me.id,
  });

  await recordAdminAction({
    actor: me,
    kind: "agent_schedule.create",
    targetType: "other",
    targetId: agentId,
    summary: `Automation "${title}" created for ${agentId} (${recurrence})`,
  });

  revalidatePath("/admin/automation");
  redirect("/admin/automation?ok=created");
}

/**
 * Update one automation's editable fields from the /admin/automation edit
 * modal. Only touches configuration surfaces (name, instructions, cadence,
 * task type, first fire) — the target agent and target site are immutable
 * once an automation exists (they influence downstream jobs). To move an
 * automation to a different agent, delete + recreate.
 */
export async function updateAutomationAction(formData: FormData): Promise<void> {
  await ensureSchema();
  const me = await requireAdmin();

  const scheduleId = s(formData, "scheduleId");
  const title = s(formData, "title");
  const instructions = s(formData, "instructions");
  const taskType = s(formData, "taskType");
  const recurrence = s(formData, "recurrence");
  const runAtRaw = s(formData, "runAt");

  if (!scheduleId || !title) {
    redirect("/admin/automation?error=missing-fields");
  }

  const patch: Record<string, unknown> = {
    title,
    instructions: instructions || null,
    updatedAt: new Date(),
  };
  if (taskType) patch.taskType = taskType;
  if (recurrence) patch.recurrence = recurrence;
  if (runAtRaw) {
    const runAt = new Date(runAtRaw);
    if (Number.isNaN(runAt.getTime())) redirect("/admin/automation?error=bad-time");
    patch.nextFireAt = runAt;
  }

  await db()
    .update(agentSchedules)
    .set(patch)
    .where(eq(agentSchedules.id, scheduleId));

  await recordAdminAction({
    actor: me,
    kind: "agent_schedule.update",
    targetType: "other",
    targetId: scheduleId,
    summary: `Updated automation "${title}" (${scheduleId})`,
  });

  revalidatePath("/admin/automation");
  redirect("/admin/automation?ok=updated");
}

/** Delete a scheduled task. */
export async function deleteAgentScheduleAction(formData: FormData): Promise<void> {
  await ensureSchema();
  const me = await requireAdmin();
  const scheduleId = s(formData, "scheduleId");
  const agentId = s(formData, "agentId");
  if (!scheduleId || !agentId) redirect("/admin/agent/jobs?error=invalid");

  await db().delete(agentSchedules).where(eq(agentSchedules.id, scheduleId));
  await recordAdminAction({
    actor: me,
    kind: "agent_schedule.delete",
    targetType: "other",
    targetId: scheduleId,
    summary: `Deleted schedule ${scheduleId} for ${agentId}`,
  });

  revalidatePath(`/admin/agent/roster/${agentId}`);
  redirect(`/admin/agent/roster/${agentId}?ok=schedule-deleted`);
}
