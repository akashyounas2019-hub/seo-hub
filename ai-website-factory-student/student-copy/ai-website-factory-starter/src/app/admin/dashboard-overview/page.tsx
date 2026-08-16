import Link from "next/link";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { integrationsAccounts, leads, events, notifications, orgSettings, sites, tasks } from "@/db/schema";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pill, Row, RowList, StatusDot } from "@/components/ui/Row";
import { Stat, StatStrip } from "@/components/ui/Stat";
import { Sparkline } from "@/components/ui/Sparkline";
import { requireUser } from "@/lib/server-auth";
import { formatRelative } from "@/lib/utils";
import {
  ga4Aggregate,
  gscAggregate,
  isValidCompareMode,
  isValidRange,
  type CompareMode,
  type RangeId,
} from "@/lib/dashboard-traffic";
import { GscWidget, Ga4Widget } from "./TrafficWidgets";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams = {},
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  await ensureSchema();
  const user = await requireUser();
  const d = db();

  // Parse widget filters from URL. Each widget has its own range + compare so
  // the operator can look at GSC for 3 months vs previous year while GA4 is
  // pinned to last 7 days.
  const gscRangeRaw = Array.isArray(searchParams.gscRange) ? searchParams.gscRange[0] : searchParams.gscRange;
  const gscCompareRaw = Array.isArray(searchParams.gscCompare) ? searchParams.gscCompare[0] : searchParams.gscCompare;
  const ga4RangeRaw = Array.isArray(searchParams.ga4Range) ? searchParams.ga4Range[0] : searchParams.ga4Range;
  const ga4CompareRaw = Array.isArray(searchParams.ga4Compare) ? searchParams.ga4Compare[0] : searchParams.ga4Compare;

  const gscRange: RangeId = isValidRange(gscRangeRaw) ? gscRangeRaw : "28d";
  const gscCompare: CompareMode = isValidCompareMode(gscCompareRaw) ? gscCompareRaw : "period";
  const ga4Range: RangeId = isValidRange(ga4RangeRaw) ? ga4RangeRaw : "28d";
  const ga4Compare: CompareMode = isValidCompareMode(ga4CompareRaw) ? ga4CompareRaw : "period";

  // ── System metrics ──
  const allSites = await d.select().from(sites);
  const totalSites = allSites.length;

  let totalLeads = 0;
  let recentLeads: { name: string | null; email: string | null; createdAt: Date }[] = [];
  try {
    const leadCount = await d.select({ count: sql<number>`count(*)::int` }).from(leads);
    totalLeads = leadCount[0]?.count ?? 0;
    recentLeads = await d
      .select({ name: leads.name, email: leads.email, createdAt: leads.createdAt })
      .from(leads)
      .orderBy(desc(leads.createdAt))
      .limit(5);
  } catch { /* leads table may not exist yet */ }

  let totalEvents = 0;
  try {
    const eventCount = await d.select({ count: sql<number>`count(*)::int` }).from(events);
    totalEvents = eventCount[0]?.count ?? 0;
  } catch { /* events table may not exist yet */ }

  // ── User tasks ──
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

  // ── Notifications ──
  const [unread] = await d
    .select({ n: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.recipientId, user.id), sql`${notifications.readAt} is null`));

  // ── 14-day completed sparkline ──
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
      const dt = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      dt.setHours(0, 0, 0, 0);
      out.push(dt.toISOString().slice(0, 10));
    }
    return out;
  };
  const completedMap = new Map(completedRows.map((r) => [r.day, r.n]));
  const sparkCompleted = lastNDays(14).map((day) => completedMap.get(day) ?? 0);
  const completed14d = sparkCompleted.reduce((s, n) => s + n, 0);

  // ── GSC + GA4 aggregates — each widget owns its own time window ──
  //
  // The library returns primary + compared totals and a daily sparkline sized
  // to the selected range. Region filter (UAE only) is baked into the syncs,
  // so no extra WHERE here.
  const [gscData, ga4Data] = await Promise.all([
    gscAggregate(gscRange, gscCompare),
    ga4Aggregate(ga4Range, ga4Compare),
  ]);

  // ── Integration diagnostics — name the exact gap when there's no data ──
  //
  // Three states dashboard cares about:
  //   1) No org OAuth credentials → send admin to /admin/settings.
  //   2) Credentials exist but no site is connected → send admin to /admin/sites.
  //   3) At least one site is connected → send admin to that site page so
  //      they can click "Sync now" (or point them at the CLI).
  const [orgRow, googleAccounts] = await Promise.all([
    d
      .select({ hasClientId: sql<boolean>`(${orgSettings.googleOauthClientId} is not null)` })
      .from(orgSettings)
      .where(eq(orgSettings.id, "singleton"))
      .limit(1),
    d
      .select({
        siteSlug: sites.slug,
        siteName: sites.name,
        propertyIdRaw: sql<string | null>`(${integrationsAccounts.metadata}->>'ga4_property_id')`,
        lastSyncAt: integrationsAccounts.lastSyncAt,
        lastSyncStatus: integrationsAccounts.lastSyncStatus,
        lastSyncError: integrationsAccounts.lastSyncError,
      })
      .from(integrationsAccounts)
      .innerJoin(sites, eq(sites.id, integrationsAccounts.siteId))
      .where(eq(integrationsAccounts.provider, "google"))
      .orderBy(sites.slug),
  ]);

  const hasCreds = orgRow[0]?.hasClientId ?? false;
  const connectedCount = googleAccounts.length;
  const firstConnected = googleAccounts[0] ?? null;
  const sitesWithGa4PropertyId = googleAccounts.filter((a) => a.propertyIdRaw).length;

  function diagnoseGsc() {
    return diagnose({
      hasCreds,
      connectedCount,
      hasData: gscData.hasData,
      firstConnectedSlug: firstConnected?.siteSlug ?? null,
      source: "gsc",
      lastSyncAt: firstConnected?.lastSyncAt ?? null,
      lastSyncStatus: firstConnected?.lastSyncStatus ?? null,
      lastSyncError: firstConnected?.lastSyncError ?? null,
    });
  }
  function diagnoseGa4() {
    return diagnose({
      hasCreds,
      connectedCount,
      hasData: ga4Data.hasData,
      firstConnectedSlug: firstConnected?.siteSlug ?? null,
      source: "ga4",
      needsPropertyId: sitesWithGa4PropertyId === 0,
      lastSyncAt: firstConnected?.lastSyncAt ?? null,
      lastSyncStatus: firstConnected?.lastSyncStatus ?? null,
      lastSyncError: firstConnected?.lastSyncError ?? null,
    });
  }

  const firstName = (user.name ?? user.email.split("@")[0]).split(" ")[0];

  const metrics = [
    { label: "Active Sites", value: String(totalSites), color: "var(--info)", tint: "var(--info-tint)" },
    { label: "Total Leads", value: String(totalLeads), color: "var(--success)", tint: "var(--success-tint)" },
    { label: "Total Events", value: String(totalEvents), color: "var(--accent)", tint: "var(--accent-tint)" },
    { label: "Open Tasks", value: String(myTasks.length), color: "var(--warning)", tint: "var(--warning-tint)" },
  ];

  const agents = [
    { name: "Keyword Scout", status: "live", color: "var(--success)" },
    { name: "GMB Guardian", status: "live", color: "var(--success)" },
    { name: "Tech Watchdog", status: "alert", color: "var(--warning)" },
    { name: "Heatmap Agent", status: "live", color: "var(--success)" },
    { name: "Alert Manager", status: "live", color: "var(--success)" },
    { name: "Cold Auditor", status: "ready", color: "var(--text-faint)" },
  ];

  const quickActions = [
    { label: "Keyword Scout", href: "/admin/keywords", desc: "Research keywords from GSC or manual upload" },
    { label: "Content Studio", href: "/admin/content-studio", desc: "AI-write SEO pages via Mac worker" },
    { label: "Cold Audit", href: "/admin/cold-audit", desc: "Quick SEO audit on any prospect URL" },
    { label: "Tech Watchdog", href: "/admin/tech-watchdog", desc: "PageSpeed & Core Web Vitals monitor" },
    { label: "GMB Hub", href: "/admin/local", desc: "Reviews, posts, and local SEO tools" },
    { label: "Competitor Spy", href: "/admin/competitors", desc: "Head-to-head SEO comparison" },
  ];

  return (
    <div className="space-y-7">
      <PageHeader
        title={`Hey ${firstName}`}
        subtitle={
          overdue.length > 0
            ? `You have ${overdue.length} overdue task${overdue.length === 1 ? "" : "s"} — start here.`
            : dueToday.length > 0
              ? `${dueToday.length} task${dueToday.length === 1 ? "" : "s"} due today. System overview below.`
              : myTasks.length > 0
                ? "Nothing overdue. System overview and open tasks below."
                : "You're caught up. System overview below."
        }
      />

      {/* ── Traffic widgets: 8 metric cards total, two visually-distinct sections ── */}
      <div className="grid gap-4 xl:grid-cols-2">
        <GscWidget
          data={gscData}
          currentRange={gscRange}
          currentCompare={gscCompare}
          currentParams={searchParams}
          diagnostics={diagnoseGsc()}
        />
        <Ga4Widget
          data={ga4Data}
          currentRange={ga4Range}
          currentCompare={ga4Compare}
          currentParams={searchParams}
          diagnostics={diagnoseGa4()}
        />
      </div>

      {/* ── KPI strip (from Overview) ── */}
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

      {/* ── System metrics ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {metrics.map((m) => (
          <div
            key={m.label}
            className="relative overflow-hidden rounded-lg border border-border bg-surface p-4"
          >
            <div
              className="absolute left-0 top-0 h-[3px] w-full"
              style={{ background: m.color }}
            />
            <p className="text-xs font-medium uppercase tracking-wide text-text-faint">
              {m.label}
            </p>
            <p className="mt-1 text-2xl font-bold tracking-tight text-text">
              {m.value}
            </p>
          </div>
        ))}
      </div>

      {/* ── Overdue tasks (from Overview) ── */}
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

      {/* ── Due today (from Overview) ── */}
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

      {myTasks.length === 0 ? (
        <EmptyState
          glyph="tasks"
          title="No tasks assigned"
          description="No open tasks right now. Use the quick actions below to get started."
        />
      ) : null}

      {/* ── Two-column: Agent status + Recent leads ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text">Agent Status</h2>
            <span className="rounded-full bg-success-tint px-2 py-0.5 text-[10px] font-semibold text-success">
              {agents.filter((a) => a.status === "live").length} live
            </span>
          </div>
          <div className="space-y-2">
            {agents.map((a) => (
              <div key={a.name} className="flex items-center gap-3 rounded-md bg-surface-2 px-3 py-2">
                <span className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: a.color }} />
                <span className="flex-1 text-xs font-medium text-text-muted">{a.name}</span>
                <span className="text-[10px] text-text-faint">{a.status}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text">Recent Leads</h2>
            <span className="rounded-full bg-info-tint px-2 py-0.5 text-[10px] font-semibold text-info">
              {totalLeads} total
            </span>
          </div>
          {recentLeads.length > 0 ? (
            <div className="space-y-2">
              {recentLeads.map((l, i) => (
                <div key={i} className="flex items-center justify-between rounded-md bg-surface-2 px-3 py-2">
                  <div>
                    <p className="text-xs font-medium text-text">{l.name || "Unknown"}</p>
                    <p className="text-[10px] text-text-faint">{l.email || "—"}</p>
                  </div>
                  <span className="text-[10px] text-text-faint">
                    {l.createdAt.toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-6 text-center text-xs text-text-faint">
              No leads yet — connect your WordPress sites to start capturing.
            </p>
          )}
        </div>
      </div>

      {/* ── Quick actions ── */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-text">Quick Actions</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {quickActions.map((qa) => (
            <Link
              key={qa.label}
              href={qa.href}
              className="group rounded-lg border border-border bg-surface p-4 transition-colors hover:border-border-strong hover:bg-surface-2"
            >
              <p className="text-sm font-semibold text-text group-hover:text-accent">{qa.label}</p>
              <p className="mt-1 text-xs text-text-faint">{qa.desc}</p>
            </Link>
          ))}
        </div>
      </div>

      {/* ── Connected sites ── */}
      {totalSites > 0 ? (
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text">Connected Sites</h2>
            <Link href="/admin/sites" className="text-xs font-medium text-accent hover:text-accent-hover">
              View all →
            </Link>
          </div>
          <div className="space-y-2">
            {allSites.slice(0, 8).map((s) => (
              <Link
                key={s.id}
                href={`/admin/sites/${s.slug}`}
                className="flex items-center justify-between rounded-md bg-surface-2 px-3 py-2 transition-colors hover:bg-surface-3"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-tint text-[10px] font-bold text-accent">
                    {(s.name || s.slug)?.[0]?.toUpperCase() || "?"}
                  </span>
                  <div>
                    <p className="text-xs font-medium text-text">{s.name || s.slug}</p>
                    <p className="text-[10px] text-text-faint">{s.domain || "—"}</p>
                  </div>
                </div>
                <span className="rounded-full bg-success-tint px-2 py-0.5 text-[10px] font-semibold text-success">
                  Active
                </span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ─────────── GSC / GA4 diagnostics ─────────── */

type ChannelDiagnostics = {
  /** Which step in the pipeline is broken. Each step maps to a fix path. */
  step: "no-creds" | "no-connection" | "no-property-id" | "never-synced" | "sync-error" | "empty";
  message: string;
  hint: string;
  ctaHref: string;
  ctaLabel: string;
  /** Optional secondary link (e.g. CLI reminder). */
  secondaryHint?: string;
};

/**
 * Picks the right diagnostic message + CTA for a channel based on which step
 * of the pipeline has no data yet. Kept as a plain function so it's easy to
 * follow the branch that fired.
 */
function diagnose(opts: {
  hasCreds: boolean;
  connectedCount: number;
  hasData: boolean;
  firstConnectedSlug: string | null;
  source: "gsc" | "ga4";
  needsPropertyId?: boolean;
  lastSyncAt: Date | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
}): ChannelDiagnostics {
  const cliCmd = opts.source === "gsc" ? "npm run sync:gsc" : "npm run sync:ga4";

  if (!opts.hasCreds) {
    return {
      step: "no-creds",
      message: "Google OAuth is not configured yet.",
      hint: "Add the client ID + secret from your Google Cloud project so sites can connect.",
      ctaHref: "/admin/settings?section=integrations",
      ctaLabel: "Open Google settings",
    };
  }
  if (opts.connectedCount === 0) {
    return {
      step: "no-connection",
      message: "No site has authorized Google yet.",
      hint:
        "Adding a site to the network is only step 1. Open the site page and click the Connect Google button — that runs the OAuth consent screen and stores the access token needed for Search Console + Analytics reads.",
      ctaHref: "/admin/sites",
      ctaLabel: "Open a site to authorize Google",
      secondaryHint:
        "Not sure whether Connect Google actually completed? Open /admin/settings/integrations-debug to see the raw connection state.",
    };
  }
  if (opts.source === "ga4" && opts.needsPropertyId) {
    return {
      step: "no-property-id",
      message: "Connected — but no site has a GA4 property_id yet.",
      hint: "Open a connected site and set its GA4 property_id (e.g. 312345678) under Integrations, then Sync GA4.",
      ctaHref: opts.firstConnectedSlug ? `/admin/sites/${opts.firstConnectedSlug}` : "/admin/sites",
      ctaLabel: "Set GA4 property_id",
    };
  }
  if (opts.lastSyncStatus === "error" && opts.lastSyncError) {
    return {
      step: "sync-error",
      message: `Last sync failed: ${opts.lastSyncError.slice(0, 120)}`,
      hint: "Fix the underlying issue (property verification, scope), then retry from the site page.",
      ctaHref: opts.firstConnectedSlug ? `/admin/sites/${opts.firstConnectedSlug}` : "/admin/sites",
      ctaLabel: "Open site to retry",
      secondaryHint: `Or from the terminal: \`${cliCmd}\`.`,
    };
  }
  if (!opts.lastSyncAt) {
    return {
      step: "never-synced",
      message: "Connected — but no sync has run yet.",
      hint: `Open the site page and click Sync ${opts.source.toUpperCase()} now to pull the last 28 days.`,
      ctaHref: opts.firstConnectedSlug ? `/admin/sites/${opts.firstConnectedSlug}` : "/admin/sites",
      // Was "Sync ${source} now" — that's a lie, this link only opens the site
      // page. The actual sync button lives there. Rename to reflect what
      // clicking actually does.
      ctaLabel: "Open connected site",
      secondaryHint: `Or from the terminal: \`${cliCmd}\`. Cron: 04:${opts.source === "gsc" ? "00" : "10"} UTC daily.`,
    };
  }
  return {
    step: "empty",
    message: "Sync ran, but no rows for the last 28 days.",
    hint:
      opts.source === "gsc"
        ? "Search Console has a 2–3 day delay, and low-traffic properties can return zero rows."
        : "GA4 excludes very-low-traffic days by default. Check the property has activity in the last 28 days.",
    ctaHref: opts.firstConnectedSlug ? `/admin/sites/${opts.firstConnectedSlug}` : "/admin/sites",
    ctaLabel: "Open connected site",
  };
}

function ChannelSummaryCard({ card }: { card: ChannelCard }) {
  const deltaColor =
    card.delta == null
      ? "text-text-faint"
      : card.delta > 0
        ? "text-success"
        : card.delta < 0
          ? "text-danger"
          : "text-text-faint";
  const deltaSign = card.delta != null && card.delta > 0 ? "+" : "";
  return (
    <div className="rounded-lg border border-border bg-surface-2 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-text-faint">
        {card.label}
      </p>
      <p className="mt-1 text-xl font-semibold tabular-nums leading-tight text-text">
        {card.value}
      </p>
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className={`text-[11px] tabular-nums ${deltaColor}`}>
          {card.delta != null ? `${deltaSign}${card.delta.toFixed(1)}% vs prior 28d` : card.hint ?? " "}
        </span>
        {card.spark && card.spark.length > 0 ? (
          <span className="ml-auto h-6 w-16 sm:w-20">
            <Sparkline data={card.spark} stroke={card.sparkColor ?? "var(--accent)"} />
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** Percentage change of `current` vs `prev`. Returns null when prev is 0. */
function pctDelta(current: number, prev: number): number | null {
  if (!prev) return null;
  return ((current - prev) / prev) * 100;
}
