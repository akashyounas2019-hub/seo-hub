/**
 * /admin/rubric/build/[projectId] — Pre-deploy rubric audit for a
 * build workspace project. Mirror of the live-site page but reads
 * from `local_seo_rubric_audits` where source = 'build'.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { siteBuildProjects } from "@/db/schema";
import { Pill } from "@/components/ui/Row";
import { requireAdmin } from "@/lib/server-auth";
import { formatRelative } from "@/lib/utils";
import { runBuildProjectRubricAction } from "@/app/actions/rubric";

export const dynamic = "force-dynamic";

type PageRow = {
  auditId: string;
  url: string;
  pageType: string;
  overallScore: number;
  findingsBlocking: number;
  findingsHigh: number;
  findingsMedium: number;
  createdAt: Date;
  [k: string]: unknown;
};

export default async function RubricBuildPage({
  params,
  searchParams,
}: {
  params: { projectId: string };
  searchParams: { audited?: string; avg?: string; error?: string };
}) {
  await ensureSchema();
  await requireAdmin();

  const [project] = await db().select().from(siteBuildProjects).where(eq(siteBuildProjects.id, params.projectId)).limit(1);
  if (!project) notFound();

  const pages = await db().execute<PageRow>(sql`
    SELECT DISTINCT ON (url)
      id as "auditId", url, page_type as "pageType",
      overall_score as "overallScore",
      findings_blocking as "findingsBlocking",
      findings_high as "findingsHigh",
      findings_medium as "findingsMedium",
      created_at as "createdAt"
    FROM local_seo_rubric_audits
    WHERE project_id = ${project.id} AND source = 'build'
    ORDER BY url, created_at DESC
  `);
  const pageRows = (pages as { rows?: PageRow[] }).rows ?? (pages as unknown as PageRow[]);
  pageRows.sort((a, b) => a.overallScore - b.overallScore);

  const avg = pageRows.length > 0 ? Math.round(pageRows.reduce((s, p) => s + p.overallScore, 0) / pageRows.length) : null;
  const blockingTotal = pageRows.reduce((s, p) => s + p.findingsBlocking, 0);
  const highTotal = pageRows.reduce((s, p) => s + p.findingsHigh, 0);

  // Suggested gate threshold for deploy
  const GATE_THRESHOLD = 70;
  const meetsGate = avg !== null && avg >= GATE_THRESHOLD && blockingTotal === 0;

  return (
    <div className="space-y-5">
      <header className="flex items-baseline justify-between gap-3 border-b border-border pb-3">
        <div className="space-y-1">
          <Link href={`/admin/build/${project.id}`} className="text-xs text-text-faint hover:text-text">
            ← Back to project
          </Link>
          <h1 className="text-xl font-medium tracking-tightish text-text">{project.businessName}</h1>
          <p className="text-xs text-text-faint">{project.city ?? "—"} · pre-deploy rubric audit</p>
        </div>
        <form action={runBuildProjectRubricAction}>
          <input type="hidden" name="projectId" value={project.id} />
          <button
            type="submit"
            className="h-9 rounded-md bg-accent px-4 text-xs font-medium text-accent-fg shadow-xs transition hover:bg-accent-hover"
          >
            Re-run audit →
          </button>
        </form>
      </header>

      {searchParams.audited ? (
        <div className="rounded-md border border-success/30 bg-success-tint px-3 py-2 text-base text-success">
          Audit complete — {searchParams.audited} pages, avg score {searchParams.avg}/100.
        </div>
      ) : null}
      {searchParams.error ? (
        <div className="rounded-md border border-danger/30 bg-danger-tint px-3 py-2 text-base text-danger">{searchParams.error}</div>
      ) : null}

      {/* ── Deploy gate panel ───────────────────────────────────── */}
      {avg !== null ? (
        <section className={`rounded-xl border p-5 ${meetsGate ? "border-success/30 bg-success-tint" : "border-danger/30 bg-danger-tint"}`}>
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.06em] font-semibold text-text-muted">
                Deploy gate · target ≥ {GATE_THRESHOLD}, 0 blocking
              </p>
              <p className="text-base font-medium text-text mt-1">
                {meetsGate ? "✓ Gate passes — safe to deploy" : "✗ Gate blocks deploy"}
              </p>
              <p className="text-xs text-text-muted mt-0.5">
                {pageRows.length} pages · avg {avg}/100 · {blockingTotal} blocking + {highTotal} high
              </p>
            </div>
            <div className="text-right">
              <p className={`tnum text-4xl font-semibold tracking-tight ${scoreColor(avg)}`}>{avg}</p>
              <p className="text-xs uppercase tracking-[0.06em] text-text-faint">avg /100</p>
            </div>
          </div>
        </section>
      ) : (
        <p className="rounded-md border border-dashed border-border-strong bg-surface px-4 py-8 text-base text-text-muted">
          No audits yet for this build. Click <strong>Re-run audit</strong> above to start.
        </p>
      )}

      {/* ── Per-page list ────────────────────────────────────────── */}
      {pageRows.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-md font-medium text-text">Per-page audit ({pageRows.length})</h2>
          <ul className="space-y-1.5">
            {pageRows.map((p) => (
              <li key={p.auditId} className="grid items-center gap-3 rounded-md border border-border bg-surface p-3 md:grid-cols-[1fr,auto,auto,auto]">
                <div className="space-y-0.5 min-w-0">
                  <p className="truncate text-base text-text">{p.url}</p>
                  <div className="flex items-center gap-1.5">
                    <Pill tone="neutral">{p.pageType}</Pill>
                    <span className="text-xs text-text-faint">{formatRelative(p.createdAt)}</span>
                  </div>
                </div>
                <span className={`tnum text-base font-medium ${scoreColor(p.overallScore)}`}>{p.overallScore}/100</span>
                <div className="flex items-center gap-1 text-xs">
                  {p.findingsBlocking > 0 ? <span className="rounded bg-danger/15 px-1.5 py-0.5 text-danger">{p.findingsBlocking}🔴</span> : null}
                  {p.findingsHigh > 0 ? <span className="rounded bg-warning/15 px-1.5 py-0.5 text-warning">{p.findingsHigh}🟠</span> : null}
                  {p.findingsMedium > 0 ? <span className="text-text-faint">{p.findingsMedium}🟡</span> : null}
                </div>
                {/* Build pages use a generic audit detail link — they live on
                    the same /admin/rubric/[siteSlug]/audit/[auditId] path
                    even though they're build-source. We route through "_build"
                    as a synthetic slug. */}
                <span className="text-xs text-text-faint">build</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function scoreColor(score: number): string {
  if (score >= 85) return "text-success";
  if (score >= 70) return "text-text";
  if (score >= 50) return "text-warning";
  return "text-danger";
}
