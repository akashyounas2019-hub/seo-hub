import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { sessions, taskComments, tasks, users } from "@/db/schema";

/**
 * Presence buckets (driven by `sessions.lastSeenAt`, which is updated on every
 * authenticated request — see src/lib/auth.ts).
 *
 * - "online": last seen in the last 5 minutes (actively using the dashboard)
 * - "today":  last seen since midnight local time
 * - "week":   last seen within the last 7 days
 * - "dormant": last seen more than 7 days ago
 * - "never":  no session has ever been recorded
 */
export type Presence = "online" | "today" | "week" | "dormant" | "never";

export interface FocusItem {
  kind: "task" | "comment" | "idle" | "never";
  label: string;
  detail?: string;
  href?: string;
  at?: Date;
}

export interface TeamMemberPresence {
  id: string;
  email: string;
  name: string | null;
  role: "admin" | "manager" | "student";
  lastSeenAt: Date | null;
  presence: Presence;
  focus: FocusItem;
  tasksDoneToday: number;
  tasksOpen: number;
  tasksOverdue: number;
}

export function classifyPresence(lastSeenAt: Date | string | null, now: Date = new Date()): Presence {
  if (!lastSeenAt) return "never";
  // Raw-SQL aggregates (max(...)) come back as strings under some drivers;
  // normalize to a Date.
  const seen = lastSeenAt instanceof Date ? lastSeenAt : new Date(lastSeenAt);
  if (isNaN(seen.getTime())) return "never";
  const ageMs = now.getTime() - seen.getTime();
  if (ageMs < 5 * 60 * 1000) return "online";
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  if (seen >= startOfDay) return "today";
  if (ageMs < 7 * 24 * 60 * 60 * 1000) return "week";
  return "dormant";
}

export function presenceTone(p: Presence): "success" | "accent" | "neutral" | "warning" | "info" {
  switch (p) {
    case "online":
      return "success";
    case "today":
      return "accent";
    case "week":
      return "neutral";
    case "dormant":
      return "warning";
    case "never":
      return "neutral";
  }
}

export function presenceLabel(p: Presence, lastSeenAt: Date | string | null): string {
  if (p === "never") return "Never signed in";
  if (p === "online") return "Online now";
  if (!lastSeenAt) return "Unknown";
  const seen = lastSeenAt instanceof Date ? lastSeenAt : new Date(lastSeenAt);
  if (isNaN(seen.getTime())) return "Unknown";
  return relative(seen);
}

