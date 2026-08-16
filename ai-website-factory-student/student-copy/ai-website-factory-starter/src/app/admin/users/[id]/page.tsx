import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, gte, notInArray, sql } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { desktopSessions, sites, siteUsers, taskAudits, taskComments, tasks, users } from "@/db/schema";
import {
  assignSiteAction,
  resetPasswordAction,
  unassignSiteAction,
  updateUserAction,
} from "@/app/actions/users";
import { ActivityFeed } from "@/components/ui/ActivityFeed";
import { AutoRefresh } from "@/components/ui/AutoRefresh";
import { AvatarWithDot } from "@/components/ui/Avatar";
import { IconAlertTriangle } from "@/components/ui/Icon";
import { Pill, Row, RowList, StatusDot } from "@/components/ui/Row";
import { Sparkline } from "@/components/ui/Sparkline";
import { Stat, StatStrip } from "@/components/ui/Stat";
import {
  classifyPresence,
  getActivityFeed,
  getUserPresence,
  presenceLabel,
  presenceTone,
} from "@/lib/presence";
import { requireAdmin } from "@/lib/server-auth";
import { formatRelative } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function UserDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { ok?: string; error?: string };
}) {
  await ensureSchema();
  const me = await requireAdmin();
  const d = db();

  const [user] = await d.select().from(users).where(eq(users.id, params.id)).limit(1);
  if (!user) notFound();

  // ===== Presence =====
  const { lastSeenAt, presence, activeSessions } = await getUserPresence(user.id);
  const tone = presenceTone(presence);
  const isOnline = presence === "online";

  // ===== Site assignments =====
  const assignments = await d
    .select({
      siteId: siteUsers.siteId,
      role: siteUsers.role,
      slug: sites.slug,
      name: sites.name,
      domain: sites.domain,
      city: sites.city,
    })
    .from(siteUsers)
    .innerJoin(sites, eq(sites.id, siteUsers.siteId))
    .where(eq(siteUsers.userId, user.id))
    .orderBy(sites.slug);

  const assignedIds = assignments.map((a) => a.siteId);
  const unassigned = await d
    .select({ id: sites.id, slug: sites.slug, name: sites.name, city: sites.city })
    .from(sites)
    .where(assignedIds.length ? notInArray(sites.id, assignedIds) : undefined)
    .orderBy(sites.slug);

  // ===== Performance metrics =====
  const last30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const last7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [taskCounts] = await d
    .select({
      assigned: sql<number>`count(*) filter (where ${tasks.assigneeId} = ${user.id})::int`,
      done: sql<number>`count(*) filter (where ${tasks.assigneeId} = ${user.id} and ${tasks.status} = 'done')::int`,
      doneLast7: sql<number>`count(*) filter (where ${tasks.assigneeId} = ${user.id} and ${tasks.status} = 'done' and ${tasks.completedAt} >= ${last7.toISOString()}::timestamptz)::int`,
      doneToday: sql<number>`count(*) filter (where ${tasks.assigneeId} = ${user.id} and ${tasks.status} = 'done' and ${tasks.completedAt} >= ${todayStart.toISOString()}::timestamptz)::int`,
      open: sql<number>`count(*) filter (where ${tasks.assigneeId} = ${user.id} and ${tasks.status} not in ('done','cancelled'))::int`,
      overdue: sql<number>`count(*) filter (where ${tasks.assigneeId} = ${user.id} and ${tasks.status} not in ('done','cancelled') and ${tasks.dueAt} < now())::int`,
      doneLast30: sql<number>`count(*) filter (where ${tasks.assigneeId} = ${user.id} and ${tasks.status} = 'done' and ${tasks.completedAt} >= ${last30.toISOString()}::timestamptz)::int`,
      inProgress: sql<number>`count(*) filter (where ${tasks.assigneeId} = ${user.id} and ${tasks.status} = 'in_progress')::int`,
    })
    .from(tasks);

  // Audit verdict mix (last 30 days, on this user's tasks)
  const auditDistribution = await d
    .select({
      verdict: taskAudits.verdict,
      n: sql<number>`count(*)::int`,
    })
    .from(taskAudits)
    .innerJoin(tasks, eq(tasks.id, taskAudits.taskId))
    .where(and(eq(tasks.assigneeId, user.id), gte(taskAudits.runAt, last30)))
    .groupBy(taskAudits.verdict);

  const completionPct =
    (taskCounts?.assigned ?? 0) > 0
      ? Math.round(((taskCounts.done ?? 0) / (taskCounts.assigned ?? 1)) * 100)
      : null;

  const auditTotal = auditDistribution.reduce((s, r) => s + r.n, 0);
  const auditDone = auditDistribution.find((r) => r.verdict === "done")?.n ?? 0;
  const auditNoShow =
    (auditDistribution.find((r) => r.verdict === "no_show")?.n ?? 0) +
    (auditDistribution.find((r) => r.verdict === "not_started")?.n ?? 0);
  const auditPct = auditTotal > 0 ? Math.round((auditDone / auditTotal) * 100) : null;

  // ===== Current focus (in-progress tasks, freshest first) =====
  const currentFocus = await d
    .select({
      id: tasks.id,
      title: tasks.title,
      priority: tasks.priority,
      updatedAt: tasks.updatedAt,
      dueAt: tasks.dueAt,
      siteSlug: sites.slug,
    })
    .from(tasks)
    .innerJoin(sites, eq(sites.id, tasks.siteId))
    .where(and(eq(tasks.assigneeId, user.id), eq(tasks.status, "in_progress")))
    .orderBy(desc(tasks.updatedAt))
    .limit(5);

  // ===== 14-day completion sparkline =====
  const since14d = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  since14d.setHours(0, 0, 0, 0);
  const dailyDone = await d
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

  const sparkData = (() => {
    const m = new Map(dailyDone.map((r) => [r.day, r.n]));
    const out: number[] = [];
    for (let i = 13; i >= 0; i--) {
      const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      date.setHours(0, 0, 0, 0);
      out.push(m.get(date.toISOString().slice(0, 10)) ?? 0);
    }
    return out;
  })();

  // ===== Response time (last 30d): median time from task.createdAt to first task_comment by this user =====
  // For each task this user commented on, pick the earliest comment and compute the gap from
  // task.createdAt. We pull the rows raw and median in JS to stay portable across pglite/pg.
  const commentRows = await d
    .select({
      taskCreated: tasks.createdAt,
      firstComment: sql<Date>`min(${taskComments.createdAt})`,
    })
    .from(taskComments)
    .innerJoin(tasks, eq(tasks.id, taskComments.taskId))
    .where(and(eq(taskComments.authorId, user.id), gte(taskComments.createdAt, last30)))
    .groupBy(taskComments.taskId, tasks.createdAt);

  const responseSecs: number[] = commentRows
    .map((r) => {
      const first = new Date(r.firstComment as unknown as string | Date).getTime();
      const created = new Date(r.taskCreated as unknown as string | Date).getTime();
      return (first - created) / 1000;
    })
    .filter((n) => Number.isFinite(n) && n >= 0)
    .sort((a, b) => a - b);
  const medianResponseSecs =
    responseSecs.length === 0 ? null : responseSecs[Math.floor(responseSecs.length / 2)];

  // ===== On-time completion rate (last 30d) =====
  const [otRow] = await d
    .select({
      total: sql<number>`count(*) filter (where ${tasks.assigneeId} = ${user.id} and ${tasks.completedAt} is not null and ${tasks.completedAt} >= ${last30.toISOString()}::timestamptz)::int`,
      onTime: sql<number>`count(*) filter (where ${tasks.assigneeId} = ${user.id} and ${tasks.completedAt} is not null and ${tasks.completedAt} >= ${last30.toISOString()}::timestamptz and (${tasks.dueAt} is null or ${tasks.completedAt} <= ${tasks.dueAt}))::int`,
    })
    .from(tasks);
  const onTimePct =
    (otRow?.total ?? 0) > 0 ? Math.round(((otRow?.onTime ?? 0) / (otRow.total ?? 1)) * 100) : null;

  // ===== Desktop sessions summary (Phase 3 — wrapper app) =====
  // Surfaces the last time this worker signed into the GYL Desktop app, how
  // many sessions are currently active, and total session count over 30d.
  // Pulls a single row of stats — the timeline lives at /admin/desktop/[userId].
  const [desktopStats] = await d
    .select({
      total30d: sql<number>`count(*) filter (where ${desktopSessions.startedAt} >= ${last30.toISOString()}::timestamptz)::int`,
      activeNow: sql<number>`count(*) filter (where ${desktopSessions.endedAt} is null and ${desktopSessions.revoked} = false)::int`,
      lastSeenAt: sql<Date | null>`max(${desktopSessions.lastSeenAt})`,
    })
    .from(desktopSessions)
    .where(eq(desktopSessions.userId, user.id));
  const desktopTotal30d = desktopStats?.total30d ?? 0;
  const desktopActiveNow = desktopStats?.activeNow ?? 0;
  const desktopLastSeenAt = desktopStats?.lastSeenAt
    ? desktopStats.lastSeenAt instanceof Date
      ? desktopStats.lastSeenAt
      : new Date(desktopStats.lastSeenAt as unknown as string)
    : null;
  const hasDesktopHistory = desktopTotal30d > 0 || desktopActiveNow > 0;

  // ===== Activity feed (this user's last 30 events) =====
  const activity = await getActivityFeed({ userId: user.id, limit: 30, since: last30 });

  const isMe = user.id === me.id;

  return (
    <div className="space-y-6">
      {/* Live presence — refresh every 30s so the dot/last-seen stays current */}
      <AutoRefresh intervalMs={30_000} />

      <Link
        href="/admin/users"
        className="inline-flex items-center gap-1 text-xs text-text-faint hover:text-text-muted"
      >
        ← Users
      </Link>

      {/* ===== Profile header card ===== */}
      <section className="rounded-lg border border-border bg-surface p-5">
        <div className="flex flex-wrap items-start gap-4">
          <AvatarWithDot
            email={user.email}
            name={user.name}
            role={user.role}
            size="xl"
            tone={tone}
            pulse={isOnline}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-2">
              <h1 className="text-2xl font-medium tracking-tightish text-text">
                {user.name ?? user.email.split("@")[0]}
              </h1>
              <RoleBadge role={user.role} />
              {isMe ? (
                <span className="rounded-sm border border-border bg-surface-2 px-1.5 py-0.5 text-xs uppercase tracking-wider text-text-faint">
                  you
                </span>
              ) : null}
            </div>
            <p className="mt-1 truncate font-mono text-xs text-text-faint">
              {user.email}
            </p>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-text-muted">
              <PresenceLine
                tone={tone}
                pulse={isOnline}
                label={
                  presence === "never"
                    ? "Never signed in"
                    : `${isOnline ? "Online now" : "Last seen"}${
                        lastSeenAt && !isOnline ? ` · ${formatRelative(lastSeenAt)}` : ""
                      }`
                }
              />
              {activeSessions > 0 ? (
                <Stat2 label="Active sessions" value={activeSessions} />
              ) : null}
              <Stat2 label="Created" value={formatRelative(user.createdAt)} />
            </div>
          </div>
        </div>
      </section>

      {/* Flash */}
      {searchParams.ok ? <Flash kind="ok" msg={flashMsg(searchParams.ok)} /> : null}
      {searchParams.error ? <Flash kind="error" msg={flashMsg(searchParams.error)} /> : null}

      {/* ===== Activity stats ===== */}
      <StatStrip columns={4}>
        <Stat label="Done · today" value={taskCounts?.doneToday ?? 0} tone={(taskCounts?.doneToday ?? 0) > 0 ? "success" : "neutral"} />
        <Stat
          label="Done · 14 days"
          value={taskCounts?.doneLast7 ?? 0}
          sparkline={<Sparkline data={sparkData} stroke="var(--success)" />}
        />
        <Stat
          label="Currently open"
          value={taskCounts?.open ?? 0}
          tone={(taskCounts?.overdue ?? 0) > 0 ? "warning" : (taskCounts?.open ?? 0) > 0 ? "info" : "neutral"}
        />
        <Stat
          label="Overdue"
          value={taskCounts?.overdue ?? 0}
          tone={(taskCounts?.overdue ?? 0) > 0 ? "danger" : "neutral"}
        />
      </StatStrip>

      {/* ===== Cadence stats (M9) ===== */}
      <StatStrip columns={2}>
        <Stat
          label="Avg response · 30d"
          value={medianResponseSecs == null ? "—" : formatDuration(medianResponseSecs)}
          tone={medianResponseSecs == null ? "neutral" : medianResponseSecs < 24 * 3600 ? "success" : "warning"}
        />
        <Stat
          label="On-time completion · 30d"
          value={onTimePct == null ? "—" : `${onTimePct}%`}
          tone={
            onTimePct == null
              ? "neutral"
              : onTimePct >= 80
                ? "success"
                : onTimePct >= 50
                  ? "warning"
                  : "danger"
          }
        />
      </StatStrip>

      {/* ===== Current focus & activity (two-col on lg) ===== */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        <section className="rounded-lg border border-border bg-surface">
          <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-text-muted">
              Currently working on
            </h2>
            <span className="tnum text-xs text-text-faint">
              {currentFocus.length} in progress
            </span>
          </header>
          {currentFocus.length === 0 ? (
            <div className="px-4 py-10 text-center text-xs text-text-faint">
              No tasks in progress right now.
            </div>
          ) : (
            <ul role="list" className="divide-y divide-border">
              {currentFocus.map((t) => (
                <li key={t.id}>
                  <Link
                    href={`/admin/tasks/${t.id}`}
                    className="block px-4 py-3 transition-colors hover:bg-surface-2"
                  >
                    <div className="flex items-baseline gap-2">
                      <StatusDot tone="info" />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-text">
                        {t.title}
                      </span>
                      <Pill
                        tone={
                          t.priority === "urgent"
                            ? "danger"
                            : t.priority === "high"
                              ? "warning"
                              : "neutral"
                        }
                      >
                        <span className="text-xs">{t.priority}</span>
                      </Pill>
                    </div>
                    <div className="mt-1 ml-4 flex items-center gap-2 text-xs text-text-faint">
                      <span className="font-mono">{t.siteSlug}</span>
                      <span>·</span>
                      <span>updated {formatRelative(t.updatedAt)}</span>
                      {t.dueAt ? (
                        <>
                          <span>·</span>
                          <span className={t.dueAt < new Date() ? "text-danger" : ""}>
                            due {formatRelative(t.dueAt)}
                          </span>
                        </>
                      ) : null}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <ActivityFeed
          items={activity}
          title="Activity timeline · 30 days"
          emptyHint="No activity in the last 30 days. Once they complete tasks or comment, it'll show here."
        />
      </div>

      {/* ===== Desktop sessions (Phase 3) =====
        Shown only when the user has actually used the Desktop app — keeps the
        section clean for users who never installed it. */}
      {hasDesktopHistory ? (
        <Link
          href={`/admin/desktop/${user.id}`}
          className="block rounded-lg border border-border bg-surface p-5 transition-shadow hover:shadow-sm"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-text-muted">
                Desktop activity
              </h2>
              <p className="mt-1 text-xs text-text-faint">
                Activity timeline, screen recordings, and WP-admin grants live in the Desktop view.
              </p>
            </div>
            <span className="text-xs font-medium text-accent">View timeline →</span>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-4">
            <div>
              <div className="text-2xl font-semibold tabular-nums text-text">{desktopActiveNow}</div>
              <div className="mt-0.5 text-xs uppercase tracking-wide text-text-faint">
                Active sessions
              </div>
            </div>
            <div>
              <div className="text-2xl font-semibold tabular-nums text-text">{desktopTotal30d}</div>
              <div className="mt-0.5 text-xs uppercase tracking-wide text-text-faint">
                Sessions · 30d
              </div>
            </div>
            <div>
              <div className="text-sm font-medium text-text">
                {desktopLastSeenAt ? formatRelative(desktopLastSeenAt) : "Never"}
              </div>
              <div className="mt-0.5 text-xs uppercase tracking-wide text-text-faint">
                Last Desktop ping
              </div>
            </div>
          </div>
        </Link>
      ) : null}

      {/* ===== AI audit mix (only if data exists) ===== */}
      {auditTotal > 0 ? (
        <section className="rounded-lg border border-border bg-surface p-5">
          <header className="flex items-baseline justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-text-muted">
              AI audit verdicts · last 30 days
            </h2>
            <span className="tnum text-xs text-text-faint">
              {auditPct}% verified done
            </span>
          </header>
          <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-surface-2">
            {auditDistribution.map((v) => {
              const pct = Math.round((v.n / auditTotal) * 100);
              const c =
                v.verdict === "done"
                  ? "bg-success"
                  : v.verdict === "partial"
                    ? "bg-warning"
                    : v.verdict === "no_show" || v.verdict === "not_started"
                      ? "bg-danger"
                      : "bg-text-faint/30";
              return (
                <div
                  key={v.verdict}
                  className={c}
                  style={{ width: `${pct}%` }}
                  title={`${v.verdict}: ${v.n}`}
                />
              );
            })}
          </div>
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-text-faint">
            {auditDistribution.map((v) => (
              <span key={v.verdict}>
                <span className="font-mono">{v.verdict.replace("_", " ")}</span>: {v.n}
              </span>
            ))}
          </div>
          {auditNoShow > 0 ? (
            <p className="mt-3 inline-flex items-start gap-1.5 text-xs text-danger">
              <IconAlertTriangle size={13} className="mt-px shrink-0" />
              <span>
                {auditNoShow} no-show or not-started verdict{auditNoShow === 1 ? "" : "s"} in the last
                30 days. Worth a check-in.
              </span>
            </p>
          ) : null}
        </section>
      ) : null}

      {/* ===== Profile + Reset password (two-col) ===== */}
      <section className="grid gap-5 md:grid-cols-2">
        <form
          action={updateUserAction.bind(null, user.id)}
          className="rounded-lg border border-border bg-surface p-5"
        >
          <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-text-muted">
            Profile
          </h2>
          <div className="mt-3 space-y-3">
            <Field label="Name">
              <input
                name="name"
                defaultValue={user.name ?? ""}
                className="w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
              />
            </Field>
            <Field
              label="Role"
              hint={isMe ? "You can't change your own role." : undefined}
            >
              <select
                name="role"
                defaultValue={user.role}
                disabled={isMe}
                className="w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text outline-none disabled:opacity-60 focus:border-accent focus:ring-2 focus:ring-accent/20"
              >
                <option value="student">student</option>
                <option value="manager">manager</option>
                <option value="admin">admin</option>
              </select>
            </Field>
          </div>
          <button
            type="submit"
            className="mt-4 rounded-md bg-accent px-2.5 py-1.5 text-xs font-medium text-brand-navy-deep shadow-xs hover:bg-accent-hover"
          >
            Save
          </button>
        </form>

        <form
          action={resetPasswordAction.bind(null, user.id)}
          className="rounded-lg border border-border bg-surface p-5"
        >
          <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-text-muted">
            Reset password
          </h2>
          <div className="mt-3">
            <Field
              label="New password (8+ chars)"
              hint="All existing sessions for this user will be revoked."
            >
              <input
                name="password"
                type="text"
                autoComplete="off"
                className="w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
              />
            </Field>
          </div>
          <button
            type="submit"
            className="mt-4 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-text hover:bg-surface-2"
          >
            Reset
          </button>
        </form>
      </section>

      {/* ===== Site assignments ===== */}
      <section className="rounded-lg border border-border bg-surface">
        <header className="flex items-baseline justify-between border-b border-border px-4 py-2.5">
          <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-text-muted">
            Site assignments
          </h2>
          <span className="tnum text-xs text-text-faint">{assignments.length}</span>
        </header>
        {assignments.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-text-faint">
            Not assigned to any site yet. Use the form below to add one.
          </div>
        ) : (
          <RowList footer={undefined}>
            {assignments.map((a) => (
              <Row key={a.siteId} href={`/admin/sites/${a.slug}`}>
                <StatusDot tone={a.role === "manager" ? "warning" : "info"} />
                <span className="min-w-0 flex-1 truncate text-sm text-text">
                  {a.name}
                </span>
                <span className="hidden font-mono text-xs text-text-faint sm:inline">
                  {a.slug}
                </span>
                <span className="hidden text-xs text-text-faint md:inline">
                  {a.city ?? "—"}
                </span>
                <Pill tone={a.role === "manager" ? "warning" : "info"}>
                  <span className="text-xs">{a.role}</span>
                </Pill>
                <form action={unassignSiteAction.bind(null, user.id)}>
                  <input type="hidden" name="siteId" value={a.siteId} />
                  <button
                    type="submit"
                    className="rounded-sm px-1.5 py-0.5 text-xs text-text-faint hover:bg-danger-tint hover:text-danger"
                    title="Remove from site"
                  >
                    Remove
                  </button>
                </form>
              </Row>
            ))}
          </RowList>
        )}

        {unassigned.length > 0 ? (
          <form
            action={assignSiteAction.bind(null, user.id)}
            className="flex flex-wrap items-end gap-3 border-t border-border bg-surface-2/40 px-4 py-3"
          >
            <Field label="Site">
              <select
                name="siteId"
                className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
              >
                {unassigned.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.slug} {s.city ? `(${s.city})` : ""}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Role on site">
              <select
                name="role"
                defaultValue="worker"
                className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
              >
                <option value="worker">worker</option>
                <option value="manager">manager</option>
              </select>
            </Field>
            <button
              type="submit"
              className="rounded-md bg-accent px-2.5 py-1.5 text-xs font-medium text-brand-navy-deep hover:bg-accent-hover"
            >
              Assign
            </button>
          </form>
        ) : null}
      </section>

      {/* ===== Danger zone ===== */}
      {!isMe ? (
        <section className="rounded-lg border border-danger/30 bg-danger-tint/40 p-5">
          <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-danger">
            Danger zone
          </h2>
          <p className="mt-2 text-xs text-text-muted">
            Delete this user. Their sessions, site assignments, and task assignments will be removed.
            You&apos;ll see a preview of the impact before confirming.
          </p>
          <Link
            href={`/admin/users/${user.id}/delete`}
            className="mt-3 inline-flex rounded-md border border-danger/40 bg-surface px-2.5 py-1.5 text-xs font-medium text-danger hover:bg-danger-tint"
          >
            Delete user…
          </Link>
        </section>
      ) : null}
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  const tone: "danger" | "warning" | "info" =
    role === "admin" ? "danger" : role === "manager" ? "warning" : "info";
  return <Pill tone={tone}>{role}</Pill>;
}

function PresenceLine({
  tone,
  pulse,
  label,
}: {
  tone: "success" | "warning" | "neutral" | "accent" | "info";
  pulse: boolean;
  label: string;
}) {
  const dot = {
    success: "bg-success",
    warning: "bg-warning",
    neutral: "bg-text-faint",
    accent: "bg-accent",
    info: "bg-info",
  }[tone];
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="relative inline-flex h-2 w-2">
        {pulse ? <span className={`absolute inset-0 animate-ping rounded-full ${dot} opacity-60`} /> : null}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${dot}`} />
      </span>
      <span>{label}</span>
    </span>
  );
}

function Stat2({ label, value }: { label: string; value: string | number }) {
  return (
    <span>
      <span className="text-text-faint">{label}</span>{" "}
      <span className="tnum text-text">{value}</span>
    </span>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-[0.06em] text-text-faint">
        {label}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-text-faint">{hint}</span> : null}
    </label>
  );
}

function Flash({ kind, msg }: { kind: "ok" | "error"; msg: string }) {
  const c =
    kind === "ok"
      ? "border-success/30 bg-success-tint text-success"
      : "border-danger/30 bg-danger-tint text-danger";
  return <div className={`rounded-md border px-3 py-2 text-xs ${c}`}>{msg}</div>;
}

function formatDuration(secs: number): string {
  if (secs < 60) return `${Math.round(secs)}s`;
  const mins = secs / 60;
  if (mins < 60) return `${Math.round(mins)}m`;
  const hours = mins / 60;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  const days = hours / 24;
  return `${days.toFixed(1)}d`;
}

function flashMsg(code: string): string {
  return (
    {
      saved: "Saved.",
      "password-reset": "Password reset. All sessions revoked.",
      assigned: "Assignment saved.",
      unassigned: "Assignment removed.",
      role: "Invalid role.",
      "pw-short": "Password must be at least 8 characters.",
      "self-demote": "You can't remove your own admin role.",
      assign: "Bad input for assignment.",
      unassign: "Could not remove assignment.",
      site: "Site not found.",
    }[code] ?? code
  );
}
