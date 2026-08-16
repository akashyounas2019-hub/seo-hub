"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { siteUsers, sites, taskComments, tasks, users } from "@/db/schema";
import { recordAdminAction } from "@/lib/audit-log";
import { getVisibility } from "@/lib/permissions";
import { requireUser } from "@/lib/server-auth";
import {
  notifyTaskAssigned,
  notifyTaskCommented,
  notifyTaskReassigned,
  notifyTaskStatusChanged,
} from "@/lib/task-notifications";

const TASK_STATUSES = ["todo", "in_progress", "blocked", "in_review", "done", "cancelled"] as const;
const TASK_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
type TaskStatus = (typeof TASK_STATUSES)[number];
type TaskPriority = (typeof TASK_PRIORITIES)[number];

function s(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}

async function ensureTaskAccess(taskId: string) {
  const user = await requireUser();
  const [task] = await db().select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
  if (!task) redirect("/admin/tasks?error=not-found");
  const visibility = await getVisibility(user);
  if (visibility.kind === "scoped" && !visibility.siteIds.includes(task.siteId)) {
    redirect("/admin/tasks?error=forbidden");
  }
  return { user, task };
}

export async function createTaskAction(formData: FormData) {
  await ensureSchema();
  const user = await requireUser();
  const visibility = await getVisibility(user);

  const siteId = s(formData, "siteId");
  const title = s(formData, "title");
  const description = s(formData, "description") || null;
  const priority = (s(formData, "priority") || "normal") as TaskPriority;
  const assigneeId = s(formData, "assigneeId") || null;
  const dueRaw = s(formData, "dueAt");

  if (!siteId || !title || !TASK_PRIORITIES.includes(priority)) {
    redirect("/admin/tasks/new?error=invalid");
  }

  // Scope check
  if (visibility.kind === "scoped" && !visibility.siteIds.includes(siteId)) {
    redirect("/admin/tasks/new?error=forbidden");
  }
  // Students can't create tasks
  if (user.role === "student") {
    redirect("/admin/tasks?error=forbidden");
  }

  let dueAt: Date | null = null;
  if (dueRaw) {
    const parsed = new Date(dueRaw);
    if (!Number.isNaN(parsed.getTime())) dueAt = parsed;
  }

  const [created] = await db()
    .insert(tasks)
    .values({
      siteId,
      title,
      description,
      priority,
      assigneeId,
      creatorId: user.id,
      dueAt,
    })
    .returning({ id: tasks.id });

  if (assigneeId) {
    await notifyTaskAssigned({
      taskId: created.id,
      taskTitle: title,
      siteId,
      assigneeId,
      assignerId: user.id,
    });
  }

  await recordAdminAction({
    actor: user,
    kind: "task.create",
    targetType: "task",
    targetId: created.id,
    summary: `Created task "${title}" (priority=${priority}${assigneeId ? `, assigned)` : ", unassigned)"}`,
    after: { title, priority, siteId, assigneeId, dueAt: dueAt?.toISOString() ?? null },
  });

  revalidatePath("/admin/tasks");
  redirect(`/admin/tasks/${created.id}`);
}

export async function updateTaskStatusAction(taskId: string, formData: FormData) {
  await ensureSchema();
  const { user, task } = await ensureTaskAccess(taskId);
  const status = s(formData, "status") as TaskStatus;
  if (!TASK_STATUSES.includes(status)) redirect(`/admin/tasks/${taskId}?error=status`);

  const completedAt =
    status === "done" || status === "cancelled" ? task.completedAt ?? new Date() : null;

  await db()
    .update(tasks)
    .set({ status, completedAt, updatedAt: new Date() })
    .where(eq(tasks.id, taskId));

  if (status !== task.status) {
    await notifyTaskStatusChanged({
      taskId,
      taskTitle: task.title,
      newStatus: status,
      actorId: user.id,
    });
    await recordAdminAction({
      actor: user,
      kind: "task.status_change",
      targetType: "task",
      targetId: taskId,
      summary: `Status: ${task.status} → ${status} on "${task.title}"`,
      before: { status: task.status },
      after: { status },
    });
  }

  revalidatePath("/admin/tasks");
  revalidatePath(`/admin/tasks/${taskId}`);
  // Toast picks up `?ok=status_changed&prev=...&id=...` and offers Undo.
  redirect(
    `/admin/tasks/${taskId}?ok=status_changed&prev=${encodeURIComponent(task.status)}&id=${taskId}`,
  );
}

