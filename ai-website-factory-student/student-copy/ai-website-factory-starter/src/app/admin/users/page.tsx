import Link from "next/link";
import { sql } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { sessions, tasks, users } from "@/db/schema";
import { AutoRefresh } from "@/components/ui/AutoRefresh";
import { AvatarWithDot } from "@/components/ui/Avatar";
import { InviteLinkCopy } from "@/components/ui/InviteLinkCopy";
import { Pill, Row, RowList } from "@/components/ui/Row";
import { classifyPresence, presenceLabel, presenceTone } from "@/lib/presence";
import { requireAdmin } from "@/lib/server-auth";
import { SettingsTabs } from "@/components/ui/SettingsTabs";

export const dynamic = "force-dynamic";

export default async function UsersPage({
  searchParams,
}: {
  searchParams: { ok?: string; error?: string; link?: string };
}) {
  await ensureSchema();
  await requireAdmin();
  const d = db();

  const rows = await d
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      createdAt: users.createdAt,
      lastLoginAt: users.lastLoginAt,
      siteCount: sql<number>`(select count(*)::int from site_users where site_users.user_id = users.id)`,
      // Most recent live session lastSeenAt (null if no active session).
      lastSeenAt: sql<Date | null>`(
        select max(${sessions.lastSeenAt}) from ${sessions}
        where ${sessions.userId} = ${users.id} and ${sessions.expiresAt} > now()
      )`,
      // Workload: open tasks (todo / in_progress / in_review / blocked) assigned
      // to this user, and how many of those are past their due date. Matches
      // the same "open"/"overdue" semantics used on /admin and Sites cards.
      // Use literal table/column names inside the subquery — Drizzle's `${tasks}`
      // / `${tasks.assigneeId}` interpolation doesn't always emit a proper alias
      // inside a correlated subquery, which silently produces zero rows.
      openTaskCount: sql<number>`(
        select count(*)::int from tasks
        where tasks.assignee_id = users.id
          and tasks.status not in ('done', 'cancelled')
      )`,
      overdueTaskCount: sql<number>`(
        select count(*)::int from tasks
        where tasks.assignee_id = users.id
          and tasks.status not in ('done', 'cancelled')
          and tasks.due_at is not null
          and tasks.due_at < now()
      )`,
    })
    .from(users)
    .orderBy(users.createdAt);

  const onlineCount = rows.filter((u) => classifyPresence(u.lastSeenAt) === "online").length;
  const adminCount = rows.filter((u) => u.role === "admin").length;
  const managerCount = rows.filter((u) => u.role === "manager").length;
  const studentCount = rows.filter((u) => u.role === "student").length;
  // "Inactive" = no active session AND no login in the last 14 days. Surfacing
  // this lets the admin spot abandoned accounts or workers who stopped working.
  const fourteenDaysAgo = Date.now() - 14 * 24 * 3600_000;
  const inactiveCount = rows.filter((u) => {
    const lastSeen = u.lastSeenAt?.getTime?.() ?? null;
    const lastLogin = u.lastLoginAt?.getTime?.() ?? null;
    const recent = Math.max(lastSeen ?? 0, lastLogin ?? 0);
    return recent === 0 || recent < fourteenDaysAgo;
  }).length;

  return (
    <div className="space-y-6">
      <SettingsTabs active="users" />
      {/* Live presence dots — refresh every 30s */}
      <AutoRefresh intervalMs={30_000} />

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-baseline gap-3">
            <h1 className="">
              Users
            </h1>
            {onlineCount > 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success-tint/60 px-2 py-0.5 text-xs text-success">
                <span className="relative inline-flex h-1.5 w-1.5">
                  <span className="absolute inset-0 animate-ping rounded-full bg-success opacity-60" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
                </span>
                {onlineCount} online now
              </span>
            ) : null}
          </div>
          <p className="mt-1.5 text-xs sm:text-sm text-text-muted">
            Manage admins, managers, and students. Sessions auto-expire after 30 days.
          </p>
        </div>
        <Link
          href="/admin/users/new"
          className="rounded-md bg-accent px-2.5 py-1.5 text-xs font-medium text-brand-navy-deep shadow-xs hover:bg-accent-hover"
        >
          + New user
        </Link>
      </header>

      {searchParams.ok === "invited" && searchParams.link ? (
        <InviteLinkBanner link={searchParams.link} />
      ) : searchParams.ok ? (
        <Flash kind="ok" msg={msgFor(searchParams.ok)} />
      ) : null}
      {searchParams.error ? <Flash kind="error" msg={msgFor(searchParams.error)} /> : null}

      {/* Stat strip — total / role split / online / inactive at a glance */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <UserStat label="Total" value={rows.length} tone="neutral" />
        <UserStat label="Admins" value={adminCount} tone="accent" />
        <UserStat label="Managers" value={managerCount} tone="info" />
        <UserStat label="Students" value={studentCount} tone="neutral" />
        <UserStat
          label="Inactive · 14d+"
          value={inactiveCount}
          tone={inactiveCount > 0 ? "warning" : "neutral"}
        />
      </section>

      <RowList footer={`${rows.length} user${rows.length === 1 ? "" : "s"} · ${onlineCount} online now`}>
        {rows.map((u) => {
          const presence = classifyPresence(u.lastSeenAt);
          const tone = presenceTone(presence);
          const isOnline = presence === "online";
          return (
            <Row key={u.id} href={`/admin/users/${u.id}`}>
              <AvatarWithDot
                email={u.email}
                name={u.name}
                role={u.role}
                size="md"
                tone={tone}
                pulse={isOnline}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="truncate text-sm font-medium text-text">
                    {u.name ?? u.email.split("@")[0]}
                  </span>
                  <span className="truncate font-mono text-xs text-text-faint">
                    {u.email}
                  </span>
                </div>
                <div className="mt-0.5 text-xs text-text-faint">
                  {presenceLabel(presence, u.lastSeenAt)}
                </div>
              </div>
              <RoleBadge role={u.role} />
              <WorkloadChip open={u.openTaskCount} overdue={u.overdueTaskCount} />
              <span className="tnum hidden w-16 text-right text-xs text-text-muted sm:inline">
                {u.role === "admin"
                  ? "All sites"
                  : `${u.siteCount} site${u.siteCount === 1 ? "" : "s"}`}
              </span>
            </Row>
          );
        })}
      </RowList>
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  const tone: "danger" | "warning" | "info" = role === "admin" ? "danger" : role === "manager" ? "warning" : "info";
  return <Pill tone={tone}>{role}</Pill>;
}

