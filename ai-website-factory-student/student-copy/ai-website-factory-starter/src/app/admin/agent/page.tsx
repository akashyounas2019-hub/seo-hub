/**
 * Agent Mission Control — the single page that answers:
 *   "Where is the agent? What is it doing? How do I give it work?"
 *
 * One page, four sections:
 *   1. How the agent works (plain English)
 *   2. Awaiting your review (counts + open buttons)
 *   3. Send work to the agent (delegate UI — buttons routed to the right
 *      existing flows)
 *   4. What ran in the last 24h + schedule
 */
import Link from "next/link";
import { desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import {
  agentTasks,
  aiUsage,
  contentBriefs,
  qaChecks,
  qaRuns,
  seoActions,
  seoProposals,
  siteScreenshots,
  sitePatterns,
  sites,
} from "@/db/schema";
import { Pill, Row, RowList } from "@/components/ui/Row";
import { formatMicroUsd } from "@/lib/ai-pricing";
import { requireAdmin } from "@/lib/server-auth";
import { formatRelative } from "@/lib/utils";

export const dynamic = "force-dynamic";

const DAY_MS = 24 * 3600_000;

export default async function AgentMissionControlPage() {
  await ensureSchema();
  await requireAdmin();
  const d = db();
  const now = new Date();
  const dayAgo = new Date(now.getTime() - DAY_MS);
  const monthAgo = new Date(now.getTime() - 30 * DAY_MS);

  // ─── Counts: what's awaiting review ─────────────────────────────────
  const [pendingProposals] = await d
    .select({ n: sql<number>`count(*)::int` })
    .from(seoProposals)
    .where(eq(seoProposals.status, "pending"));

  const [openPatterns] = await d
    .select({ n: sql<number>`count(*)::int` })
    .from(sitePatterns)
    .where(eq(sitePatterns.status, "open"));

  const [proposedAgentTasks] = await d
    .select({ n: sql<number>`count(*)::int` })
    .from(agentTasks)
    .where(eq(agentTasks.status, "proposed"));

  const [briefsInReview] = await d
    .select({ n: sql<number>`count(*) filter (where ${contentBriefs.status} in ('drafting','review'))::int` })
    .from(contentBriefs);

  const [flaggedScreenshots] = await d
    .select({ n: sql<number>`count(*) filter (where ${siteScreenshots.status} in ('changed','major_change') and ${siteScreenshots.reviewed} = false)::int` })
    .from(siteScreenshots);

  const [openQaFails] = await d
    .select({ n: sql<number>`count(*) filter (where status = 'fail' and suppressed = false and ${qaChecks.severity} in ('high','critical'))::int` })
    .from(qaChecks)
    .where(gte(qaChecks.createdAt, dayAgo));

  // ─── Activity feed (last 24h) ───────────────────────────────────────
  const recentActions = await d
    .select({
      id: seoActions.id,
      kind: seoActions.kind,
      success: seoActions.success,
      siteId: seoActions.siteId,
      siteSlug: sites.slug,
      siteName: sites.name,
      createdAt: seoActions.createdAt,
      pluginResponse: seoActions.pluginResponse,
      errorMessage: seoActions.errorMessage,
    })
    .from(seoActions)
    .innerJoin(sites, eq(sites.id, seoActions.siteId))
    .where(gte(seoActions.createdAt, dayAgo))
    .orderBy(desc(seoActions.createdAt))
    .limit(12);

  // Collapse consecutive identical actions (same kind + site + outcome) so a
  // stuck retry loop shows as a single row with a ×N count instead of flooding
  // the feed with eight identical "post-not-found" lines.
  const activityRows = recentActions.reduce<
    Array<(typeof recentActions)[number] & { count: number }>
  >((acc, a) => {
    const prev = acc[acc.length - 1];
    if (
      prev &&
      prev.kind === a.kind &&
      prev.siteId === a.siteId &&
      prev.success === a.success &&
      (prev.errorMessage ?? "") === (a.errorMessage ?? "")
    ) {
      prev.count += 1;
    } else {
      acc.push({ ...a, count: 1 });
    }
    return acc;
  }, []);

  // ─── Cost MTD ───────────────────────────────────────────────────────
  const [costMtd] = await d
    .select({ cost: sql<number>`coalesce(sum(${aiUsage.costMicroUsd}), 0)::bigint` })
    .from(aiUsage)
    .where(gte(aiUsage.createdAt, monthAgo));

  // ─── Sites under management ────────────────────────────────────────
  const allSites = await d.select({ id: sites.id, slug: sites.slug, name: sites.name }).from(sites);

  return (
    <div className="mx-auto max-w-[1080px] space-y-10">
      {/* Hero · typography lead, restrained */}
      <section className="flex items-end justify-between gap-6 pt-2">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-text-faint">Agent</p>
          <h1 className="max-w-[28ch] text-3xl font-medium tracking-tightish text-text">
            Direct your AI agent. See what it&apos;s done.
          </h1>
          <p className="max-w-[60ch] text-md text-text-muted">
            Your agent monitors <strong className="text-text">{allSites.length} site{allSites.length === 1 ? "" : "s"}</strong> around the clock. This is the single page where you give it work and review what it produces.
          </p>
        </div>
        <div className="shrink-0 rounded-md border border-border bg-surface px-4 py-3 text-right">
          <p className="text-xs uppercase tracking-[0.08em] text-text-faint">Spend · MTD</p>
          <p className="mt-1 font-medium tnum text-2xl leading-none text-text">{formatMicroUsd(Number(costMtd?.cost ?? 0))}</p>
        </div>
      </section>

      {/* Awaiting review — surface card, no accent-tint background */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-medium text-text">Awaiting your review</h2>
          <span className="text-xs text-text-faint">Click any number to act</span>
        </div>
        {/* Two rows of 3 tiles each — leaves room to BREATHE; numbers + meaning on the left */}
        <div className="grid grid-cols-1 divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-3">
          <ReviewTile
            href="/admin/agent/qa"
            count={openQaFails?.n ?? 0}
            label="QA failures"
            description="UI / layout / form failures across viewports"
            tone="warning"
          />
          <ReviewTile
            href="/admin/seo"
            count={pendingProposals?.n ?? 0}
            label="SEO proposals"
            description="Fixes the agent wants to apply"
            tone="accent"
          />
          <ReviewTile
            href="/admin/patterns"
            count={openPatterns?.n ?? 0}
            label="Network patterns"
            description="Cross-site signals + suggested tasks"
            tone="warning"
          />
          <ReviewTile
            href="/admin/seo/sample-review"
            count={proposedAgentTasks?.n ?? 0}
            label="Agent tasks"
            description="AI-proposed work to accept or dismiss"
            tone="info"
          />
          <ReviewTile
            href="/admin/screenshots?tab=changes"
            count={flaggedScreenshots?.n ?? 0}
            label="Visual changes"
            description="Sites whose look shifted overnight"
            tone="warning"
          />
          <ReviewTile
            href="/admin/content"
            count={briefsInReview?.n ?? 0}
            label="Content in review"
            description="Drafts ready for your edit/approval"
            tone="info"
          />
        </div>
      </section>

      {/* Send work to the agent — typography lead, no big card */}
      <section className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-medium text-text">Send work to the agent</h2>
          <span className="text-xs text-text-faint">Routed to the right worker automatically</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <DelegateCard
            href="/admin/build/new"
            title="Build a new website"
            description="End-to-end: global design research → Design DNA → sitemap → pages with schema + AI-Overview content → QA → deploy to WordPress. Runs on your Claude subscription."
            ctaLabel="Start build →"
            emphasis
          />
          <DelegateCard
            href="/admin/agent/jobs/new"
            title="Send a deep job to Claude Code"
            description="Heavy audits, competitor research, long-form drafts — runs on your Mac via Claude Code, not on the API budget."
            ctaLabel="New Claude job →"
          />
          <DelegateCard
            href="/admin/agent/qa"
            title="Test a site (QA Suite)"
            description="Multi-viewport UI + functional testing. Catches text overflow, broken buttons, form failures, missing industry conventions."
            ctaLabel="Open QA Suite →"
          />
          <DelegateCard
            href="/admin/sites"
            title="Audit a specific site"
            description="Open any site → click 'Agent panel' for per-site capabilities + 'Run now' triggers."
            ctaLabel="Open sites →"
          />
          <DelegateCard
            href="/admin/content/new"
            title="Draft new content"
            description="Write a brief; the agent drafts the post in your tone, you approve, it publishes to WP."
            ctaLabel="New content brief →"
            emphasis
          />
          <DelegateCard
            href="/admin/sites/brand"
            title="Refresh brand themes"
            description="Re-extract every site's brand palette + fonts so widgets match each site."
            ctaLabel="Open brand console →"
          />
          <DelegateCard
            href="/admin/seo"
            title="Approve pending SEO fixes"
            description="The agent's inbox of proposed fixes — alt text, meta titles, schema, content gaps."
            ctaLabel="Open SEO inbox →"
          />
          <DelegateCard
            href="/admin/indexing"
            title="Check indexing coverage"
            description="See which pages Google has indexed and which still need a push."
            ctaLabel="Open Indexing →"
          />
          <DelegateCard
            href="/admin/prompts"
            title="Tune the agent's voice"
            description="Edit the prompts the agent uses for titles, descriptions, content drafts."
            ctaLabel="Open prompts →"
          />
        </div>
      </section>

      {/* ──────────── 3. RECENT ACTIVITY (24h) ──────────── */}
      <section className="rounded-xl border border-border bg-surface p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-medium text-text">Agent activity (last 24 h)</h2>
          <Link href="/admin/reports" className="text-xs text-accent hover:underline">
            See all reports →
          </Link>
        </div>
        {recentActions.length === 0 ? (
          <p className="mt-2 text-xs text-text-faint">
            No actions in the last 24 hours. The agent runs scans nightly at 03:00 UTC; if you just deployed, give it a day.
          </p>
        ) : (
          <RowList>
            {activityRows.map((a) => {
              const tone = a.success ? "success" : "danger";
              const rawSummary = a.success
                ? typeof (a.pluginResponse as Record<string, unknown>)?.message === "string"
                  ? String((a.pluginResponse as Record<string, unknown>).message)
                  : "Applied successfully"
                : a.errorMessage ?? "Failed";
              // Humanize kebab/snake status codes ("post-not-found" → "post not found").
              const summary = rawSummary.replace(/[-_]+/g, " ");
              return (
                <Row key={a.id}>
                  <Link href={`/admin/sites/${a.siteSlug}`} className="flex flex-1 items-center gap-3">
                    <Pill tone={tone}>{a.kind.replace(/_/g, " ")}</Pill>
                    <span className="flex-1 truncate text-xs text-text">{a.siteName}</span>
                    <span className="truncate text-xs text-text-muted">{summary}</span>
                    {a.count > 1 ? (
                      <span className="shrink-0 rounded-sm bg-surface-2 px-1.5 text-xs font-medium text-text-muted tabular-nums">
                        ×{a.count}
                      </span>
                    ) : null}
                    <span className="shrink-0 text-xs text-text-faint">{formatRelative(a.createdAt)}</span>
                  </Link>
                </Row>
              );
            })}
          </RowList>
        )}
      </section>

      {/* ──────────── 4. SCHEDULE (transparency) ──────────── */}
      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-base font-medium text-text">What the agent runs on its own</h2>
        <p className="mt-1 text-xs text-text-muted">
          These cron jobs run inside the platform container. Times are UTC.
        </p>
        <div className="mt-3 overflow-hidden rounded-md border border-border">
          <table className="w-full text-xs">
            <thead className="bg-surface-soft">
              <tr className="text-left">
                <th className="px-3 py-2 font-medium text-text-faint">When</th>
                <th className="px-3 py-2 font-medium text-text-faint">Job</th>
                <th className="px-3 py-2 font-medium text-text-faint">What it does</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-surface">
              {[
                { when: "02:00 daily", job: "qa:run", desc: "QA Suite — 25 checks × 4 viewports across every site (A2)" },
                { when: "03:00 daily", job: "seo:scan", desc: "Scans every site for SEO findings + alt-text gaps + on-page issues" },
                { when: "03:30 daily", job: "ai:audit", desc: "AI-classifies task progress (done / partial / no-show)" },
                { when: "04:00 daily", job: "sync:gsc", desc: "Pulls Google Search Console traffic + ranking data" },
                { when: "04:30 daily", job: "sync:ga4", desc: "Pulls Google Analytics 4 metrics" },
                { when: "04:45 daily", job: "scoring:compute", desc: "Recomputes the 6 composite scores per site (P1)" },
                { when: "04:55 daily", job: "patterns:detect", desc: "Detects cross-site patterns + spawns agent tasks (P2)" },
                { when: "05:00 daily", job: "seo:outcomes", desc: "Measures 14-day GSC delta on previously-applied fixes (V4)" },
                { when: "06:00 daily", job: "sync:inventory", desc: "Refreshes the page catalogue from every site's plugin" },
                { when: "07:00 daily", job: "ai:digest", desc: "Sends per-user daily digest (in-app + email + Telegram)" },
                { when: "02:30 daily", job: "screenshots:capture", desc: "Captures home page screenshots — flags visual regressions (P3)" },
                { when: "07:00 Mondays", job: "seo:digest", desc: "Weekly keyword-ranking digest per site" },
                { when: "06:00 Mondays", job: "weekly:report", desc: "Executive weekly report — PDF + Telegram + email" },
              ].map((row) => (
                <tr key={row.job} className="hover:bg-surface-soft">
                  <td className="px-3 py-2 font-mono text-xs text-text-faint">{row.when}</td>
                  <td className="px-3 py-2 font-mono text-xs text-accent">{row.job}</td>
                  <td className="px-3 py-2 text-text-muted">{row.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ──────────── 5. HOW IT WORKS (collapsed by default) ──────────── */}
      <details className="rounded-xl border border-border bg-surface p-5">
        <summary className="cursor-pointer text-sm font-medium uppercase tracking-[0.08em] text-text-faint">
          How the agent works (read this if you&apos;re new here)
        </summary>
        <div className="mt-3 space-y-3 text-xs leading-relaxed text-text-muted">
          <p>
            <strong className="text-text">The agent is always on.</strong> A cron job inside the platform container runs scans + analyses nightly across every site you&apos;ve connected. You don&apos;t need to start it.
          </p>
          <p>
            <strong className="text-text">It proposes, you approve.</strong> Most things it discovers (broken alt text, missing meta titles, thin content) get listed in the SEO inbox as <em>proposals</em>. You review, approve, and the agent then pushes the fix to WordPress via the GYL Suite plugin.
          </p>
          <p>
            <strong className="text-text">Validated fixes.</strong> Before any change reaches a customer&apos;s site, it passes a 6-step validation pipeline: format check (V1), URL HEAD check (V2), Haiku critic-LLM (V3), and post-apply outcome tracking (V4) over 14 days.
          </p>
          <p>
            <strong className="text-text">It learns from outcomes.</strong> After 14 days, the agent measures whether each applied fix actually improved GSC rankings. If a category of fix consistently makes things worse, that capability auto-pauses (V6 rollback).
          </p>
          <p>
            <strong className="text-text">Per-site control.</strong> Each capability (alt text, meta titles, schema injection, visual CSS) can be set to <code className="font-mono">auto</code>, <code className="font-mono">propose</code>, or <code className="font-mono">off</code> per site. Open any site → click <em>&quot;Agent panel&quot;</em> in the header.
          </p>
          <p>
            <strong className="text-text">Cross-site intelligence.</strong> The pattern detector notices when 30%+ of your network shares the same problem (e.g. &quot;12 sites missing LocalBusiness schema&quot;) and proposes a single bulk action.
          </p>
          <p>
            <strong className="text-text">Content drafting.</strong> Open <Link className="text-accent underline" href="/admin/content/new">Content → New brief</Link>, write a brief, and the agent drafts a complete Markdown post. You edit, approve, and it auto-publishes to WordPress.
          </p>
        </div>
      </details>
    </div>
  );
}

function ReviewTile({
  href,
  count,
  label,
  description,
  tone,
}: {
  href: string;
  count: number;
  label: string;
  description: string;
  tone: "accent" | "warning" | "info";
}) {
  const empty = count === 0;
  return (
    <Link
      href={href}
      className="group relative block overflow-hidden p-5 transition hover:bg-surface-2"
    >
      {/* Gold hairline — matches Obsidian KpiCard treatment */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-3 top-0 h-px"
        style={{ background: "linear-gradient(90deg, transparent, var(--border-strong), transparent)" }}
      />
      <p className="text-xs font-semibold uppercase tracking-[0.10em] text-text-faint">{label}</p>
      <p
        className={`mt-2 font-semibold tabular-nums text-3xl leading-none tracking-tight ${
          empty
            ? "text-text-faint"
            : tone === "accent"
              ? "text-accent"
              : tone === "warning"
                ? "text-warning"
                : "text-info"
        }`}
      >
        {count}
      </p>
      <p className="mt-2 line-clamp-2 text-sm text-text-muted leading-snug">{description}</p>
    </Link>
  );
}

function DelegateCard({
  href,
  title,
  description,
  ctaLabel,
  emphasis,
}: {
  href: string;
  title: string;
  description: string;
  ctaLabel: string;
  emphasis?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`group block rounded-lg border bg-surface p-5 transition hover:border-border-strong hover:shadow-sm ${
        emphasis ? "border-accent/40" : "border-border"
      }`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-md font-medium text-text">{title}</h3>
        {emphasis ? (
          <span className="rounded-sm bg-accent-tint px-1.5 py-0.5 text-xs font-medium uppercase tracking-[0.08em] text-accent">
            Featured
          </span>
        ) : null}
      </div>
      <p className="mt-2 line-clamp-3 text-base leading-relaxed text-text-muted">{description}</p>
      <p className="mt-3 inline-flex items-center gap-1 text-base font-medium text-accent transition group-hover:gap-1.5">
        {ctaLabel.replace(" →", "")}
        <span aria-hidden>→</span>
      </p>
    </Link>
  );
}