function relative(d: Date, now: Date = new Date()): string {
  const ms = now.getTime() - d.getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

/**
 * Returns presence + current focus + task stats for the whole team.
 * Excludes the org admin if `excludeUserId` is provided (so a user's own row
 * doesn't show up in the "team" view).
 */
export async function getTeamPresence(opts: { excludeUserId?: string } = {}): Promise<TeamMemberPresence[]> {
  const d = db();
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  // Step 1: most recent session per user (only non-expired)
  const sessionRows = await d
    .select({
      userId: sessions.userId,
      lastSeenAt: sql<Date | string>`max(${sessions.lastSeenAt})`.as("last_seen_at"),
    })
    .from(sessions)
    .where(gte(sessions.expiresAt, now))
    .groupBy(sessions.userId);
  // Coerce raw-SQL aggregate result to Date.
  const lastSeenByUser = new Map<string, Date>(
    sessionRows
      .filter((r) => r.lastSeenAt != null)
      .map((r) => [r.userId, r.lastSeenAt instanceof Date ? r.lastSeenAt : new Date(r.lastSeenAt as string)]),
  );

  // Step 2: all users
  const userRows = await d
    .select({ id: users.id, email: users.email, name: users.name, role: users.role, lastLoginAt: users.lastLoginAt })
    .from(users)
    .orderBy(users.email);

  const filteredUsers = opts.excludeUserId ? userRows.filter((u) => u.id !== opts.excludeUserId) : userRows;
  const userIds = filteredUsers.map((u) => u.id);
  if (userIds.length === 0) return [];

  // Step 3: per-user task stats
  const taskStats = await d
    .select({
      userId: tasks.assigneeId,
      doneToday: sql<number>`count(*) filter (where ${tasks.status} = 'done' and ${tasks.completedAt} >= ${todayStart.toISOString()}::timestamptz)::int`,
      open: sql<number>`count(*) filter (where ${tasks.status} not in ('done','cancelled'))::int`,
      overdue: sql<number>`count(*) filter (where ${tasks.status} not in ('done','cancelled') and ${tasks.dueAt} < now())::int`,
    })
    .from(tasks)
    .where(inArray(tasks.assigneeId, userIds))
    .groupBy(tasks.assigneeId);
  const statsByUser = new Map(taskStats.map((s) => [s.userId as string, s]));

  // Step 4: most recent in-progress task per user (updated in last hour)
  const recentInProgress = await d
    .select({
      assigneeId: tasks.assigneeId,
      id: tasks.id,
      title: tasks.title,
      updatedAt: tasks.updatedAt,
    })
    .from(tasks)
    .where(
      and(
        inArray(tasks.assigneeId, userIds),
        eq(tasks.status, "in_progress"),
        gte(tasks.updatedAt, hourAgo),
      ),
    )
    .orderBy(desc(tasks.updatedAt));
  const inProgressByUser = new Map<string, (typeof recentInProgress)[number]>();
  for (const row of recentInProgress) {
    if (row.assigneeId && !inProgressByUser.has(row.assigneeId)) {
      inProgressByUser.set(row.assigneeId, row);
    }
  }

  // Step 5: most recent task comment per user (within last hour)
  const recentComments = await d
    .select({
      authorId: taskComments.authorId,
      taskId: taskComments.taskId,
      taskTitle: tasks.title,
      body: taskComments.body,
      createdAt: taskComments.createdAt,
    })
    .from(taskComments)
    .innerJoin(tasks, eq(tasks.id, taskComments.taskId))
    .where(and(inArray(taskComments.authorId, userIds), gte(taskComments.createdAt, hourAgo)))
    .orderBy(desc(taskComments.createdAt));
  const commentByUser = new Map<string, (typeof recentComments)[number]>();
  for (const row of recentComments) {
    if (row.authorId && !commentByUser.has(row.authorId)) {
      commentByUser.set(row.authorId, row);
    }
  }

  // Step 6: stitch everything together
  const out: TeamMemberPresence[] = filteredUsers.map((u) => {
    const lastSeenAt = lastSeenByUser.get(u.id) ?? u.lastLoginAt ?? null;
    const presence = classifyPresence(lastSeenAt, now);
    const inProg = inProgressByUser.get(u.id);
    const comment = commentByUser.get(u.id);

    let focus: FocusItem;
    if (presence === "never") {
      focus = { kind: "never", label: "Hasn't signed in yet" };
    } else if (inProg) {
      focus = {
        kind: "task",
        label: "Working on",
        detail: inProg.title,
        href: `/admin/tasks/${inProg.id}`,
        at: inProg.updatedAt,
      };
    } else if (comment) {
      focus = {
        kind: "comment",
        label: "Commented on",
        detail: comment.taskTitle,
        href: `/admin/tasks/${comment.taskId}`,
        at: comment.createdAt,
      };
    } else if (presence === "online") {
      focus = { kind: "idle", label: "Browsing the dashboard" };
    } else {
      focus = { kind: "idle", label: presenceLabel(presence, lastSeenAt) };
    }

    const stats = statsByUser.get(u.id);
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      lastSeenAt,
      presence,
      focus,
      tasksDoneToday: stats?.doneToday ?? 0,
      tasksOpen: stats?.open ?? 0,
      tasksOverdue: stats?.overdue ?? 0,
    };
  });

  // Sort: online first, then today, then by lastSeenAt desc
  const order: Record<Presence, number> = { online: 0, today: 1, week: 2, dormant: 3, never: 4 };
  out.sort((a, b) => {
    const o = order[a.presence] - order[b.presence];
    if (o !== 0) return o;
    return (b.lastSeenAt?.getTime() ?? 0) - (a.lastSeenAt?.getTime() ?? 0);
  });
  return out;
}

/**
 * Per-user presence (for the profile page).
 */
export async function getUserPresence(userId: string): Promise<{
  lastSeenAt: Date | null;
  presence: Presence;
  activeSessions: number;
}> {
  const d = db();
  const now = new Date();
  const rows = await d
    .select({
      lastSeenAt: sessions.lastSeenAt,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), gte(sessions.expiresAt, now)))
    .orderBy(desc(sessions.lastSeenAt));
  const lastSeenAt = rows[0]?.lastSeenAt ?? null;
  return {
    lastSeenAt,
    presence: classifyPresence(lastSeenAt, now),
    activeSessions: rows.length,
  };
}

// ============================================================================
// Activity feed
// ============================================================================

export type ActivityItem =
  | { kind: "task_completed"; at: Date; actor: { id: string; email: string; name: string | null } | null; taskId: string; taskTitle: string; siteSlug: string | null }
  | { kind: "task_started"; at: Date; actor: { id: string; email: string; name: string | null } | null; taskId: string; taskTitle: string; siteSlug: string | null }
  | { kind: "task_comment"; at: Date; actor: { id: string; email: string; name: string | null } | null; taskId: string; taskTitle: string; siteSlug: string | null; body: string };

