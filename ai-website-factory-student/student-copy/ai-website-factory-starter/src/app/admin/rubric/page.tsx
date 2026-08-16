/**
 * /admin/rubric — Local SEO Rubric audit hub.
 *
 * Cross-site rollup: every connected site listed with its latest
 * average rubric score + count of blocking findings + last-run age.
 * Click through to per-site detail.
 *
 * Build projects (pre-deploy) appear in a second section.
 */

import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { localSeoRubricAudits, sites, siteBuildProjects } from "@/db/schema";
import { Pill } from "@/components/ui/Row";
import { Stat, StatStrip } from "@/components/ui/Stat";
import { ScoreRing } from "@/components/ui/ScoreRing";
import { GmbScoutTabs } from "@/components/ui/GmbScoutTabs";
import { requireAdmin } from "@/lib/server-auth";
import { formatRelative } from "@/lib/utils";

export const dynamic = "force-dynamic";

type SiteRollup = {
  siteId: string;
  slug: string;
  name: string;
  domain: string | null;
  pages: number;
  avgScore: number | null;
  blockingTotal: number;
  highTotal: number;
  mediumTotal: number;
  latestAt: Date | null;
  [k: string]: unknown;
};

type BuildRollup = {
  projectId: string;
  businessName: string;
  city: string | null;
  phase: string;
  pages: number;
  avgScore: number | null;
  blockingTotal: number;
  highTotal: number;
  latestAt: Date | null;
  [k: string]: unknown;
};

