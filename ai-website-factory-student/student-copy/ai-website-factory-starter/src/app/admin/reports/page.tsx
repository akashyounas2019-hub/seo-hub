import Link from "next/link";
import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import {
  aiUsage,
  leads,
  payments,
  quotes,
  reservations,
  seoActions,
  seoFindings,
  seoProposals,
  sites,
  trafficSnapshots,
} from "@/db/schema";
import { IconCard, IconChecklist, IconGlobe, IconInbox, IconSparkle } from "@/components/ui/Icon";
import { Pill, Row, RowList } from "@/components/ui/Row";
import { ScoreRing, SCORE_LABELS, SCORE_INVERSE } from "@/components/ui/ScoreRing";
import { AuditReportingScoutTabs } from "@/components/ui/AuditReportingScoutTabs";
import { formatMicroUsd } from "@/lib/ai-pricing";
import { getNetworkScores } from "@/lib/scoring";
import { requireAdmin } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

const DAY_MS = 24 * 3600_000;

export default async function ReportsPage() {
  await ensureSchema();
  await requireAdmin();
  const d = db();

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
  const startOfWeek = new Date(now.getTime() - 7 * DAY_MS);
  const startOfLastWeek = new Date(now.getTime() - 14 * DAY_MS);
  const endOfLastWeek = new Date(now.getTime() - 7 * DAY_MS);

  // ─── Lead totals: this week vs last week ─────────────────────────
  const [leadsThisArr, leadsLastArr] = await Promise.all([
    d.select({ n: sql<number>`count(*)::int` }).from(leads).where(gte(leads.createdAt, startOfWeek)),
    d.select({ n: sql<number>`count(*)::int` }).from(leads).where(and(gte(leads.createdAt, startOfLastWeek), lt(leads.createdAt, endOfLastWeek))),
  ]);
  const leadsThis = leadsThisArr[0];
  const leadsLast = leadsLastArr[0];

  // ─── Quote conversion ─────────────────────────────────────────────
  const [quoteStats] = await d
    .select({
      total: sql<number>`count(*)::int`,
      converted: sql<number>`count(*) filter (where ${quotes.status} = 'converted')::int`,
      pending: sql<number>`count(*) filter (where ${quotes.status} = 'pending')::int`,
      pipeline: sql<number>`coalesce(sum(coalesce(${quotes.quotedAmountCents}::bigint, ${quotes.estimatedAmountCents}::bigint, 0)) filter (where ${quotes.status} in ('pending','priced','sent','accepted')), 0)::bigint`,
    })
    .from(quotes)
    .where(gte(quotes.createdAt, startOfMonth));

  // ─── Revenue this month vs last ───────────────────────────────────
  const [revThis] = await d
    .select({ total: sql<number>`coalesce(sum(amount_cents::numeric), 0)::int` })
    .from(payments)
    .where(and(eq(payments.status, "succeeded"), gte(payments.receivedAt, startOfMonth)));
  const [revLast] = await d
    .select({ total: sql<number>`coalesce(sum(amount_cents::numeric), 0)::int` })
    .from(payments)
    .where(and(eq(payments.status, "succeeded"), gte(payments.receivedAt, startOfLastMonth), lt(payments.receivedAt, startOfMonth)));

  // ─── SEO autopilot — fixes applied this month + cost ─────────────
  const [seoMonth] = await d
    .select({
      fixes: sql<number>`count(*) filter (where ${seoActions.success} = true)::int`,
      failed: sql<number>`count(*) filter (where ${seoActions.success} = false)::int`,
    })
    .from(seoActions)
    .where(gte(seoActions.createdAt, startOfMonth));
  const [aiCost] = await d
    .select({ cost: sql<number>`coalesce(sum(${aiUsage.costMicroUsd}), 0)::bigint` })
    .from(aiUsage)
    .where(gte(aiUsage.createdAt, startOfMonth));

  // ─── Open SEO inbox ──────────────────────────────────────────────
  const [seoInbox] = await d
    .select({ n: sql<number>`count(*)::int` })
    .from(seoProposals)
    .where(eq(seoProposals.status, "pending"));

  // ─── Per-site report cards ───────────────────────────────────────
  const perSite = await d
    .select({
      siteId: sites.id,
      slug: sites.slug,
      name: sites.name,
      leadsCount: sql<number>`(select count(*)::int from leads where leads.site_id = sites.id and leads.created_at >= ${startOfMonth.toISOString()}::timestamptz)`,
      reservationsCount: sql<number>`(select count(*)::int from reservations where reservations.site_id = sites.id and reservations.created_at >= ${startOfMonth.toISOString()}::timestamptz)`,
      revenueCents: sql<number>`(select coalesce(sum(amount_cents::numeric), 0)::int from payments where payments.site_id = sites.id and payments.status = 'succeeded' and payments.received_at >= ${startOfMonth.toISOString()}::timestamptz)`,
      seoFixes: sql<number>`(select count(*)::int from seo_actions where seo_actions.site_id = sites.id and seo_actions.success = true and seo_actions.created_at >= ${startOfMonth.toISOString()}::timestamptz)`,
      openFindings: sql<number>`(select count(*)::int from seo_findings where seo_findings.site_id = sites.id and seo_findings.severity in ('high','critical') and seo_findings.created_at >= ${startOfMonth.toISOString()}::timestamptz)`,
    })
    .from(sites)
    .orderBy(sites.slug);

  // ─── Most-recent traffic snapshot per site for top queries → simple ranking signal ─
  const trafficLatest = await d
    .select({
      siteId: trafficSnapshots.siteId,
      snapshotDate: trafficSnapshots.snapshotDate,
      metrics: trafficSnapshots.metrics,
    })
    .from(trafficSnapshots)
    .where(eq(trafficSnapshots.source, "gsc"))
    .orderBy(desc(trafficSnapshots.snapshotDate))
    .limit(40);
  const latestBySite = new Map<string, (typeof trafficLatest)[number]>();
  for (const t of trafficLatest) if (!latestBySite.has(t.siteId)) latestBySite.set(t.siteId, t);

  // ─── Latest weekly snapshot — the real content behind the "Executive weekly"
  // report, surfaced inline so the page isn't just a wall of link cards. Same
  // data the Monday 06:00 cron renders into the PDF. ───
  const networkScores = await getNetworkScores();
  const hasNetworkScores = networkScores.some((s) => s.current !== null);

  const leadDelta = leadsLast?.n
    ? Math.round((((leadsThis?.n ?? 0) - leadsLast.n) / leadsLast.n) * 100)
    : null;
  const revDelta = revLast?.total
    ? Math.round((((revThis?.total ?? 0) - revLast.total) / revLast.total) * 100)
    : null;

  return (
    <div className="space-y-7">
      <header className="brand-rule">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-medium tracking-tightish text-text">Reports</h1>
            <p className="mt-1.5 text-xs text-text-muted">
              Unified network view — leads, revenue, SEO fixes, and the open inbox. Pre-built reports below, exports next.
            </p>
          </div>
          <span className="text-xs text-text-faint">
            {now.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
          </span>
        </div>
      </header>

      <AuditReportingScoutTabs />

      {/* ── Top stat strip ── */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <BigStat
          label="Leads · 7d"
          value={(leadsThis?.n ?? 0).toLocaleString()}
          delta={leadDelta !== null ? `${leadDelta >= 0 ? "+" : ""}${leadDelta}%` : undefined}
          deltaTone={leadDelta !== null ? (leadDelta >= 0 ? "up" : "down") : "neutral"}
          icon={<IconInbox size={16} />}
        />
        <BigStat
          label="Revenue · MTD"
          value={`$${Math.round((revThis?.total ?? 0) / 100).toLocaleString()}`}
          delta={revDelta !== null ? `${revDelta >= 0 ? "+" : ""}${revDelta}%` : undefined}
          deltaTone={revDelta !== null ? (revDelta >= 0 ? "up" : "down") : "neutral"}
          icon={<IconCard size={16} />}
        />
        <BigStat
          label="SEO fixes · MTD"
          value={(seoMonth?.fixes ?? 0).toLocaleString()}
          icon={<IconSparkle size={16} />}
        />
        <BigStat
          label="AI spend · MTD"
          value={formatMicroUsd(Number(aiCost?.cost ?? 0))}
          icon={<IconChecklist size={16} />}
        />
      </section>

      {/* ── Latest weekly snapshot — real section content from the live data ── */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-base font-medium text-text">Latest weekly snapshot</h2>
          <Link href="/admin/reports/weekly" className="text-xs font-medium text-accent hover:underline">
            Full executive report →
          </Link>
        </div>
        {hasNetworkScores ? (
          <div className="rounded-xl border border-border bg-surface px-5 py-4">
            <p className="mb-3 text-xs text-text-faint">
              Network composite, six dimensions, 0–100. Trend = vs. 7 days ago — same numbers the Monday report ships.
            </p>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
              {networkScores.map((s) => (
                <ScoreRing
                  key={s.key}
                  label={SCORE_LABELS[s.key]}
                  value={s.current}
                  delta={s.delta}
                  size="sm"
                  inverse={!!SCORE_INVERSE[s.key]}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border-strong bg-surface px-5 py-6">
            <p className="text-sm font-medium text-text">No weekly snapshot generated yet</p>
            <p className="mt-1 max-w-[64ch] text-xs leading-relaxed text-text-muted">
              Composite scores populate once the daily scoring job has run for a few days — it needs at least two
              snapshots to draw a week-over-week trend. The executive PDF and report history aren&rsquo;t archived in
              the database yet; for now every report below opens its live page, and the Telegram digest goes out
              Mondays at 07:00 UTC.
            </p>
          </div>
        )}
      </section>

      {/* ── Pre-built report cards ── */}
      <section className="space-y-3">
        <h2 className="text-base font-medium text-text">Pre-built reports</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <ReportCard
            title="Executive weekly"
            description="Network composite scores, biggest movers, hot/cold sites — auto-PDF Monday 06:00."
            href="/admin/reports/weekly"
            cadence="Mondays 06:00"
            tone="accent"
          />
          <ReportCard
            title="Weekly SEO digest"
            description="Ranking gainers + losers per site, week-over-week."
            href="/admin/seo"
            cadence="Mondays 07:00"
            tone="accent"
          />
          <ReportCard
            title="Keyword coverage"
            description="Tracked keywords, ranking movement, and content gaps per site."
            href="/admin/keywords"
            cadence="Live"
            tone="info"
          />
          <ReportCard
            title="Indexing coverage"
            description="Pages submitted vs. indexed, with reasons for anything excluded."
            href="/admin/indexing"
            cadence="Live"
            tone="success"
          />
          <ReportCard
            title="Network health"
            description="Plugin heartbeat, CWV, technical errors, security headers."
            href="/admin/sites"
            cadence="Live"
            tone="warning"
          />
          <ReportCard
            title="SEO autopilot inbox"
            description={`${seoInbox?.n ?? 0} pending proposal${(seoInbox?.n ?? 0) === 1 ? "" : "s"} awaiting approval.`}
            href="/admin/seo"
            cadence="Live"
            tone="accent"
          />
          <ReportCard
            title="Monthly client PDF"
            description="Branded PDF per site for client deliverables. Export coming next phase."
            href="#"
            cadence="Coming soon"
            tone="neutral"
            disabled
          />
        </div>
      </section>

      {/* ── Per-site rollup table ── */}
      <section className="space-y-3">
        <h2 className="text-base font-medium text-text">Per-site rollup · this month</h2>
        <RowList footer={`${perSite.length} site${perSite.length === 1 ? "" : "s"}`}>
          {perSite.map((s) => {
            const latest = latestBySite.get(s.siteId);
            const lastPosition = latest?.metrics?.avg_position ?? null;
            return (
              <Row key={s.siteId} href={`/admin/sites/${s.slug}`}>
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-sm bg-brand-navy text-xs font-semibold uppercase tracking-wider text-brand-champagne">
                  <IconGlobe size={11} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="truncate text-sm font-medium text-text">{s.name}</span>
                    <span className="font-mono text-xs text-text-faint">{s.slug}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-text-faint">
                    {s.leadsCount} leads · {s.reservationsCount} reservations · ${Math.round(s.revenueCents / 100).toLocaleString()} revenue
                  </div>
                </div>
                {s.openFindings > 0 ? (
                  <Pill tone="warning">{s.openFindings} high-sev SEO</Pill>
                ) : null}
                {s.seoFixes > 0 ? (
                  <Pill tone="success">{s.seoFixes} fixes</Pill>
                ) : null}
                <span className="tnum w-20 text-right text-xs text-text-faint">
                  {lastPosition !== null ? `pos ${Number(lastPosition).toFixed(1)}` : "no GSC"}
                </span>
              </Row>
            );
          })}
        </RowList>
      </section>

      <p className="text-xs text-text-faint">
        PDF + scheduled email export ships in the next phase. For now every report links to its live page. The weekly Telegram digest is already running on Mondays at 07:00 UTC via the gyl-cron container.
      </p>
    </div>
  );
}

function BigStat({
  label,
  value,
  delta,
  deltaTone,
  icon,
}: {
  label: string;
  value: string;
  delta?: string;
  deltaTone?: "up" | "down" | "neutral";
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-3 shadow-xs">
      <div className="flex items-center justify-between gap-2 text-text-faint">
        <span className="text-xs uppercase tracking-[0.06em]">{label}</span>
        {icon ? <span className="text-text-faint">{icon}</span> : null}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl font-medium tabular-nums text-text">{value}</span>
        {delta ? (
          <span className={`text-xs font-medium ${deltaTone === "up" ? "text-success" : deltaTone === "down" ? "text-danger" : "text-text-faint"}`}>
            {delta}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function ReportCard({
  title,
  description,
  href,
  cadence,
  tone,
  disabled,
}: {
  title: string;
  description: string;
  href: string;
  cadence: string;
  tone: "accent" | "info" | "success" | "warning" | "neutral";
  disabled?: boolean;
}) {
  const dotColor =
    tone === "accent" ? "var(--accent)"
    : tone === "info" ? "var(--info)"
    : tone === "success" ? "var(--success)"
    : tone === "warning" ? "var(--warning)"
    : "var(--text-faint)";
  const inner = (
    <div
      className={`group relative h-full overflow-hidden rounded-xl border border-border p-4 transition-[border-color,background] hover:border-border-strong ${disabled ? "opacity-60" : ""}`}
      style={{ background: "linear-gradient(180deg, var(--surface), var(--surface-2))" }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-3 top-0 h-px"
        style={{ background: "linear-gradient(90deg, transparent, var(--border-strong), transparent)" }}
      />
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: dotColor }} aria-hidden />
          <span className="text-base font-medium text-text">{title}</span>
        </div>
        <span className="text-xs uppercase tracking-[0.08em] text-text-faint">{cadence}</span>
      </div>
      <p className="mt-2 flex-1 text-xs text-text-muted leading-snug">{description}</p>
      {!disabled ? (
        <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-accent group-hover:underline">
          Open →
        </span>
      ) : (
        <span className="mt-3 inline-block text-xs text-text-faint">Not available</span>
      )}
    </div>
  );
  if (disabled) return inner;
  return <Link href={href}>{inner}</Link>;
}