/**
 * Returns the last `limit` activity items (across all users by default,
 * or scoped to a single user if `userId` is provided), most recent first.
 *
 * Mixes task completions, status moves to in_progress, and task comments.
 */
export async function getActivityFeed(opts: { userId?: string; limit?: number; since?: Date } = {}): Promise<ActivityItem[]> {
  const d = db();
  const limit = opts.limit ?? 30;
  const since = opts.since ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // Pull a larger set from each source then merge + sort + cap.
  const sourceLimit = limit * 2;

  const userFilter = (col: ReturnType<typeof eq>) => (opts.userId ? and(col, eq(col, opts.userId)) : col);
  // We'll build per-query where clauses inline because Drizzle doesn't compose ad-hoc well.

  // Completions
  const completedWhere = opts.userId
    ? and(eq(tasks.status, "done"), gte(tasks.completedAt, since), eq(tasks.assigneeId, opts.userId))
    : and(eq(tasks.status, "done"), gte(tasks.completedAt, since));
  const completed = await d
    .select({
      taskId: tasks.id,
      taskTitle: tasks.title,
      at: tasks.completedAt,
      assigneeId: tasks.assigneeId,
      assigneeEmail: users.email,
      assigneeName: users.name,
      siteSlug: sql<string | null>`(select slug from sites where sites.id = ${tasks.siteId})`,
    })
    .from(tasks)
    .leftJoin(users, eq(users.id, tasks.assigneeId))
    .where(completedWhere)
    .orderBy(desc(tasks.completedAt))
    .limit(sourceLimit);

  // Started (in_progress, updated since `since`)
  const startedWhere = opts.userId
    ? and(eq(tasks.status, "in_progress"), gte(tasks.updatedAt, since), eq(tasks.assigneeId, opts.userId))
    : and(eq(tasks.status, "in_progress"), gte(tasks.updatedAt, since));
  const started = await d
    .select({
      taskId: tasks.id,
      taskTitle: tasks.title,
      at: tasks.updatedAt,
      assigneeId: tasks.assigneeId,
      assigneeEmail: users.email,
      assigneeName: users.name,
      siteSlug: sql<string | null>`(select slug from sites where sites.id = ${tasks.siteId})`,
    })
    .from(tasks)
    .leftJoin(users, eq(users.id, tasks.assigneeId))
    .where(startedWhere)
    .orderBy(desc(tasks.updatedAt))
    .limit(sourceLimit);

  // Comments
  const commentsWhere = opts.userId
    ? and(gte(taskComments.createdAt, since), eq(taskComments.authorId, opts.userId))
    : gte(taskComments.createdAt, since);
  const comments = await d
    .select({
      taskId: tasks.id,
      taskTitle: tasks.title,
      at: taskComments.createdAt,
      authorId: taskComments.authorId,
      authorEmail: users.email,
      authorName: users.name,
      body: taskComments.body,
      siteSlug: sql<string | null>`(select slug from sites where sites.id = ${tasks.siteId})`,
    })
    .from(taskComments)
    .innerJoin(tasks, eq(tasks.id, taskComments.taskId))
    .leftJoin(users, eq(users.id, taskComments.authorId))
    .where(commentsWhere)
    .orderBy(desc(taskComments.createdAt))
    .limit(sourceLimit);

  const items: ActivityItem[] = [
    ...completed
      .filter((r) => r.at)
      .map<ActivityItem>((r) => ({
        kind: "task_completed" as const,
        at: r.at as Date,
        actor: r.assigneeId ? { id: r.assigneeId, email: r.assigneeEmail ?? "", name: r.assigneeName } : null,
        taskId: r.taskId,
        taskTitle: r.taskTitle,
        siteSlug: r.siteSlug,
      })),
    ...started.map<ActivityItem>((r) => ({
      kind: "task_started" as const,
      at: r.at,
      actor: r.assigneeId ? { id: r.assigneeId, email: r.assigneeEmail ?? "", name: r.assigneeName } : null,
      taskId: r.taskId,
      taskTitle: r.taskTitle,
      siteSlug: r.siteSlug,
    })),
    ...comments.map<ActivityItem>((r) => ({
      kind: "task_comment" as const,
      at: r.at,
      actor: r.authorId ? { id: r.authorId, email: r.authorEmail ?? "", name: r.authorName } : null,
      taskId: r.taskId,
      taskTitle: r.taskTitle,
      siteSlug: r.siteSlug,
      body: r.body,
    })),
  ];

  items.sort((a, b) => b.at.getTime() - a.at.getTime());
  return items.slice(0, limit);
}
