import Link from "next/link";
import { and, desc, eq, gte, inArray, isNull, like, lt, or, type SQL } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { notifications, sites } from "@/db/schema";
import { Pagination, pageParams, type SearchParams } from "@/components/ui/Pagination";
import { markdownToHtml } from "@/lib/markdown";
import {
  bulkDeleteNotificationsAction,
  deleteNotificationAction,
  markAllReadAction,
  markNotificationReadAction,
} from "@/app/actions/notifications";
import { AutoRefresh } from "@/components/ui/AutoRefresh";
import { EmptyState } from "@/components/ui/EmptyState";
import { HeroKPIStrip } from "@/components/ui/ObsidianAtoms";
import { Pill } from "@/components/ui/Row";
import { SettingsTabs } from "@/components/ui/SettingsTabs";
import { Stat } from "@/components/ui/Stat";
import { getVisibility } from "@/lib/permissions";
import { requireUser } from "@/lib/server-auth";
import { cn, formatRelative } from "@/lib/utils";
import { SiteSelect } from "./SiteSelect";

export const dynamic = "force-dynamic";

type KindFilter = "all" | "unread" | "bookings" | "errors" | "ai_flags" | "daily_digest";
type Period = "all" | "today" | "yesterday" | "week";

const KIND_FILTERS: { id: KindFilter; label: string; hint?: string }[] = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "bookings", label: "Bookings", hint: "quotes + reservations" },
  { id: "errors", label: "Errors" },
  { id: "ai_flags", label: "AI flags" },
  { id: "daily_digest", label: "Daily digest" },
];

const PERIODS: { id: Period; label: string }[] = [
  { id: "all", label: "All time" },
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "week", label: "Last 7 days" },
];

function parseKind(v: string | undefined): KindFilter {
  return (KIND_FILTERS.find((f) => f.id === v)?.id ?? "all") as KindFilter;
}

