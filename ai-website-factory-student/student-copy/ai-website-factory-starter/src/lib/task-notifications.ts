import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { notifications, sites, tasks, users } from "@/db/schema";
import { emailIfOptedIn } from "./notify-email";

/**
 * Drops in-app notifications when meaningful task events happen.
 * All functions are best-effort — they swallow errors so a missing notification
 * never breaks the underlying task mutation.
 */

async function recipientName(userId: string | null | undefined): Promise<string> {
  if (!userId) return "someone";
  const [u] = await db().select({ name: users.name, email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  return u?.name ?? u?.email ?? "someone";
}

async function siteSlugFor(siteId: string): Promise<string | null> {
  const [s] = await db().select({ slug: sites.slug }).from(sites).where(eq(sites.id, siteId)).limit(1);
  return s?.slug ?? null;
}

async function notify(opts: {
  recipientId: string;
  kind: string;
  title: string;
  body: string;
  link: string;
}): Promise<void> {
  try {
    await db().insert(notifications).values({
      recipientId: opts.recipientId,
      kind: opts.kind,
      title: opts.title,
      body: opts.body,
      link: opts.link,
    });
  } catch (err) {
    console.warn("[task-notify] failed", err);
  }
}

export async function notifyTaskAssigned(opts: {
  taskId: string;
  taskTitle: string;
  siteId: string;
  assigneeId: string;
  assignerId: string;
}): Promise<void> {
  // Don't notify yourself
  if (opts.assigneeId === opts.assignerId) return;

  const [siteSlug, assignerName] = await Promise.all([
    siteSlugFor(opts.siteId),
    recipientName(opts.assignerId),
  ]);

  await notify({
    recipientId: opts.assigneeId,
    kind: "task_assigned",
    title: `📋 ${assignerName} assigned you: ${opts.taskTitle.slice(0, 100)}`,
    body: siteSlug
      ? `Site: ${siteSlug}\n\nOpen the task to see the details, due date, and comments.`
      : "Open the task to see the details, due date, and comments.",
    link: `/admin/tasks/${opts.taskId}`,
  });

  await emailIfOptedIn(opts.assigneeId, "task_assigned", {
    kind: "task_assigned",
    taskTitle: opts.taskTitle,
    siteSlug,
    link: `/admin/tasks/${opts.taskId}`,
  });
}

export async function notifyTaskReassigned(opts: {
  taskId: string;
  taskTitle: string;
  siteId: string;
  newAssigneeId: string;
  oldAssigneeId: string | null;
  actorId: string;
}): Promise<void> {
  const [siteSlug, actorName] = await Promise.all([
    siteSlugFor(opts.siteId),
    recipientName(opts.actorId),
  ]);

  // New assignee — notify if not the actor
  if (opts.newAssigneeId !== opts.actorId) {
    await notify({
      recipientId: opts.newAssigneeId,
      kind: "task_assigned",
      title: `📋 ${actorName} assigned you: ${opts.taskTitle.slice(0, 100)}`,
      body: siteSlug
        ? `Site: ${siteSlug}\n\nThis task was reassigned to you. Open it for the latest details.`
        : "This task was reassigned to you. Open it for the latest details.",
      link: `/admin/tasks/${opts.taskId}`,
    });
    await emailIfOptedIn(opts.newAssigneeId, "task_assigned", {
      kind: "task_assigned",
      taskTitle: opts.taskTitle,
      siteSlug,
      link: `/admin/tasks/${opts.taskId}`,
    });
  }

  // Old assignee — let them know they're off the hook (only if it wasn't them doing the reassign)
  if (opts.oldAssigneeId && opts.oldAssigneeId !== opts.actorId && opts.oldAssigneeId !== opts.newAssigneeId) {
    await notify({
      recipientId: opts.oldAssigneeId,
      kind: "task_unassigned",
      title: `↩ ${actorName} reassigned: ${opts.taskTitle.slice(0, 100)}`,
      body: "This task is no longer on your plate.",
      link: `/admin/tasks/${opts.taskId}`,
    });
  }
}

export async function notifyTaskCommented(opts: {
  taskId: string;
  taskTitle: string;
  commentSnippet: string;
  authorId: string;
}): Promise<void> {
  // Notify the task assignee + creator, except the author themselves
  const [task] = await db()
    .select({ assigneeId: tasks.assigneeId, creatorId: tasks.creatorId })
    .from(tasks)
    .where(eq(tasks.id, opts.taskId))
    .limit(1);
  if (!task) return;

  const authorName = await recipientName(opts.authorId);
  const recipients = new Set<string>();
  if (task.assigneeId && task.assigneeId !== opts.authorId) recipients.add(task.assigneeId);
  if (task.creatorId && task.creatorId !== opts.authorId) recipients.add(task.creatorId);

  for (const recipientId of recipients) {
    await notify({
      recipientId,
      kind: "task_commented",
      title: `💬 ${authorName} commented on: ${opts.taskTitle.slice(0, 80)}`,
      body: opts.commentSnippet.slice(0, 400),
      link: `/admin/tasks/${opts.taskId}#comments`,
    });
    await emailIfOptedIn(recipientId, "task_comment", {
      kind: "task_comment",
      taskTitle: opts.taskTitle,
      commentSnippet: opts.commentSnippet,
      authorName,
      link: `/admin/tasks/${opts.taskId}#comments`,
    });
  }
}

export async function notifyTaskStatusChanged(opts: {
  taskId: string;
  taskTitle: string;
  newStatus: string;
  actorId: string;
}): Promise<void> {
  // Notify the creator on terminal status changes (done / cancelled / blocked)
  if (!["done", "cancelled", "blocked"].includes(opts.newStatus)) return;

  const [task] = await db()
    .select({ creatorId: tasks.creatorId, assigneeId: tasks.assigneeId })
    .from(tasks)
    .where(eq(tasks.id, opts.taskId))
    .limit(1);
  if (!task?.creatorId) return;

  // Don't notify if the creator themselves moved it
  if (task.creatorId === opts.actorId) return;

  const actorName = await recipientName(opts.actorId);
  const emoji =
    opts.newStatus === "done" ? "✅" : opts.newStatus === "blocked" ? "🚧" : "🛑";

  await notify({
    recipientId: task.creatorId,
    kind: `task_${opts.newStatus}`,
    title: `${emoji} ${actorName} marked ${opts.newStatus}: ${opts.taskTitle.slice(0, 80)}`,
    body: opts.newStatus === "blocked" ? "The assignee says they're blocked. Likely needs your input." : "",
    link: `/admin/tasks/${opts.taskId}`,
  });
}
