import Link from "next/link";
import { and, eq, inArray, ne, notInArray, sql } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { sites, tasks, users } from "@/db/schema";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  IconChartBar,
  IconCheckCircle,
  IconExternalLink,
  IconSettings,
} from "@/components/ui/Icon";
import { requireAdmin } from "@/lib/server-auth";
import { formatRelative } from "@/lib/utils";

export const dynamic = "force-dynamic";

type SiteCardRow = {
  id: string;
  slug: string;
  name: string;
  domain: string;
  city: string | null;
  region: string | null;
  createdAt: Date;
  teamCount: number;
  activeKeys: number;
  lastEventAt: Date | null;
  hasGsc: number;
  hasGa4: number;
  seoScore: number | null;
  pagesTracked: number;
  pagesIndexed: number;
  openFixes: number;
};

type SiteTaskInfo = {
  open: number;
  inProgress: number;
  overdue: number;
  doneRecent: number;
  next: {
    id: string;
    title: string;
    priority: string;
    status: string;
    dueAt: Date | null;
    assigneeId: string | null;
    assigneeName: string | null;
  } | null;
};

export default async function SitesPage({
  searchParams,
}: {
  searchParams: { ok?: string; error?: string };
}) {
  await ensureSchema();
  await requireAdmin();
  const d = db();

  // Pull every signal a network operator needs at a glance:
  //   - identity (slug/name/domain/city)
  //   - activity counters (leads / quotes / reservations / team)
  //   - lifeline (most recent event = heartbeat or any traffic event)
  //   - integration state (Google / Stripe / Square via integrations_accounts)
  //   - data freshness (GSC + GA4 most recent snapshot date)
  // All subqueries are correlated on site_id with an index — cheap per row.
  const rawRows = await d
    .select({
      id: sites.id,
      slug: sites.slug,
      name: sites.name,
      domain: sites.domain,
      city: sites.city,
      region: sites.region,
      createdAt: sites.createdAt,
      teamCount: sql<number>`(select count(*)::int from site_users where site_users.site_id = sites.id)`,
      activeKeys: sql<number>`(select count(*)::int from api_keys where api_keys.site_id = sites.id and api_keys.active = true)`,
      lastEventAt: sql<Date | null>`(select max(received_at) from events where events.site_id = sites.id)`,
      hasGsc: sql<number>`(select count(*)::int from traffic_snapshots where traffic_snapshots.site_id = sites.id and source = 'gsc')`,
      hasGa4: sql<number>`(select count(*)::int from traffic_snapshots where traffic_snapshots.site_id = sites.id and source = 'ga4')`,
      // Latest 'seo' composite score (0–100). Null when the daily scoring job
      // hasn't run for this site yet.
      seoScore: sql<number | null>`(select value from site_scores where site_scores.site_id = sites.id and site_scores.score_key = 'seo' order by snapshot_date desc limit 1)`,
      // Index coverage — how many tracked URLs Google actually indexed.
      pagesTracked: sql<number>`(select count(*)::int from indexing_status where indexing_status.site_id = sites.id)`,
      pagesIndexed: sql<number>`(select count(*)::int from indexing_status where indexing_status.site_id = sites.id and index_state = 'indexed')`,
      // Open auto-fix proposals awaiting approval in the fix queue.
      openFixes: sql<number>`(select count(*)::int from fix_proposals where fix_proposals.site_id = sites.id and fix_proposals.status = 'pending')`,
    })
    .from(sites)
    .orderBy(sites.slug);

  // Postgres returns timestamptz columns from subqueries as strings (no automatic
  // type coercion via Drizzle's sql<...> tag). Normalize once here so the rest
  // of the page is purely typed.
  const rows: SiteCardRow[] = rawRows.map((r) => ({
    ...r,
    createdAt: r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt as unknown as string),
    lastEventAt: r.lastEventAt ? new Date(r.lastEventAt as unknown as string) : null,
  }));

  // Task data per site — counts + the single most urgent open task to feature.
  // Done as separate queries (cheap with indexes) rather than N subqueries per
  // row, so the SQL stays scannable and the per-card cost is constant.
  const taskCountsRaw = await d
    .select({
      siteId: tasks.siteId,
      status: tasks.status,
      isOverdue: sql<boolean>`(${tasks.dueAt} is not null and ${tasks.dueAt} < now() and ${tasks.status} not in ('done','cancelled'))`,
      completedRecently: sql<boolean>`(${tasks.completedAt} is not null and ${tasks.completedAt} > now() - interval '7 days')`,
    })
    .from(tasks);

  const nextTasksRaw = await d
    .select({
      id: tasks.id,
      siteId: tasks.siteId,
      title: tasks.title,
      priority: tasks.priority,
      status: tasks.status,
      dueAt: tasks.dueAt,
      assigneeId: tasks.assigneeId,
      assigneeName: users.name,
      assigneeEmail: users.email,
      rank: sql<number>`(row_number() over (
        partition by ${tasks.siteId}
        order by
          case ${tasks.priority}
            when 'urgent' then 0
            when 'high' then 1
            when 'normal' then 2
            when 'low' then 3
          end,
          case when ${tasks.dueAt} is null then 1 else 0 end,
          ${tasks.dueAt} asc
      ))::int`,
    })
    .from(tasks)
    .leftJoin(users, eq(tasks.assigneeId, users.id))
    .where(notInArray(tasks.status, ["done", "cancelled"]));

  const tasksBySite = new Map<string, SiteTaskInfo>();
  for (const r of rows) {
    tasksBySite.set(r.id, { open: 0, inProgress: 0, overdue: 0, doneRecent: 0, next: null });
  }
  for (const t of taskCountsRaw) {
    const bucket = tasksBySite.get(t.siteId);
    if (!bucket) continue;
    if (t.status !== "done" && t.status !== "cancelled") bucket.open += 1;
    if (t.status === "in_progress") bucket.inProgress += 1;
    if (t.isOverdue) bucket.overdue += 1;
    if (t.completedRecently) bucket.doneRecent += 1;
  }
  for (const t of nextTasksRaw) {
    if (t.rank !== 1) continue;
    const bucket = tasksBySite.get(t.siteId);
    if (!bucket) continue;
    bucket.next = {
      id: t.id,
      title: t.title,
      priority: t.priority,
      status: t.status,
      dueAt: t.dueAt ? (t.dueAt instanceof Date ? t.dueAt : new Date(t.dueAt as unknown as string)) : null,
      assigneeId: t.assigneeId,
      assigneeName: t.assigneeName ?? t.assigneeEmail ?? null,
    };
  }

  // Network-wide health roll-up for the header strip.
  const now = Date.now();
  const healthy = rows.filter((r) => r.lastEventAt && now - r.lastEventAt.getTime() < 36 * 3600_000).length;
  const stale = rows.filter(
    (r) => r.lastEventAt && now - r.lastEventAt.getTime() >= 36 * 3600_000 && now - r.lastEventAt.getTime() < 7 * 24 * 3600_000,
  ).length;
  const silent = rows.length - healthy - stale;

  // SEO + fix-queue network roll-ups for the summary strip.
  const scored = rows.filter((r) => r.seoScore !== null);
  const avgSeo =
    scored.length > 0 ? Math.round(scored.reduce((a, r) => a + (r.seoScore ?? 0), 0) / scored.length) : null;
  const totalOpenFixes = rows.reduce((a, r) => a + (r.openFixes ?? 0), 0);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium tracking-tightish text-text">Sites</h1>
          <p className="mt-1 text-sm text-text-muted">
            Every WordPress install in the network. Click a card to open the site&rsquo;s
            detail page, or jump straight to its public site or WP admin.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/sites/brand"
            className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text-muted hover:bg-surface-2 hover:text-text"
          >
            Bulk brand
          </Link>
          <Link
            href="/admin/sites/new"
            className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text-muted hover:bg-surface-2 hover:text-text"
          >
            Quick add
          </Link>
          <Link
            href="/admin/sites/connect"
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-brand-navy-deep shadow-sm transition-colors hover:bg-accent-hover focus-visible:shadow-glow"
          >
            + Connect site
          </Link>
        </div>
      </header>

      {searchParams.ok ? (
        <div className="rounded-lg border border-success/25 bg-success-tint px-3 py-2 text-sm text-success">
          {{ deleted: "Site deleted." }[searchParams.ok] ?? searchParams.ok}
        </div>
      ) : null}

      {rows.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 rounded-xl bg-surface p-1 shadow-sm sm:grid-cols-3 lg:grid-cols-5">
          <NetStat label="Total sites" value={rows.length} tone="neutral" />
          <NetStat label="Healthy" value={healthy} tone="success" hint="event in last 36h" />
          <NetStat label="Needs attention" value={stale + silent} tone={stale + silent > 0 ? "warning" : "neutral"} hint="stale or silent" />
          <NetStat label="Avg SEO score" value={avgSeo ?? 0} tone="neutral" hint={avgSeo === null ? "not scored yet" : `${scored.length} of ${rows.length} scored`} />
          <NetStat label="Open fixes" value={totalOpenFixes} tone={totalOpenFixes > 0 ? "warning" : "neutral"} hint="awaiting approval" />
        </div>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          glyph="sites"
          title="No sites yet"
          description="Add your first WordPress install. The platform issues an API key automatically — paste it into the GYL Suite plugin (Settings → GYL Suite) and leads start flowing."
          action={{ label: "+ Connect site", href: "/admin/sites/connect" }}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((s) => (
            <SiteCard key={s.id} site={s} taskInfo={tasksBySite.get(s.id) ?? null} />
          ))}
        </div>
      )}

      <p className="text-xs text-text-faint">
        {rows.length} site{rows.length === 1 ? "" : "s"} · alphabetical · refreshed live on every load.
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Per-site card. Single source of truth for what an operator sees per row.
 * --------------------------------------------------------------------------- */