function parsePeriod(v: string | undefined): Period {
  return (PERIODS.find((p) => p.id === v)?.id ?? "all") as Period;
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export default async function NotificationsPage({
  searchParams = {},
}: {
  searchParams?: SearchParams & { kind?: string; period?: string; site?: string };
}) {
  await ensureSchema();
  const user = await requireUser();
  const visibility = await getVisibility(user);

  const { page, perPage } = pageParams(searchParams);

  const activeKind = parseKind(typeof searchParams.kind === "string" ? searchParams.kind : undefined);
  const activePeriod = parsePeriod(typeof searchParams.period === "string" ? searchParams.period : undefined);
  const activeSiteSlug = (typeof searchParams.site === "string" ? searchParams.site : "").trim();

  // Sites the user can see — used for the filter dropdown
  const visibleSites = await db()
    .select({ id: sites.id, slug: sites.slug, name: sites.name, city: sites.city })
    .from(sites)
    .where(visibility.kind === "scoped" ? inArray(sites.id, visibility.siteIds) : undefined)
    .orderBy(sites.slug);
  const siteBySlug = new Map(visibleSites.map((s) => [s.slug, s]));
  const siteById = new Map(visibleSites.map((s) => [s.id, s]));
  const filterSite = activeSiteSlug ? siteBySlug.get(activeSiteSlug) : null;

  // Build WHERE
  const filters: SQL[] = [eq(notifications.recipientId, user.id)];
  if (activeKind === "unread") filters.push(isNull(notifications.readAt));
  if (activeKind === "bookings") filters.push(or(eq(notifications.kind, "quote_received"), eq(notifications.kind, "reservation_received"))!);
  if (activeKind === "errors") filters.push(like(notifications.kind, "error:%"));
  if (activeKind === "ai_flags") filters.push(eq(notifications.kind, "ai_flag"));
  if (activeKind === "daily_digest") filters.push(eq(notifications.kind, "daily_digest"));

  const today = startOfToday();
  const yesterday = new Date(today.getTime() - 86400e3);
  const weekAgo = new Date(today.getTime() - 7 * 86400e3);
  if (activePeriod === "today") filters.push(gte(notifications.createdAt, today));
  if (activePeriod === "yesterday") {
    filters.push(gte(notifications.createdAt, yesterday));
    filters.push(lt(notifications.createdAt, today));
  }
  if (activePeriod === "week") filters.push(gte(notifications.createdAt, weekAgo));
  if (filterSite) filters.push(eq(notifications.siteId, filterSite.id));

  const whereClause = and(...filters);

  // Stat set — lightweight columns over the FULL filtered set, so the KPI
  // strip + header counts stay accurate regardless of which page is shown.
  const statRows = await db()
    .select({ kind: notifications.kind, readAt: notifications.readAt, createdAt: notifications.createdAt })
    .from(notifications)
    .where(whereClause);
  const total = statRows.length;

  // Paginated display set — only the current page's rows are fetched in full.
  const rows = await db()
    .select()
    .from(notifications)
    .where(whereClause)
    .orderBy(desc(notifications.createdAt))
    .limit(perPage)
    .offset((page - 1) * perPage);

  const unread = statRows.filter((r) => !r.readAt).length;
  const formId = "bulk-delete-form";

  // Group by time bucket for nicer scanning (over the current page's rows).
  const groups: Array<{ label: string; rows: typeof rows }> = [];
  if (activePeriod === "all" || activePeriod === "today" || activePeriod === "week") {
    const todayRows = rows.filter((r) => r.createdAt >= today);
    if (todayRows.length) groups.push({ label: "Today", rows: todayRows });
  }
  if (activePeriod === "all" || activePeriod === "yesterday" || activePeriod === "week") {
    const yesterdayRows = rows.filter((r) => r.createdAt >= yesterday && r.createdAt < today);
    if (yesterdayRows.length) groups.push({ label: "Yesterday", rows: yesterdayRows });
  }
  if (activePeriod === "all" || activePeriod === "week") {
    const weekRows = rows.filter((r) => r.createdAt >= weekAgo && r.createdAt < yesterday);
    if (weekRows.length) groups.push({ label: "Earlier this week", rows: weekRows });
  }
  if (activePeriod === "all") {
    const olderRows = rows.filter((r) => r.createdAt < weekAgo);
    if (olderRows.length) groups.push({ label: "Older", rows: olderRows });
  }

  function buildHref(overrides: Partial<{ kind: KindFilter; period: Period; site: string }>) {
    const p = new URLSearchParams();
    const all = { kind: activeKind, period: activePeriod, site: activeSiteSlug, ...overrides };
    if (all.kind && all.kind !== "all") p.set("kind", all.kind);
    if (all.period && all.period !== "all") p.set("period", all.period);
    if (all.site) p.set("site", all.site);
    return `/admin/notifications${p.toString() ? `?${p.toString()}` : ""}`;
  }

  return (
    <div className="space-y-6">
      <SettingsTabs active="notifications" isAdmin={user.role === "admin"} />
      <AutoRefresh intervalMs={30_000} />

      {/* ===== Header ===== */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="">
            Notifications
          </h1>
          <p className="mt-1.5 text-xs sm:text-sm text-text-muted">
            {total} in view · {unread} unread
            {filterSite ? ` · site ${filterSite.slug}` : ""}
            {activePeriod !== "all" ? ` · ${PERIODS.find((p) => p.id === activePeriod)?.label?.toLowerCase()}` : ""}
          </p>
        </div>
        {unread > 0 ? (
          <form action={markAllReadAction}>
            <button
              type="submit"
              className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-text-muted hover:border-border-strong hover:bg-surface-2 hover:text-text"
            >
              Mark all read
            </button>
          </form>
        ) : null}
      </header>

      {/* KPI strip — at-a-glance unread / today / errors / AI flags. Helps
          triage "what's blowing up right now" without scrolling the list. */}
      {(() => {
        const todayCount = rows.filter((r) => r.createdAt >= today).length;
        const errorCount = rows.filter((r) => r.kind.includes("error") || r.kind.includes("fail")).length;
        const aiFlagCount = rows.filter((r) => r.kind.includes("ai_") || r.kind.includes("agent_") || r.kind.includes("audit")).length;
        return (
          <HeroKPIStrip columns={4}>
            <Stat label="Unread" value={unread} tone={unread > 0 ? "accent" : "neutral"} live={unread > 0} />
            <Stat label="Today" value={todayCount} />
            <Stat label="Errors" value={errorCount} tone={errorCount > 0 ? "danger" : "neutral"} />
            <Stat label="AI flags" value={aiFlagCount} tone={aiFlagCount > 0 ? "warning" : "neutral"} />
          </HeroKPIStrip>
        );
      })()}

      {/* ===== Filter bar — 3 controls in one card ===== */}
      <section className="rounded-lg border border-border bg-surface p-3 space-y-3">
        {/* Period segmented */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.06em] text-text-faint">Period</span>
          <div className="inline-flex overflow-hidden rounded-md border border-border">
            {PERIODS.map((p) => {
              const isActive = activePeriod === p.id;
              return (
                <Link
                  key={p.id}
                  href={buildHref({ period: p.id })}
                  className={cn(
                    "px-3 py-1.5 text-xs font-medium transition-colors",
                    isActive
                      ? "bg-accent text-brand-navy-deep"
                      : "bg-surface text-text-muted hover:bg-surface-2 hover:text-text",
                  )}
                >
                  {p.label}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Kind chips */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.06em] text-text-faint">Kind</span>
          {KIND_FILTERS.map((f) => {
            const isActive = activeKind === f.id;
            return (
              <Link
                key={f.id}
                href={buildHref({ kind: f.id })}
                title={f.hint}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors",
                  isActive
                    ? "bg-accent text-brand-navy-deep"
                    : "border border-border bg-surface text-text-muted hover:bg-surface-2 hover:text-text",
                )}
              >
                {f.label}
              </Link>
            );
          })}
        </div>

        {/* Site filter — only when there's more than one site to choose from */}
        {visibleSites.length > 1 ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.06em] text-text-faint">Site</span>
            <SiteSelect
              sites={visibleSites.map((s) => ({ id: s.id, slug: s.slug, city: s.city }))}
              defaultSlug={activeSiteSlug}
              kind={activeKind === "all" ? "" : activeKind}
              period={activePeriod === "all" ? "" : activePeriod}
            />
            {activeSiteSlug ? (
              <Link href={buildHref({ site: "" })} className="text-xs text-text-faint hover:text-text">Clear</Link>
            ) : null}
          </div>
        ) : null}
      </section>

      {/* ===== Empty state ===== */}
      {total === 0 ? (
        <EmptyState
          glyph="notifications"
          title={activeKind === "all" && activePeriod === "all" ? "No notifications yet" : "Nothing in this view"}
          description={
            activeKind === "all" && activePeriod === "all" ? (
              <>
                Quote + reservation submissions, AI flags, daily digests, and system alerts all land here.
                Try the smart-quote demo at <code className="font-mono text-text-muted">/admin/preview?kind=quick</code> to see one fire.
              </>
            ) : (
              <>
                No notifications match these filters.{" "}
                <Link href="/admin/notifications" className="text-accent hover:underline">Clear filters</Link>.
              </>
            )
          }
        />
      ) : (
        <>
          {/*
            Bulk-delete form mounted EMPTY here; the checkboxes inside each row
            reference it via `form="bulk-delete-form"` so they're submitted with
            it even though they live outside the <form> tag (HTML can't nest forms).
            This lets each row keep its own single-row forms for mark-read + delete.
          */}
          <form id={formId} action={bulkDeleteNotificationsAction} className="hidden">
            <input type="hidden" name="kind" value={activeKind === "all" ? "" : activeKind} />
          </form>

          <div className="flex items-center justify-between rounded-md border border-border bg-surface px-3 py-2 text-xs text-text-muted">
            <span className="text-text-faint">Tick rows to bulk-delete. Owner-scoped.</span>
            <button
              type="submit"
              form={formId}
              className="rounded-md border border-danger/30 bg-surface px-2.5 py-1 text-xs font-medium text-danger hover:bg-danger-tint"
            >
              Delete selected
            </button>
          </div>

          {/* ===== Grouped rows ===== */}
          <div className="space-y-6">
            {groups.map((group) => (
              <section key={group.label}>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-text-faint">
                  {group.label} <span className="ml-1 text-text-faint">· {group.rows.length}</span>
                </h2>
                <ul className="space-y-2.5">
                  {group.rows.map((n) => (
                    <NotificationCard
                      key={n.id}
                      n={n}
                      siteName={n.siteId ? siteById.get(n.siteId)?.slug ?? null : null}
                      formId={formId}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>

          <Pagination
            basePath="/admin/notifications"
            page={page}
            totalItems={total}
            perPage={perPage}
            searchParams={searchParams}
          />
        </>
      )}
    </div>
  );
}

// ============================================================================
// Card variants — kind-aware so booking notifications get a richer layout
// than error notifications, etc.
// ============================================================================

type Notif = typeof notifications.$inferSelect;

function NotificationCard({
  n,
  siteName,
  formId,
}: {
  n: Notif;
  siteName: string | null;
  formId: string;
}) {
  const isUnread = !n.readAt;
  const kind = inferKind(n.kind);

  // Per-kind border/background hint
  const borderClasses = isUnread
    ? kind === "error"
      ? "border-danger/40 ring-1 ring-danger/10 bg-danger-tint/30"
      : kind === "ai_flag"
        ? "border-warning/40 ring-1 ring-warning/10 bg-warning-tint/30"
        : "border-accent/30 ring-1 ring-accent/10"
    : "border-border";

  return (
    <li className={cn("rounded-md border bg-surface p-4 transition-colors", borderClasses)}>
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          name="ids"
          value={n.id}
          form={formId}
          aria-label={`Select notification: ${n.title}`}
          className="mt-1.5 h-4 w-4 shrink-0 accent-accent"
        />
        <span
          className={cn(
            "mt-2 h-2 w-2 shrink-0 rounded-full",
            isUnread ? unreadDotColor(kind) : "bg-border-strong",
          )}
          aria-hidden
        />

        <div className="min-w-0 flex-1">
          {/* Top row: kind badge + site chip + time */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Pill tone={kindTone(kind)}>{kindLabel(kind, n.kind)}</Pill>
            {siteName ? (
              <Link
                href={`/admin/sites/${siteName}`}
                className="inline-flex items-center gap-1 rounded-sm border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-text-muted hover:bg-surface hover:text-text"
                title={`Site: ${siteName}`}
              >
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                  <circle cx="12" cy="12" r="10" />
                  <path d="M2 12h20M12 2a15 15 0 010 20M12 2a15 15 0 000 20" />
                </svg>
                {siteName}
              </Link>
            ) : null}
            <span className="text-text-faint">{formatRelative(n.createdAt)}</span>
          </div>

          {/* Title */}
          <h3 className="mt-1.5 text-sm font-medium leading-snug text-text">{n.title}</h3>

          {/* Body — pretty-formatted per kind */}
          {n.body ? <NotificationBody kind={kind} body={n.body} /> : null}

          {/* Footer — open link */}
          {n.link ? (
            <Link
              href={n.link}
              className={cn(
                "mt-3 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                kind === "booking"
                  ? "bg-accent text-brand-navy-deep hover:bg-accent/90"
                  : "text-accent hover:underline",
              )}
            >
              {kind === "booking" ? "Open booking →" : kind === "error" ? "Open error →" : "Open →"}
            </Link>
          ) : null}
        </div>

        {/* Side actions */}
        <div className="flex shrink-0 flex-col items-end gap-1.5 text-xs">
          {isUnread ? (
            <form action={markNotificationReadAction.bind(null, n.id)}>
              <button
                type="submit"
                className="rounded-sm border border-border px-2 py-1 text-text-muted hover:bg-surface-2 hover:text-text"
              >
                Mark read
              </button>
            </form>
          ) : null}
          <form action={deleteNotificationAction.bind(null, n.id)}>
            <button type="submit" className="text-danger hover:underline">
              Delete
            </button>
          </form>
        </div>
      </div>
    </li>
  );
}

function NotificationBody({ kind, body }: { kind: KindCategory; body: string }) {
  if (kind === "booking") {
    // Booking body is shaped:  <route>\n<pickup time + price>\n<contact line?>\n\n<source line>
    // Parse into structured rows so the visual hierarchy reads at a glance.
    const lines = body.split("\n").filter(Boolean);
    const route = lines[0];
    const pickup = lines[1];
    const contact = lines.find((l) => l.startsWith("Contact:"));
    const source = lines.find((l) => l.startsWith("From the"));
    return (
      <div className="mt-2 space-y-1 text-xs">
        {route ? <div className="text-text">{route}</div> : null}
        {pickup ? <div className="text-text-muted">{pickup}</div> : null}
        {contact ? (
          <div className="text-text-muted">
            <span className="text-text-faint">Contact: </span>
            <a href={`tel:${contact.replace("Contact:", "").trim()}`} className="font-mono text-accent hover:underline">
              {contact.replace("Contact:", "").trim()}
            </a>
          </div>
        ) : null}
        {source ? <div className="mt-1 text-xs text-text-faint">{source}</div> : null}
      </div>
    );
  }
  if (kind === "error") {
    // Error body: contextLines + blank + stack
    const parts = body.split("\n\n");
    const contextLines = parts[0];
    const stack = parts[1];
    return (
      <div className="mt-2 space-y-1.5 text-xs">
        {contextLines ? (
          <pre className="overflow-x-auto rounded-sm bg-surface-2 px-2 py-1 font-mono text-xs text-text-muted">
            {contextLines}
          </pre>
        ) : null}
        {stack ? (
          <details>
            <summary className="cursor-pointer text-xs text-text-faint hover:text-text">Stack trace</summary>
            <pre className="mt-1 max-h-40 overflow-auto rounded-sm bg-surface-2 px-2 py-1 font-mono text-xs text-text-faint">
              {stack}
            </pre>
          </details>
        ) : null}
      </div>
    );
  }
  // Default body — render Markdown. Digests are Markdown (## headings, ** bold,
  // - lists); previously this was printed raw, so "## Needs attention" and
  // "**…**" leaked as literal characters.
  return (
    <div
      className="notif-md mt-1.5 text-xs leading-relaxed text-text-muted"
      dangerouslySetInnerHTML={{ __html: markdownToHtml(body) }}
    />
  );
}

// ============================================================================
// Kind classification + visual tokens
// ============================================================================

type KindCategory = "booking" | "task" | "lead" | "ai_flag" | "daily_digest" | "error" | "health" | "system";

function inferKind(raw: string): KindCategory {
  if (raw === "quote_received" || raw === "reservation_received") return "booking";
  if (raw.startsWith("error:")) return "error";
  if (raw.startsWith("health_")) return "health";
  if (raw === "ai_flag") return "ai_flag";
  if (raw === "daily_digest") return "daily_digest";
  if (raw.startsWith("task_")) return "task";
  if (raw.startsWith("lead_")) return "lead";
  return "system";
}

function kindLabel(cat: KindCategory, raw: string): string {
  switch (cat) {
    case "booking":
      return raw === "quote_received" ? "Quote received" : "Reservation received";
    case "error": return "Error " + raw.replace("error:", "").slice(0, 12).toUpperCase();
    case "health": return raw.replace("health_", "Health · ");
    case "ai_flag": return "AI flag";
    case "daily_digest": return "Daily digest";
    case "task": return raw.replace("task_", "Task · ");
    case "lead": return raw.replace("lead_", "Lead · ");
    case "system": return raw.replace(/[:_]/g, " ");
  }
}

function kindTone(cat: KindCategory): "danger" | "warning" | "info" | "success" | "accent" | "neutral" {
  switch (cat) {
    case "booking": return "success";
    case "error":
    case "health": return "danger";
    case "ai_flag": return "warning";
    case "daily_digest": return "info";
    case "task": return "accent";
    case "lead": return "info";
    case "system": return "neutral";
  }
}

function unreadDotColor(cat: KindCategory): string {
  switch (cat) {
    case "booking": return "bg-success";
    case "error":
    case "health": return "bg-danger";
    case "ai_flag": return "bg-warning";
    case "daily_digest": return "bg-info";
    case "task": return "bg-accent";
    case "lead": return "bg-info";
    case "system": return "bg-accent";
  }
}