export default async function RubricHubPage() {
  await ensureSchema();
  await requireAdmin();

  // Latest audit per (site, url) pair — we use the most recent overall_score
  // per page, then aggregate up to the site.
  const siteRollups = await db().execute<SiteRollup>(sql`
    WITH latest AS (
      SELECT DISTINCT ON (a.site_id, a.url) a.site_id, a.url,
        a.overall_score, a.findings_blocking, a.findings_high, a.findings_medium, a.created_at
      FROM local_seo_rubric_audits a
      WHERE a.source = 'live' AND a.site_id IS NOT NULL
      ORDER BY a.site_id, a.url, a.created_at DESC
    )
    SELECT s.id as "siteId", s.slug, s.name, s.domain,
      COUNT(latest.url)::int as pages,
      ROUND(AVG(latest.overall_score))::int as "avgScore",
      COALESCE(SUM(latest.findings_blocking), 0)::int as "blockingTotal",
      COALESCE(SUM(latest.findings_high), 0)::int as "highTotal",
      COALESCE(SUM(latest.findings_medium), 0)::int as "mediumTotal",
      MAX(latest.created_at) as "latestAt"
    FROM sites s
    LEFT JOIN latest ON latest.site_id = s.id
    GROUP BY s.id, s.slug, s.name, s.domain
    ORDER BY MAX(latest.created_at) DESC NULLS LAST, s.name
  `);

  const buildRollups = await db().execute<BuildRollup>(sql`
    WITH latest AS (
      SELECT DISTINCT ON (a.project_id, a.url) a.project_id, a.url,
        a.overall_score, a.findings_blocking, a.findings_high, a.created_at
      FROM local_seo_rubric_audits a
      WHERE a.source = 'build' AND a.project_id IS NOT NULL
      ORDER BY a.project_id, a.url, a.created_at DESC
    )
    SELECT p.id as "projectId", p.business_name as "businessName", p.city, p.phase,
      COUNT(latest.url)::int as pages,
      ROUND(AVG(latest.overall_score))::int as "avgScore",
      COALESCE(SUM(latest.findings_blocking), 0)::int as "blockingTotal",
      COALESCE(SUM(latest.findings_high), 0)::int as "highTotal",
      MAX(latest.created_at) as "latestAt"
    FROM site_build_projects p
    INNER JOIN latest ON latest.project_id = p.id
    GROUP BY p.id, p.business_name, p.city, p.phase
    ORDER BY MAX(latest.created_at) DESC
  `);

  const siteRows = (siteRollups as { rows?: SiteRollup[] }).rows ?? (siteRollups as unknown as SiteRollup[]);
  const buildRows = (buildRollups as { rows?: BuildRollup[] }).rows ?? (buildRollups as unknown as BuildRollup[]);

  // Network summary across audited live sites only (those with ≥1 page graded).
  const audited = siteRows.filter((r) => (r.pages ?? 0) > 0);
  const netPages = audited.reduce((s, r) => s + (r.pages ?? 0), 0);
  const netAvg =
    audited.length > 0
      ? Math.round(
          audited.reduce((s, r) => s + (r.avgScore ?? 0) * (r.pages ?? 0), 0) /
            Math.max(1, netPages),
        )
      : null;
  const netBlocking = audited.reduce((s, r) => s + (r.blockingTotal ?? 0), 0);
  const neverAudited = siteRows.length - audited.length;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-medium tracking-tightish text-text">Local SEO Rubric audit</h1>
        <p className="text-base text-text-muted">
          Every page on every site, graded against Wali&apos;s class doctrine: site structure
          + on-page checklist + semantic strategy.
        </p>
      </header>

      <GmbScoutTabs />

      {audited.length > 0 ? (
        <StatStrip columns={4}>
          <Stat label="Avg rubric score" value={netAvg ?? 0} suffix="/100" tone={netAvg != null && netAvg >= 85 ? "success" : netAvg != null && netAvg >= 50 ? "warning" : "danger"} />
          <Stat label="Sites audited" value={audited.length} suffix={siteRows.length ? `/ ${siteRows.length}` : undefined} />
          <Stat label="Pages graded" value={netPages} />
          <Stat label="Blocking issues" value={netBlocking} tone={netBlocking > 0 ? "danger" : "success"} />
        </StatStrip>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-md font-medium text-text">Live sites</h2>
        {siteRows.length === 0 ? (
          <p className="rounded-md border border-dashed border-border-strong bg-surface px-4 py-6 text-base text-text-muted">
            No sites yet. Connect a site at <Link href="/admin/sites/connect" className="text-accent underline">Sites → Connect</Link> first.
          </p>
        ) : (
          <ul className="space-y-2">
            {siteRows.map((r) => (
              <li key={r.siteId} className="grid items-center gap-3 rounded-xl border border-border bg-surface p-4 md:grid-cols-[auto,2fr,1fr,1.5fr,auto]">
                {/* Per-site score ring — instant visual read; null until audited. */}
                <ScoreRing label="Rubric" value={r.pages ? (r.avgScore ?? null) : null} size="sm" href={`/admin/rubric/${r.slug}`} />
                <div className="space-y-0.5">
                  <Link href={`/admin/rubric/${r.slug}`} className="text-base font-medium text-text hover:text-accent">
                    {r.name}
                  </Link>
                  <p className="font-mono text-xs text-text-faint">{r.domain ?? "—"}</p>
                  <p className="text-xs text-text-faint">
                    {r.pages ? `${r.pages} page${r.pages === 1 ? "" : "s"} graded` : "Never audited"}
                    {r.latestAt ? ` · ${formatRelative(r.latestAt)}` : ""}
                  </p>
                </div>
                <div className="text-xs">
                  <p className="font-medium uppercase tracking-[0.06em] text-text-faint">Avg score</p>
                  {r.avgScore !== null && r.avgScore !== undefined && r.pages ? (
                    <p className={`tnum text-base font-medium ${scoreColor(r.avgScore)}`}>{r.avgScore}/100</p>
                  ) : (
                    <p className="text-base text-text-faint">—</p>
                  )}
                </div>
                <div className="space-y-1 text-xs">
                  <p className="font-medium uppercase tracking-[0.06em] text-text-faint">Findings</p>
                  <div className="flex flex-wrap items-center gap-1">
                    {r.blockingTotal > 0 ? <Pill tone="danger">{r.blockingTotal} blocking</Pill> : null}
                    {r.highTotal > 0 ? <Pill tone="warning">{r.highTotal} high</Pill> : null}
                    {r.mediumTotal > 0 ? <Pill tone="neutral">{r.mediumTotal} med</Pill> : null}
                    {r.pages && r.blockingTotal === 0 && r.highTotal === 0 && r.mediumTotal === 0 ? (
                      <Pill tone="success">clean</Pill>
                    ) : null}
                    {!r.pages ? <span className="text-text-faint">—</span> : null}
                  </div>
                </div>
                <Link
                  href={`/admin/rubric/${r.slug}`}
                  className="rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-medium text-text hover:border-accent hover:text-accent"
                >
                  Open →
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {buildRows.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-md font-medium text-text">Pre-deploy build audits</h2>
          <ul className="space-y-2">
            {buildRows.map((r) => (
              <li key={r.projectId} className="grid items-center gap-3 rounded-xl border border-border bg-surface p-4 md:grid-cols-[2fr,1fr,1fr,1fr,auto]">
                <div className="space-y-0.5">
                  <Link href={`/admin/rubric/build/${r.projectId}`} className="text-base font-medium text-text hover:text-accent">
                    {r.businessName}
                  </Link>
                  <p className="text-xs text-text-faint">
                    {r.city ?? "—"} · <Pill tone="info">{r.phase}</Pill>
                  </p>
                </div>
                <div className="text-xs text-text-muted">
                  <p className="font-medium uppercase tracking-[0.06em] text-text-faint">Pages audited</p>
                  <p className="tnum text-base text-text">{r.pages}</p>
                </div>
                <div className="text-xs">
                  <p className="font-medium uppercase tracking-[0.06em] text-text-faint">Avg score</p>
                  <p className={`tnum text-base font-medium ${scoreColor(r.avgScore ?? 0)}`}>{r.avgScore ?? 0}/100</p>
                </div>
                <div className="text-xs">
                  <p className="font-medium uppercase tracking-[0.06em] text-text-faint">Issues</p>
                  <div className="flex items-center gap-1.5 text-base">
                    {r.blockingTotal > 0 ? <span className="text-danger">{r.blockingTotal} 🔴</span> : null}
                    {r.highTotal > 0 ? <span className="text-warning">{r.highTotal} 🟠</span> : null}
                    {r.blockingTotal === 0 && r.highTotal === 0 ? <span className="text-text-faint">none</span> : null}
                  </div>
                  <p className="text-text-faint">{r.latestAt ? formatRelative(r.latestAt) : "—"}</p>
                </div>
                <Link
                  href={`/admin/rubric/build/${r.projectId}`}
                  className="rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-medium text-text hover:border-accent hover:text-accent"
                >
                  Open →
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rounded-xl border border-border bg-surface-2 p-4 text-xs text-text-muted">
        <p className="font-medium uppercase tracking-[0.06em] text-text-faint">How the rubric works</p>
        <p className="mt-1.5">
          Each page is graded on 8 categories: <strong>on-page</strong> (URL, meta, headings, schema),
          <strong> structure</strong> (required sections per page type), <strong>schema</strong>,
          <strong> internal linking</strong>, <strong>semantic</strong> coverage, and
          <strong> anti-doorway</strong>. Subjective checks (FAQ tone, real landmarks, EEAT)
          go through a Haiku judge for ~$0.0002/page.
          Run from the site page or the CLI: <code className="font-mono text-text">npm run rubric:audit -- --site=&lt;slug&gt;</code>.
        </p>
      </section>
    </div>
  );
}

// Suppress "unused" lint while we keep the import for typing
void { desc, eq };

function scoreColor(score: number): string {
  if (score >= 85) return "text-success";
  if (score >= 70) return "text-text";
  if (score >= 50) return "text-warning";
  return "text-danger";
}