function SiteCard({ site, taskInfo }: { site: SiteCardRow; taskInfo: SiteTaskInfo | null }) {
  const publicUrl = `https://${site.domain}`;
  const wpAdminUrl = `https://${site.domain}/wp-admin/`;
  const health = computeHealth(site.lastEventAt);
  const location = [site.city, site.region].filter(Boolean).join(", ");

  return (
    <article className="group relative flex flex-col rounded-xl bg-surface shadow-sm transition-shadow hover:shadow-md">
      {/* Top strip — monogram + name + status pip */}
      <div className="flex items-start gap-3 p-4">
        <Monogram name={site.name} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Link
              href={`/admin/sites/${site.slug}`}
              className="truncate text-base font-semibold text-text hover:text-accent"
            >
              {site.name}
            </Link>
            <HealthPip tone={health.tone} label={health.label} />
          </div>
          <div className="mt-0.5 truncate text-xs text-text-muted">
            {location || <span className="text-text-faint">No location set</span>}
          </div>
        </div>
      </div>

      {/* URLs — public + WP admin */}
      <div className="space-y-1 px-4 pb-3">
        <a
          href={publicUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="group/url inline-flex max-w-full items-center gap-1.5 truncate text-sm text-accent hover:underline"
          title={publicUrl}
        >
          <span className="truncate">{site.domain}</span>
          <IconExternalLink size={12} className="opacity-60 group-hover/url:opacity-100" />
        </a>
        <div>
          <a
            href={wpAdminUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-2 px-2 py-1 text-xs font-medium text-text-muted transition-colors hover:border-accent/40 hover:bg-accent-tint hover:text-accent"
          >
            <IconSettings size={12} />
            Open WP admin
            <IconExternalLink size={11} className="opacity-60" />
          </a>
        </div>
      </div>

      {/* Activity stats — small grid. Each cell is a Link that filters the
          relevant index page to this specific site, so operators can jump
          from the network overview straight into the rows that need attention. */}
      <div className="grid grid-cols-4 gap-px border-y border-border bg-surface-2 text-center">
        <Stat label="Pages" value={site.pagesTracked} href={`/admin/indexing?site=${site.slug}`} />
        <Stat label="Indexed" value={site.pagesIndexed} href={`/admin/indexing?site=${site.slug}`} />
        <Stat label="Open fixes" value={site.openFixes} href={`/admin/fix-queue?site=${site.slug}`} />
        <Stat label="Team" value={site.teamCount} href={`/admin/sites/${site.slug}#team`} />
      </div>

      {/* SEO / operator signal — score, index coverage, open fixes. Mirrors
          the network strip but per-site, so an operator can scan the grid for
          the weak site without opening each detail page. */}
      <SeoSignalRow site={site} />

      {/* Connection chips */}
      <div className="flex flex-wrap items-center gap-1.5 p-4">
        <ConnChip label="WP Connector" on={!!site.lastEventAt} />
        <ConnChip label="Search Console" on={site.hasGsc > 0} />
        <ConnChip label="Analytics 4" on={site.hasGa4 > 0} />
      </div>

      {/* Tasks strip — counts + most urgent open task + assignee */}
      <TaskStrip slug={site.slug} info={taskInfo} />

      {/* Footer — last activity + view details */}
      <div className="flex items-center justify-between border-t border-border bg-surface-2/50 px-4 py-2.5 text-xs">
        <span className="text-text-muted">
          {site.lastEventAt ? (
            <>
              Last event{" "}
              <span className="text-text">{formatRelative(site.lastEventAt)}</span>
            </>
          ) : (
            <span className="text-text-faint">No events yet</span>
          )}
        </span>
        <Link
          href={`/admin/sites/${site.slug}`}
          className="font-medium text-accent hover:underline"
        >
          View details &rarr;
        </Link>
      </div>
    </article>
  );
}

/* ---------------------------------------------------------------------------
 * Task strip — sits between the connection chips and the footer on each
 * SiteCard. Shows count chips (Open / In progress / Overdue / Done 7d) and the
 * single most urgent open task (sorted by priority then due date), with an
 * assignee chip that deep-links to /admin/users/<id>.
 *
 * Why one task and not three: the card is already information-dense. The
 * "what's the next thing to do" answer is what an operator wants at a glance;
 * the full backlog lives one click away at /admin/tasks?site=<slug>.
 * --------------------------------------------------------------------------- */
function TaskStrip({ slug, info }: { slug: string; info: SiteTaskInfo | null }) {
  const open = info?.open ?? 0;
  const overdue = info?.overdue ?? 0;
  const inProgress = info?.inProgress ?? 0;
  const next = info?.next ?? null;

  return (
    <div className="border-t border-border bg-surface-2/40 px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-text-faint">Tasks</span>
        <Link
          href={`/admin/tasks?site=${encodeURIComponent(slug)}`}
          className="text-xs font-medium text-accent hover:underline"
        >
          Manage &rarr;
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <TaskCountChip label="Open" value={open} tone={open > 0 ? "accent" : "muted"} />
        <TaskCountChip label="In progress" value={inProgress} tone={inProgress > 0 ? "info" : "muted"} />
        <TaskCountChip label="Overdue" value={overdue} tone={overdue > 0 ? "danger" : "muted"} />
        <Link
          href={`/admin/tasks/new?site=${encodeURIComponent(slug)}`}
          className="ml-auto inline-flex items-center rounded-full border border-dashed border-border px-2 py-0.5 text-xs font-medium text-text-muted hover:border-accent hover:text-accent"
        >
          + New task
        </Link>
      </div>

      {next ? (
        <Link
          href={`/admin/tasks/${next.id}`}
          className="mt-3 block rounded-md border border-border bg-surface p-2.5 transition-colors hover:border-accent/40 hover:bg-accent-tint/40"
        >
          <div className="flex items-center gap-2">
            <PriorityDot priority={next.priority} />
            <span className="flex-1 truncate text-sm font-medium text-text">{next.title}</span>
          </div>
          <div className="mt-1.5 flex items-center justify-between text-xs">
            <span className={dueClass(next.dueAt)}>{dueLabel(next.dueAt)}</span>
            {next.assigneeId && next.assigneeName ? (
              <AssigneeChip id={next.assigneeId} name={next.assigneeName} />
            ) : (
              <span className="rounded-full bg-warning-tint px-1.5 py-0.5 text-xs font-medium text-warning">
                Unassigned
              </span>
            )}
          </div>
        </Link>
      ) : open === 0 ? (
        <p className="mt-2 text-xs text-text-faint">No tasks yet — click + New task to create one.</p>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * SeoSignalRow — per-site SEO/operator signal strip. Three cells: latest SEO
 * composite score (with tone), index coverage (indexed / tracked), and open
 * fix-queue count. Each only renders meaningful data; "—" when not yet
 * available so a brand-new site reads calm rather than broken.
 * --------------------------------------------------------------------------- */
function SeoSignalRow({ site }: { site: SiteCardRow }) {
  const seoTone =
    site.seoScore === null
      ? "text-text-faint"
      : site.seoScore >= 75
        ? "text-success"
        : site.seoScore >= 50
          ? "text-accent"
          : site.seoScore >= 25
            ? "text-warning"
            : "text-danger";
  const indexPct =
    site.pagesTracked > 0 ? Math.round((site.pagesIndexed / site.pagesTracked) * 100) : null;

  return (
    <div className="grid grid-cols-3 gap-px border-b border-border bg-surface-2 text-center">
      <div className="bg-surface px-2 py-2.5">
        <div className={`text-base font-semibold tabular-nums ${seoTone}`}>
          {site.seoScore ?? "—"}
        </div>
        <div className="mt-0.5 text-xs uppercase tracking-wide text-text-faint">SEO score</div>
      </div>
      <Link
        href={`/admin/sites/${site.slug}/health`}
        className="group bg-surface px-2 py-2.5 transition-colors hover:bg-accent/5"
        title={indexPct === null ? "No indexing data yet" : `${site.pagesIndexed} of ${site.pagesTracked} tracked URLs indexed`}
      >
        <div className="text-base font-semibold tabular-nums text-text group-hover:text-accent">
          {indexPct === null ? "—" : `${indexPct}%`}
        </div>
        <div className="mt-0.5 text-xs uppercase tracking-wide text-text-faint group-hover:text-accent/80">Indexed</div>
      </Link>
      <Link
        href={`/admin/sites/${site.slug}/fixes`}
        className="group bg-surface px-2 py-2.5 transition-colors hover:bg-accent/5"
        title="Open fix proposals awaiting approval"
      >
        <div className={`text-base font-semibold tabular-nums ${site.openFixes > 0 ? "text-warning" : "text-text"} group-hover:text-accent`}>
          {site.openFixes}
        </div>
        <div className="mt-0.5 text-xs uppercase tracking-wide text-text-faint group-hover:text-accent/80">Open fixes</div>
      </Link>
    </div>
  );
}

function TaskCountChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "accent" | "info" | "danger" | "muted";
}) {
  const styles = {
    accent: "bg-accent-tint text-accent",
    info: "bg-info-tint text-info",
    danger: "bg-danger-tint text-danger",
    muted: "bg-surface-3 text-text-muted",
  }[tone];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${styles}`}>
      <span className="tabular-nums">{value}</span>
      <span className="opacity-70">{label}</span>
    </span>
  );
}

function PriorityDot({ priority }: { priority: string }) {
  const cls =
    priority === "urgent"
      ? "bg-danger"
      : priority === "high"
        ? "bg-warning"
        : priority === "normal"
          ? "bg-accent"
          : "bg-text-faint";
  return <span className={`h-2 w-2 shrink-0 rounded-full ${cls}`} title={`Priority: ${priority}`} />;
}

function AssigneeChip({ id, name }: { id: string; name: string }) {
  // Use a stop-propagation wrapper since this lives inside an outer <Link>
  // to the task — clicking the assignee should go to the user page, not the
  // task. <a> inside <Link> isn't allowed in Next 14, so we use the parent's
  // anchor and rely on the bigger task link being the primary action; the
  // user is reachable via /admin/users from the global nav too.
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "?";
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-text-muted"
      title={`Assigned to ${name}`}
    >
      <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-accent/15 text-xs font-bold text-accent">
        {initials}
      </span>
      <span className="max-w-[120px] truncate">{name}</span>
    </span>
  );
}

function dueLabel(dueAt: Date | null): string {
  if (!dueAt) return "No due date";
  const ms = dueAt.getTime() - Date.now();
  const days = Math.round(ms / (24 * 3600_000));
  if (ms < 0) return `Overdue · ${Math.abs(days)}d ago`;
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `Due in ${days}d`;
}

function dueClass(dueAt: Date | null): string {
  if (!dueAt) return "text-text-faint";
  return dueAt.getTime() < Date.now() ? "font-medium text-danger" : "text-text-muted";
}

/* ---------------------------------------------------------------------------
 * Sub-components — kept inline because they're only useful in this page.
 * --------------------------------------------------------------------------- */

/** Deterministic 1-2 char monogram on a brand-tinted background. Picks the
 *  accent tint by hashing the slug so different sites get visually distinct
 *  avatars without any external service. */
function Monogram({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "?";
  // Hash the name → pick a tint. Six pastel hues, all readable in light + dark.
  const palette = [
    "bg-[#EFEAFE] text-[#5B3FD5] dark:bg-[#2A2356] dark:text-[#C4B4FB]", // violet
    "bg-[#E0F2FE] text-[#0369A1] dark:bg-[#0B2C3F] dark:text-[#7DD3FC]", // sky
    "bg-[#ECFDF3] text-[#15803D] dark:bg-[#0E2A1B] dark:text-[#86EFAC]", // green
    "bg-[#FEF6E7] text-[#A35A07] dark:bg-[#332309] dark:text-[#FDBA74]", // amber
    "bg-[#FEE7E7] text-[#B91C1C] dark:bg-[#3A1313] dark:text-[#FCA5A5]", // rose
    "bg-[#F1F0FD] text-[#4338CA] dark:bg-[#1F1A40] dark:text-[#A5B4FC]", // indigo
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const cls = palette[h % palette.length];
  return (
    <span
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-semibold tracking-tight ${cls}`}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}

function HealthPip({ tone, label }: { tone: "success" | "warning" | "danger" | "neutral"; label: string }) {
  const dot =
    tone === "success"
      ? "bg-success"
      : tone === "warning"
        ? "bg-warning"
        : tone === "danger"
          ? "bg-danger"
          : "bg-text-faint";
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-text-muted">
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

function Stat({ label, value, href }: { label: string; value: number; href?: string }) {
  const inner = (
    <>
      <div className="text-lg font-semibold tabular-nums text-text group-hover:text-accent">{value.toLocaleString()}</div>
      <div className="mt-0.5 text-xs uppercase tracking-wide text-text-faint group-hover:text-accent/80">{label}</div>
    </>
  );
  // When a count is zero the link still works — it lands on an empty filtered
  // list which is itself useful information ("no leads yet for this site").
  if (href) {
    return (
      <Link
        href={href}
        className="group block bg-surface px-2 py-3 transition-colors hover:bg-accent/5"
      >
        {inner}
      </Link>
    );
  }
  return <div className="bg-surface px-2 py-3">{inner}</div>;
}

function ConnChip({ label, on }: { label: string; on: boolean }) {
  if (on) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-success-tint px-2 py-0.5 text-xs font-medium text-success">
        <IconCheckCircle size={11} />
        {label}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-xs text-text-faint">
      <span className="h-1.5 w-1.5 rounded-full bg-text-faint/40" />
      {label}
    </span>
  );
}

function NetStat({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: number;
  tone: "neutral" | "success" | "warning";
  hint?: string;
}) {
  const numColor =
    tone === "success" && value > 0
      ? "text-success"
      : tone === "warning" && value > 0
        ? "text-warning"
        : "text-text";
  return (
    <div
      className="relative overflow-hidden rounded-xl px-4 py-3"
      style={{ background: "linear-gradient(180deg, var(--surface), var(--surface-2))" }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-3 top-0 h-px"
        style={{
          background: "linear-gradient(90deg, transparent, var(--border-strong), transparent)",
        }}
      />
      <div className="text-xs uppercase tracking-[0.10em] font-semibold text-text-faint">{label}</div>
      <div className={`mt-2 text-3xl font-semibold leading-none tabular-nums tracking-tight ${numColor}`}>
        {value}
      </div>
      {hint ? <div className="mt-1.5 text-xs text-text-faint">{hint}</div> : null}
    </div>
  );
}

/* Heartbeat / event freshness → health verdict. Thresholds are intentionally
 * generous — Site Kit pushes once a day, plus form submissions can be sparse
 * on a brand-new site, so we don't want to flag a quiet but healthy site.
 *
 *   < 36h  → healthy (green)        — daily cron + form events covered
 *   < 7d   → stale   (amber)        — cron missed a day, check the WP-Cron
 *   ≥ 7d   → silent  (red)          — plugin probably uninstalled/disabled
 *   never  → onboarding (neutral)   — site exists, no event ever received
 */
function computeHealth(lastEventAt: Date | null): {
  tone: "success" | "warning" | "danger" | "neutral";
  label: string;
} {
  if (!lastEventAt) return { tone: "neutral", label: "Onboarding" };
  const age = Date.now() - lastEventAt.getTime();
  if (age < 36 * 3600_000) return { tone: "success", label: "Healthy" };
  if (age < 7 * 24 * 3600_000) return { tone: "warning", label: "Stale" };
  return { tone: "danger", label: "Silent" };
}