export async function updateTaskAction(taskId: string, formData: FormData) {
  await ensureSchema();
  const { user, task } = await ensureTaskAccess(taskId);
  if (user.role === "student") redirect(`/admin/tasks/${taskId}?error=forbidden`);

  const title = s(formData, "title");
  const description = s(formData, "description") || null;
  const priority = s(formData, "priority") as TaskPriority;
  const assigneeId = s(formData, "assigneeId") || null;
  const dueRaw = s(formData, "dueAt");

  if (!title || !TASK_PRIORITIES.includes(priority)) {
    redirect(`/admin/tasks/${taskId}?error=invalid`);
  }
  let dueAt: Date | null = null;
  if (dueRaw) {
    const parsed = new Date(dueRaw);
    if (!Number.isNaN(parsed.getTime())) dueAt = parsed;
  }

  await db()
    .update(tasks)
    .set({ title, description, priority, assigneeId, dueAt, updatedAt: new Date() })
    .where(eq(tasks.id, taskId));

  if (assigneeId && assigneeId !== task.assigneeId) {
    await notifyTaskReassigned({
      taskId,
      taskTitle: title,
      siteId: task.siteId,
      newAssigneeId: assigneeId,
      oldAssigneeId: task.assigneeId,
      actorId: user.id,
    });
  }

  await recordAdminAction({
    actor: user,
    kind: "task.update",
    targetType: "task",
    targetId: taskId,
    summary: `Updated task "${task.title}"`,
    before: { title: task.title, priority: task.priority, assigneeId: task.assigneeId, dueAt: task.dueAt?.toISOString() ?? null },
    after: { title, priority, assigneeId, dueAt: dueAt?.toISOString() ?? null },
  });

  revalidatePath(`/admin/tasks/${taskId}`);
  redirect(`/admin/tasks/${taskId}?ok=saved`);
}

export async function deleteTaskAction(taskId: string) {
  await ensureSchema();
  const { user, task } = await ensureTaskAccess(taskId);
  if (user.role !== "admin") redirect(`/admin/tasks/${taskId}?error=forbidden`);
  await db().delete(tasks).where(eq(tasks.id, taskId));
  await recordAdminAction({
    actor: user,
    kind: "task.delete",
    targetType: "task",
    targetId: taskId,
    summary: `Deleted task "${task.title}"`,
    before: { title: task.title, status: task.status, siteId: task.siteId },
  });
  revalidatePath("/admin/tasks");
  redirect("/admin/tasks?ok=deleted");
}

export async function addTaskCommentAction(taskId: string, formData: FormData) {
  await ensureSchema();
  const { user, task } = await ensureTaskAccess(taskId);
  const body = s(formData, "body");
  if (!body) redirect(`/admin/tasks/${taskId}?error=empty-comment`);
  await db().insert(taskComments).values({ taskId, authorId: user.id, body });

  await notifyTaskCommented({
    taskId,
    taskTitle: task.title,
    commentSnippet: body,
    authorId: user.id,
  });

  await recordAdminAction({
    actor: user,
    kind: "task.comment",
    targetType: "task",
    targetId: taskId,
    summary: `Commented on "${task.title}": ${body.slice(0, 80)}`,
  });

  revalidatePath(`/admin/tasks/${taskId}`);
  redirect(`/admin/tasks/${taskId}#comments`);
}

/** Used by the create-task UI to populate the assignee dropdown. */
export async function getAssignableUsersForSite(siteId: string) {
  await ensureSchema();
  // Admins are always assignable. Plus anyone with a site_users row on this site.
  const adminRows = await db()
    .select({ id: users.id, email: users.email, name: users.name, role: users.role })
    .from(users)
    .where(eq(users.role, "admin"));
  const memberRows = await db()
    .select({ id: users.id, email: users.email, name: users.name, role: users.role })
    .from(users)
    .innerJoin(siteUsers, eq(siteUsers.userId, users.id))
    .where(eq(siteUsers.siteId, siteId));
  const dedup = new Map<string, (typeof adminRows)[number]>();
  for (const r of [...adminRows, ...memberRows]) dedup.set(r.id, r);
  return Array.from(dedup.values()).sort((a, b) => a.email.localeCompare(b.email));
}

/** Sites the current user can target for new tasks. */
export async function getCreatableSites() {
  await ensureSchema();
  const user = await requireUser();
  const visibility = await getVisibility(user);
  if (visibility.kind === "all") {
    return db().select().from(sites).orderBy(sites.slug);
  }
  if (visibility.siteIds.length === 0) return [];
  return db().select().from(sites).where(inArray(sites.id, visibility.siteIds)).orderBy(sites.slug);
}

// no-op import to keep `and` referenced (used in future task filters)
void and;
