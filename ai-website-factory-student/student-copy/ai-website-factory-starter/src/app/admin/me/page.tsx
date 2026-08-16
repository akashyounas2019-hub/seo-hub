import Link from "next/link";
import { aliasedTable, and, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import {
  notifications,
  sites,
  siteUsers,
  taskComments,
  tasks,
  users,
} from "@/db/schema";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pill, Row, RowList, StatusDot } from "@/components/ui/Row";
import { Sparkline } from "@/components/ui/Sparkline";
import { Stat, StatStrip } from "@/components/ui/Stat";
import { getVisibility } from "@/lib/permissions";
import { requireUser } from "@/lib/server-auth";
import { formatRelative } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function MePage() {
  await ensureSchema();
  const user = await requireUser();
  const visibility = await getVisibility(user);
  const d = db();

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const myTasks = await d
    .select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      priority: tasks.priority,
      dueAt: tasks.dueAt,
      siteSlug: sites.slug,
      siteDomain: sites.domain,
    })
    .from(tasks)
    .innerJoin(sites, eq(sites.id, tasks.siteId))
    .where(
      and(
        eq(tasks.assigneeId, user.id),
        sql`${tasks.status} not in ('done','cancelled')`,
      ),
    );

  const overdue = myTasks.filter((t) => t.dueAt && t.dueAt < new Date());
  const dueToday = myTasks.filter(
    (t) =>
      t.dueAt &&
      t.dueAt >= todayStart &&
      t.dueAt.getTime() - todayStart.getTime() < 24 * 60 * 60 * 1000,
  );
  const otherOpen = myTasks.filter((t) => !overdue.includes(t) && !dueToday.includes(t));

  const myTaskIds = myTasks.map((t) => t.id);
  const commentAuthor = aliasedTable(users, "comment_author");
  const recentComments = myTaskIds.length
    ? await d
        .select({
          id: taskComments.id,
          body: taskComments.body,
          createdAt: taskComments.createdAt,
          authorEmail: commentAuthor.email,
          taskId: taskComments.taskId,
          taskTitle: tasks.title,
        })
        .from(taskComments)
        .innerJoin(tasks, eq(tasks.id, taskComments.taskId))
        .leftJoin(commentAuthor, eq(commentAuthor.id, taskComments.authorId))
        .where(
          and(
            inArray(taskComments.taskId, myTaskIds),
            sql`${taskComments.authorId} is distinct from ${user.id}`,
          ),
        )
        .orderBy(desc(taskComments.createdAt))
        .limit(8)
    : [];

  const [unread] = await d
    .select({ n: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.recipientId, user.id), sql`${notifications.readAt} is null`));

  const mySites =
    visibility.kind === "all"
      ? await d.select({ slug: sites.slug, name: sites.name, city: sites.city, domain: sites.domain }).from(sites).orderBy(sites.slug)
      : visibility.siteIds.length
        ? await d
            .select({ slug: sites.slug, name: sites.name, city: sites.city, domain: sites.domain })
            .from(sites)
            .where(inArray(sites.id, visibility.siteIds))
            .orderBy(sites.slug)
        : [];


  let myTeam: { userId: string; email: string; role: string; openTaskCount: number; overdueCount: number }[] = [];
  if (user.role === "manager" && visibility.kind === "scoped" && visibility.siteIds.length) {
    const rows = await d
      .selectDistinct({ userId: users.id, email: users.email, role: users.role })
      .from(users)
      .innerJoin(siteUsers, eq(siteUsers.userId, users.id))
      .where(
        and(
          inArray(siteUsers.siteId, visibility.siteIds),
          sql`${users.id} is distinct from ${user.id}`,
        ),
      );
    const userIds = rows.map((r) => r.userId);
    if (userIds.length) {
      const counts = await d
        .select({
          assigneeId: tasks.assigneeId,
          openTaskCount: sql<number>`count(*) filter (where ${tasks.status} not in ('done','cancelled'))::int`,
          overdueCount: sql<number>`count(*) filter (where ${tasks.status} not in ('done','cancelled') and ${tasks.dueAt} < now())::int`,
        })
        .from(tasks)
        .where(and(inArray(tasks.assigneeId, userIds), isNotNull(tasks.assigneeId)))
        .groupBy(tasks.assigneeId);
      const countMap = new Map(counts.map((c) => [c.assigneeId, c]));
      myTeam = rows.map((r) => ({
        userId: r.userId,
        email: r.email,
        role: r.role,
        openTaskCount: countMap.get(r.userId)?.openTaskCount ?? 0,
        overdueCount: countMap.get(r.userId)?.overdueCount ?? 0,
      }));
    }
  }

  // 14-day "tasks I completed" sparkline + total
  const since14d = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  since14d.setHours(0, 0, 0, 0);
  const completedRows = await d
    .select({
      day: sql<string>`to_char(date_trunc('day', ${tasks.completedAt}), 'YYYY-MM-DD')`,
      n: sql<number>`count(*)::int`,
    })
    .from(tasks)
    .where(
      and(
        eq(tasks.assigneeId, user.id),
        eq(tasks.status, "done"),
        gte(tasks.completedAt, since14d),
      ),
    )
    .groupBy(sql`date_trunc('day', ${tasks.completedAt})`);
  const lastNDays = (n: number): string[] => {
    const out: string[] = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      d.setHours(0, 0, 0, 0);
      out.push(d.toISOString().slice(0, 10));
    }
    return out;
  };
  const completedMap = new Map(completedRows.map((r) => [r.day, r.n]));
  const sparkCompleted = lastNDays(14).map((d) => completedMap.get(d) ?? 0);
  const completed14d = sparkCompleted.reduce((s, n) => s + n, 0);

  const firstName = (user.name ?? user.email.split("@")[0]).split(" ")[0];

  return (
    <div className="space-y-7">
      <header>
        <h1 className="">
          Hey {firstName}
        </h1>
        <p className="mt-1.5 text-xs sm:text-sm text-text-muted">
          {overdue.length > 0
            ? `You have ${overdue.length} overdue task${overdue.length === 1 ? "" : "s"} — start here.`
            : dueToday.length > 0
              ? `${dueToday.length} task${dueToday.length === 1 ? "" : "s"} due today.`
              : myTasks.length > 0
                ? "Nothing overdue. Open tasks below."
                : "You're caught up."}
        </p>
      </header>

      <StatStrip columns={4}>
        <Stat label="Overdue" value={overdue.length} tone={overdue.length > 0 ? "danger" : "neutral"} />
        <Stat label="Due today" value={dueToday.length} tone={dueToday.length > 0 ? "warning" : "neutral"} />
        <Stat
          label="Done · 14 days"
          value={completed14d}
          tone={completed14d > 0 ? "accent" : "neutral"}
          sparkline={<Sparkline data={sparkCompleted} stroke="var(--accent)" />}
        />
        <Stat
          label="Notifications"
          value={unread?.n ?? 0}
          tone={(unread?.n ?? 0) > 0 ? "accent" : "neutral"}
          href="/admin/notifications"
        />
      </StatStrip>

      {overdue.length > 0 ? (
        <RowList title="Overdue" count={overdue.length}>
          {overdue.map((t) => (
            <Row key={t.id} href={`/admin/tasks/${t.id}`}>
              <StatusDot tone="danger" />
              <span className="min-w-0 flex-1 truncate text-sm text-text">{t.title}</span>
              <span className="hidden font-mono text-xs text-text-faint sm:inline">{t.siteDomain}</span>
              <Pill tone={t.priority === "urgent" ? "danger" : t.priority === "high" ? "warning" : "neutral"}>
                {t.priority}
              </Pill>
              {t.dueAt ? (
                <span className="tnum w-20 shrink-0 text-right text-xs text-danger sm:w-24">
                  {formatRelative(t.dueAt)}
                </span>
              ) : null}
            </Row>
          ))}
        </RowList>
      ) : null}

      {dueToday.length > 0 ? (
        <RowList title="Due today" count={dueToday.length}>
          {dueToday.map((t) => (
            <Row key={t.id} href={`/admin/tasks/${t.id}`}>
              <StatusDot tone="warning" />
              <span className="min-w-0 flex-1 truncate text-sm text-text">{t.title}</span>
              <span className="hidden font-mono text-xs text-text-faint sm:inline">{t.siteDomain}</span>
              <Pill tone={t.priority === "urgent" ? "danger" : t.priority === "high" ? "warning" : "neutral"}>
                {t.priority}
              </Pill>
            </Row>
          ))}
        </RowList>
      ) : null}

      {otherOpen.length > 0 ? (
        <RowList title="Other open tasks" count={otherOpen.length}>
          {otherOpen.map((t) => (
            <Row key={t.id} href={`/admin/tasks/${t.id}`}>
              <StatusDot tone="neutral" />
              <span className="min-w-0 flex-1 truncate text-sm text-text">{t.title}</span>
              <span className="hidden font-mono text-xs text-text-faint sm:inline">{t.siteDomain}</span>
              <Pill tone={t.priority === "urgent" ? "danger" : t.priority === "high" ? "warning" : "neutral"}>
                {t.priority}
              </Pill>
              {t.dueAt ? (
                <span className="tnum w-16 shrink-0 text-right text-xs text-text-faint sm:w-20">
                  {formatRelative(t.dueAt)}
                </span>
              ) : null}
            </Row>
          ))}
        </RowList>
      ) : null}

      {myTasks.length === 0 ? (
        <EmptyState
          glyph="tasks"
          title="No tasks assigned to you"
          description="Your manager will assign work — you'll get a notification when they do. In the meantime, check the sites you're on or chat with the assistant."
        />
      ) : null}

      {recentComments.length > 0 ? (
        <RowList title="Recent comments on your tasks" count={recentComments.length}>
          {recentComments.map((c) => (
            <Row key={c.id} href={`/admin/tasks/${c.taskId}#comments`}>
              <StatusDot tone="info" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-text">
                  <span className="font-mono text-text-faint">{c.authorEmail ?? "someone"}</span> on{" "}
                  <span className="text-text-muted">{c.taskTitle}</span>
                </div>
                <div className="truncate text-xs text-text-faint">{c.body}</div>
              </div>
              <span className="tnum text-xs text-text-faint">{formatRelative(c.createdAt)}</span>
            </Row>
          ))}
        </RowList>
      ) : null}

      {user.role === "manager" && myTeam.length > 0 ? (
        <RowList title="Your team" count={myTeam.length}>
          {myTeam.map((t) => (
            <Row key={t.userId} href={`/admin/users/${t.userId}`}>
              <StatusDot tone={t.overdueCount > 0 ? "warning" : "success"} />
              <span className="flex-1 truncate font-mono text-xs text-text">{t.email}</span>
              <span className="text-xs text-text-faint">{t.role}</span>
              <span className="tnum w-20 text-right text-xs text-text-muted">
                {t.openTaskCount} open
              </span>
              <span
                className={`tnum w-24 text-right text-xs ${
                  t.overdueCount > 0 ? "text-danger" : "text-text-faint"
                }`}
              >
                {t.overdueCount} overdue
              </span>
            </Row>
          ))}
        </RowList>
      ) : null}

      {mySites.length > 0 ? (
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-text-faint">
            Your sites ({mySites.length})
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {mySites.map((s) => (
              <Link
                key={s.slug}
                href={`/admin/sites/${s.slug}`}
                className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-2.5 py-1 text-xs transition-colors hover:border-border-strong hover:bg-surface-2"
              >
                <StatusDot tone="success" />
                <span className="font-mono text-text">{s.domain}</span>
                {s.city ? <span className="text-text-faint">{s.city}</span> : null}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {user.role === "admin" ? (
        <div className="rounded-md border border-accent/30 bg-accent-tint p-4 text-xs text-text-muted">
          You&apos;re an admin — the connected-sites view lives at{" "}
          <Link href="/admin/sites" className="text-accent hover:underline">
            /admin/sites
          </Link>
          .
        </div>
      ) : null}
    </div>
  );
}