/** Compact 5-stat tile for the top-of-page strip. Mirrors the visual rhythm
 *  of the Sites and Overview stat strips so the eye reads the same dimension
 *  on every list page. */
function UserStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "neutral" | "accent" | "info" | "warning";
}) {
  const num =
    tone === "warning" && value > 0 ? "text-warning" : "text-text";
  return (
    <div
      className="relative overflow-hidden rounded-xl border border-border px-4 py-3"
      style={{ background: "linear-gradient(180deg, var(--surface), var(--surface-2))" }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-3 top-0 h-px"
        style={{ background: "linear-gradient(90deg, transparent, var(--border-strong), transparent)" }}
      />
      <div className="text-xs uppercase tracking-[0.10em] font-semibold text-text-faint">{label}</div>
      <div className={`mt-2 text-3xl font-semibold leading-none tabular-nums tracking-tight ${num}`}>{value}</div>
    </div>
  );
}

/** Workload chip — one row's open vs overdue task count. Mirrors the chip
 *  language used in the Overview "Team workload" widget. Hidden on narrow
 *  screens to keep the row scan-friendly. */
function WorkloadChip({ open, overdue }: { open: number; overdue: number }) {
  if (open === 0 && overdue === 0) {
    return (
      <span className="hidden rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-text-faint sm:inline">
        No tasks
      </span>
    );
  }
  return (
    <span className="hidden items-center gap-1 sm:inline-flex">
      <span className="inline-flex items-center gap-1 rounded-full bg-accent-tint px-2 py-0.5 text-xs font-medium text-accent">
        <span className="tabular-nums">{open}</span>
        <span className="opacity-70">open</span>
      </span>
      {overdue > 0 ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-danger-tint px-2 py-0.5 text-xs font-medium text-danger">
          <span className="tabular-nums">{overdue}</span>
          <span className="opacity-80">overdue</span>
        </span>
      ) : null}
    </span>
  );
}

function Flash({ kind, msg }: { kind: "ok" | "error"; msg: string }) {
  const c =
    kind === "ok"
      ? "border-success/30 bg-success-tint text-success"
      : "border-danger/30 bg-danger-tint text-danger";
  return <div className={`rounded-md border px-3 py-2 text-xs ${c}`}>{msg}</div>;
}

function msgFor(code: string): string {
  return (
    {
      invalid: "Invalid input — check email and password (8+ chars).",
      exists: "A user with that email already exists.",
      "self-delete": "You can't delete your own account.",
      "self-demote": "You can't remove your own admin role.",
      "last-admin": "Refused: this is the last admin. Promote another user first.",
      "not-found": "User not found.",
      deleted: "User deleted.",
      saved: "Saved.",
      "password-reset": "Password reset. All sessions revoked.",
      assigned: "Site assignment saved.",
      unassigned: "Site assignment removed.",
      invited: "Invite created.",
    }[code] ?? code
  );
}

/**
 * Surfaces a freshly generated invite link right after `inviteUserAction`.
 * Server component shell — the copyable input lives in `<InviteLinkCopy/>`
 * (client island) so we can call navigator.clipboard.writeText.
 */
function InviteLinkBanner({ link }: { link: string }) {
  return (
    <div className="rounded-md border border-success/30 bg-success-tint p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-success">
        <span>Invite created.</span>
        <span className="text-text-faint">Copy and send the link below — it expires in 48 hours.</span>
      </div>
      <div className="mt-3">
        <InviteLinkCopy link={link} />
      </div>
    </div>
  );
}
