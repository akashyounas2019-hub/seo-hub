/**
 * /admin/rubric/[siteSlug] — Per-site rubric audit detail.
 *
 * Shows:
 *   - Score summary (overall, plus per-category breakdown)
 *   - Per-page table sorted by score (worst first)
 *   - Top-missing-sections heatmap across the site
 *   - "Re-run audit" button
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq, sql } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { localSeoRubricAudits, sites } from "@/db/schema";
import { Pill } from "@/components/ui/Row";
import { requireAdmin } from "@/lib/server-auth";
import { formatRelative } from "@/lib/utils";
import { runLiveSiteRubricAction } from "@/app/actions/rubric";

export const dynamic = "force-dynamic";

/** Shape of one finding object stored in local_seo_rubric_audits.findings.
 *  Mirrors RubricFinding from src/lib/local-seo-rubric-checker.ts. */
type StoredFinding = {
  checkId?: string;
  category?: string;
  status?: "pass" | "fail" | "warn" | "needs_judge";
  severity?: "blocking" | "high" | "medium" | "low" | "info";
  message?: string;
  fixHint?: string;
};

// Human labels for each rubric category (keys come from RubricCategory).
const CATEGORY_LABELS: Record<string, string> = {
  on_page: "On-page",
  structure: "Structure",
  eeat: "EEAT",
  local_proof: "Local proof",
  schema: "Schema",
  internal_linking: "Internal linking",
  semantic: "Semantic coverage",
  anti_doorway: "Anti-doorway",
};
const CATEGORY_ORDER = [
  "on_page",
  "structure",
  "schema",
  "internal_linking",
  "semantic",
  "eeat",
  "local_proof",
  "anti_doorway",
];

type PageRow = {
  auditId: string;
  url: string;
  pageType: string;
  overallScore: number;
  onPageScore: number;
  structureScore: number;
  schemaScore: number;
  internalLinkingScore: number;
  semanticScore: number;
  antiDoorwayScore: number;
  findingsBlocking: number;
  findingsHigh: number;
  findingsMedium: number;
  createdAt: Date;
  [k: string]: unknown;
};

type FindingFrequency = {
  checkId: string;
  failures: number;
  [k: string]: unknown;
};

export default async function RubricSitePage({
  params,
  searchParams,
}: {
  params: { siteSlug: string };
  searchParams: { queued?: string; audited?: string; avg?: string; error?: string };
}) {
  await ensureSchema();
  await requireAdmin();

  const [site] = await db().select().from(sites).where(eq(sites.slug, params.siteSlug)).limit(1);
  if (!site) notFound();

  // Latest audit per unique URL on this site
  const pages = await db().execute<PageRow>(sql`
    SELECT DISTINCT ON (url)
      id as "auditId", url, page_type as "pageType", overall_score as "overallScore",
      on_page_score as "onPageScore", structure_score as "structureScore",
      schema_score as "schemaScore", internal_linking_score as "internalLinkingScore",
      semantic_score as "semanticScore", anti_doorway_score as "antiDoorwayScore",
      findings_blocking as "findingsBlocking", findings_high as "findingsHigh",
      findings_medium as "findingsMedium", created_at as "createdAt"
    FROM local_seo_rubric_audits
    WHERE site_id = ${site.id} AND source = 'live'
    ORDER BY url, created_at DESC
  `);
  const pageRows = (pages as { rows?: PageRow[] }).rows ?? (pages as unknown as PageRow[]);
  pageRows.sort((a, b) => a.overallScore - b.overallScore);

  // Aggregate site-level score + most-frequent failing checks across pages
  const overall = pageRows.length > 0
    ? {
        avg: Math.round(pageRows.reduce((s, p) => s + p.overallScore, 0) / pageRows.length),
        onPage: Math.round(pageRows.reduce((s, p) => s + p.onPageScore, 0) / pageRows.length),
        structure: Math.round(pageRows.reduce((s, p) => s + p.structureScore, 0) / pageRows.length),
        schema: Math.round(pageRows.reduce((s, p) => s + p.schemaScore, 0) / pageRows.length),
        internalLinking: Math.round(pageRows.reduce((s, p) => s + p.internalLinkingScore, 0) / pageRows.length),
        semantic: Math.round(pageRows.reduce((s, p) => s + p.semanticScore, 0) / pageRows.length),
        antiDoorway: Math.round(pageRows.reduce((s, p) => s + p.antiDoorwayScore, 0) / pageRows.length),
        blocking: pageRows.reduce((s, p) => s + p.findingsBlocking, 0),
        high: pageRows.reduce((s, p) => s + p.findingsHigh, 0),
        medium: pageRows.reduce((s, p) => s + p.findingsMedium, 0),
      }
    : null;

  // Most frequent failing check across the site (last audit per page)
  const topFailures = await db().execute<FindingFrequency>(sql`
    SELECT finding->>'checkId' as "checkId", COUNT(*)::int as failures
    FROM (
      SELECT DISTINCT ON (a.url) a.findings
      FROM local_seo_rubric_audits a
      WHERE a.site_id = ${site.id} AND a.source = 'live'
      ORDER BY a.url, a.created_at DESC
    ) latest
    CROSS JOIN LATERAL jsonb_array_elements(latest.findings) finding
    WHERE finding->>'status' = 'fail'
    GROUP BY finding->>'checkId'
    ORDER BY failures DESC
    LIMIT 10
  `);
  const failureRows = (topFailures as { rows?: FindingFrequency[] }).rows ?? (topFailures as unknown as FindingFrequency[]);

  // ── Category-grouped checklist ──────────────────────────────────────
  // Pull the latest audit per page and flatten every stored finding. We then
  // dedupe by checkId (the same check runs on many pages) keeping the worst
  // status seen + the count of pages affected + the recommendation text.
  const findingsRows = await db().execute<{ findings: StoredFinding[] }>(sql`
    SELECT findings
    FROM (
      SELECT DISTINCT ON (a.url) a.findings, a.url, a.created_at
      FROM local_seo_rubric_audits a
      WHERE a.site_id = ${site.id} AND a.source = 'live'
      ORDER BY a.url, a.created_at DESC
    ) latest
  `);
  const findingsArrays =
    (findingsRows as { rows?: { findings: StoredFinding[] }[] }).rows ??
    (findingsRows as unknown as { findings: StoredFinding[] }[]);

  type CheckAgg = {
    checkId: string;
    category: string;
    message: string;
    fixHint?: string;
    severity?: StoredFinding["severity"];
    failPages: number;
    warnPages: number;
    passPages: number;
    judgePages: number;
  };
  const checkMap = new Map<string, CheckAgg>();
  const statusRank: Record<string, number> = { fail: 0, warn: 1, needs_judge: 2, pass: 3 };
  for (const row of findingsArrays) {
    const findings = Array.isArray(row.findings) ? row.findings : [];
    for (const f of findings) {
      if (!f.checkId || !f.category) continue;
      const existing = checkMap.get(f.checkId) ?? {
        checkId: f.checkId,
        category: f.category,
        message: f.message ?? f.checkId,
        fixHint: f.fixHint,
        severity: f.severity,
        failPages: 0,
        warnPages: 0,
        passPages: 0,
        judgePages: 0,
      };
      if (f.status === "fail") existing.failPages++;
      else if (f.status === "warn") existing.warnPages++;
      else if (f.status === "needs_judge") existing.judgePages++;
      else existing.passPages++;
      // Keep the message/fixHint from the worst-status instance so the row
      // explains the failure, not a passing variant.
      if (
        f.status &&
        (statusRank[f.status] ?? 9) <= (statusRank[worstStatus(existing)] ?? 9) &&
        (f.message || f.fixHint)
      ) {
        if (f.message) existing.message = f.message;
        if (f.fixHint) existing.fixHint = f.fixHint;
        if (f.severity) existing.severity = f.severity;
      }
      checkMap.set(f.checkId, existing);
    }
  }
  // Group checks by category, ordered with the canonical category order.
  const byCategory = new Map<string, CheckAgg[]>();
  for (const c of checkMap.values()) {
    const arr = byCategory.get(c.category) ?? [];
    arr.push(c);
    byCategory.set(c.category, arr);
  }
  const categoryScore: Record<string, number> = {
    on_page: overall?.onPage ?? 0,
    structure: overall?.structure ?? 0,
    schema: overall?.schema ?? 0,
    internal_linking: overall?.internalLinking ?? 0,
    semantic: overall?.semantic ?? 0,
    anti_doorway: overall?.antiDoorway ?? 0,
  };
  const orderedCategories = [
    ...CATEGORY_ORDER.filter((c) => byCategory.has(c)),
    ...Array.from(byCategory.keys()).filter((c) => !CATEGORY_ORDER.includes(c)),
  ];

  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between gap-3 border-b border-border pb-3">
        <div className="space-y-1">
          <Link href="/admin/rubric" className="text-xs text-text-faint hover:text-text">
            ← All sites
          </Link>
          <h1 className="text-2xl font-medium tracking-tightish text-text">{site.name}</h1>
          <p className="font-mono text-xs text-text-faint">{site.domain ?? "—"}</p>
        </div>
        <form action={runLiveSiteRubricAction}>
          <input type="hidden" name="siteId" value={site.id} />
          <input type="hidden" name="inline" value="1" />
          <button
            type="submit"
            className="h-9 rounded-md bg-accent px-4 text-xs font-medium text-accent-fg shadow-xs transition hover:bg-accent-hover"
          >
            Re-run audit →
          </button>
        </form>
      </header>

      {searchParams.queued ? (
        <div className="rounded-md border border-info/30 bg-info-tint px-3 py-2 text-base text-info">
          Audit job queued — Mac worker will pick it up shortly. Refresh in a minute.
        </div>
      ) : null}
      {searchParams.audited ? (
        <div className="rounded-md border border-success/30 bg-success-tint px-3 py-2 text-base text-success">
          Audit complete — {searchParams.audited} pages, avg score {searchParams.avg}/100.
        </div>
      ) : null}
      {searchParams.error ? (
        <div className="rounded-md border border-danger/30 bg-danger-tint px-3 py-2 text-base text-danger">
          {searchParams.error}
        </div>
      ) : null}

      {!overall ? (
        <p className="rounded-md border border-dashed border-border-strong bg-surface px-4 py-8 text-base text-text-muted">
          No audits yet for this site. Click <strong>Re-run audit</strong> above to start.
        </p>
      ) : (
        <>
          {/* ── Score breakdown ──────────────────────────────────── */}
          <section className="grid gap-3 rounded-xl border border-border bg-surface p-5 md:grid-cols-[1fr,2fr]">
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-[0.06em] text-text-faint">Site rubric score</p>
              <p className={`tnum text-5xl font-semibold tracking-tight ${scoreColor(overall.avg)}`}>{overall.avg}<span className="text-xl text-text-faint">/100</span></p>
              <p className="text-xs text-text-muted">{pageRows.length} pages audited</p>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <ScoreRow label="On-page (URL, meta, headings, images)" value={overall.onPage} />
              <ScoreRow label="Structure (required sections)" value={overall.structure} />
              <ScoreRow label="Schema (JSON-LD)" value={overall.schema} />
              <ScoreRow label="Internal linking" value={overall.internalLinking} />
              <ScoreRow label="Semantic coverage" value={overall.semantic} />
              <ScoreRow label="Anti-doorway (word count + uniqueness)" value={overall.antiDoorway} />
            </div>
          </section>

          {/* ── Top failures across the site ─────────────────────── */}
          {failureRows.length > 0 ? (
            <section className="rounded-xl border border-danger/30 bg-danger-tint/40 p-5">
              <h2 className="text-md font-medium text-text">Most frequent failures across the site</h2>
              <p className="mt-1 text-xs text-text-muted">Pick one of these to fix systematically — they keep recurring across pages.</p>
              <ul className="mt-3 grid gap-1.5 md:grid-cols-2">
                {failureRows.map((f) => (
                  <li key={f.checkId} className="flex items-baseline justify-between rounded-md border border-border bg-surface px-3 py-2 text-sm">
                    <span className="font-mono text-text">{f.checkId}</span>
                    <span className="text-text-muted">
                      <strong className="text-danger">{f.failures}</strong> page{f.failures === 1 ? "" : "s"}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* ── Checklist grouped by category ────────────────────── */}
          {orderedCategories.length > 0 ? (
            <section className="space-y-3">
              <h2 className="text-md font-medium text-text">Checklist by category</h2>
              <p className="text-xs text-text-muted">
                Every rubric check, grouped by category, with the specific finding + recommendation already
                stored from the last audit per page. &ldquo;{`{n} pages`}&rdquo; means how many pages still trip the check.
              </p>
              <div className="space-y-3">
                {orderedCategories.map((cat) => {
                  const checks = (byCategory.get(cat) ?? []).slice().sort(
                    (a, b) => statusRank[worstStatus(a)] - statusRank[worstStatus(b)],
                  );
                  const catScore = categoryScore[cat];
                  const failing = checks.filter((c) => worstStatus(c) === "fail").length;
                  const passing = checks.filter((c) => worstStatus(c) === "pass").length;
                  return (
                    <div key={cat} className="overflow-hidden rounded-xl border border-border bg-surface">
                      <div className="flex items-center justify-between gap-3 border-b border-border bg-surface-2 px-4 py-2.5">
                        <div className="flex items-baseline gap-2">
                          <h3 className="text-sm font-medium text-text">{CATEGORY_LABELS[cat] ?? cat}</h3>
                          <span className="text-xs text-text-faint">
                            {passing} pass · {failing} fail
                          </span>
                        </div>
                        {catScore !== undefined ? (
                          <span className={`tnum text-sm font-medium ${scoreColor(catScore)}`}>{catScore}/100</span>
                        ) : null}
                      </div>
                      <ul className="divide-y divide-border">
                        {checks.map((c) => {
                          const st = worstStatus(c);
                          return (
                            <li key={c.checkId} className="flex items-start gap-3 px-4 py-2.5">
                              <span className="mt-0.5 shrink-0">
                                <Pill tone={st === "fail" ? "danger" : st === "warn" ? "warning" : st === "needs_judge" ? "info" : "success"}>
                                  {st === "fail" ? "fail" : st === "warn" ? "warn" : st === "needs_judge" ? "judge" : "pass"}
                                </Pill>
                              </span>
                              <div className="min-w-0 flex-1 space-y-0.5">
                                <div className="flex items-baseline justify-between gap-2">
                                  <span className="font-mono text-xs text-text-faint">{c.checkId}</span>
                                  {st === "fail" && (c.failPages > 0) ? (
                                    <span className="shrink-0 text-xs text-danger">{c.failPages} page{c.failPages === 1 ? "" : "s"}</span>
                                  ) : st === "warn" && c.warnPages > 0 ? (
                                    <span className="shrink-0 text-xs text-warning">{c.warnPages} page{c.warnPages === 1 ? "" : "s"}</span>
                                  ) : null}
                                </div>
                                <p className="text-sm text-text">{c.message}</p>
                                {st !== "pass" && c.fixHint ? (
                                  <p className="text-xs text-text-muted">→ {c.fixHint}</p>
                                ) : null}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

          {/* ── Per-page table ───────────────────────────────────── */}
          <section className="space-y-3">
            <h2 className="text-md font-medium text-text">Per-page audit ({pageRows.length})</h2>
            <p className="text-xs text-text-muted">Lowest scores first — these are where to spend your time.</p>
            <ul className="space-y-1.5">
              {pageRows.map((p) => (
                <li key={p.auditId} className="grid items-center gap-3 rounded-md border border-border bg-surface p-3 md:grid-cols-[1fr,auto,auto,auto,auto,auto]">
                  <div className="space-y-0.5 min-w-0">
                    <Link href={`/admin/rubric/${site.slug}/audit/${p.auditId}`} className="block truncate text-base text-text hover:text-accent">
                      {p.url}
                    </Link>
                    <div className="flex items-center gap-1.5">
                      <Pill tone="neutral">{p.pageType}</Pill>
                      <span className="text-xs text-text-faint">{formatRelative(p.createdAt)}</span>
                    </div>
                  </div>
                  <span className={`tnum text-base font-medium ${scoreColor(p.overallScore)}`}>{p.overallScore}</span>
                  <span className="text-xs text-text-faint">/100</span>
                  <div className="flex items-center gap-1 text-xs">
                    {p.findingsBlocking > 0 ? <span className="rounded bg-danger/15 px-1.5 py-0.5 text-danger">{p.findingsBlocking}🔴</span> : null}
                    {p.findingsHigh > 0 ? <span className="rounded bg-warning/15 px-1.5 py-0.5 text-warning">{p.findingsHigh}🟠</span> : null}
                    {p.findingsMedium > 0 ? <span className="text-text-faint">{p.findingsMedium}🟡</span> : null}
                  </div>
                  <div className="flex gap-0.5">
                    <Bar val={p.onPageScore} title="On-page" />
                    <Bar val={p.structureScore} title="Structure" />
                    <Bar val={p.schemaScore} title="Schema" />
                    <Bar val={p.internalLinkingScore} title="Linking" />
                    <Bar val={p.semanticScore} title="Semantic" />
                    <Bar val={p.antiDoorwayScore} title="Anti-doorway" />
                  </div>
                  <Link href={`/admin/rubric/${site.slug}/audit/${p.auditId}`} className="text-xs text-text-faint hover:text-accent">
                    Detail →
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

// Suppress unused-import warning while we keep the import for downstream typing
void desc;

function scoreColor(score: number): string {
  if (score >= 85) return "text-success";
  if (score >= 70) return "text-text";
  if (score >= 50) return "text-warning";
  return "text-danger";
}

/** The worst (most actionable) status this check showed across the site's
 *  pages — fail beats warn beats needs_judge beats pass. */
function worstStatus(c: {
  failPages: number;
  warnPages: number;
  judgePages: number;
  passPages: number;
}): "fail" | "warn" | "needs_judge" | "pass" {
  if (c.failPages > 0) return "fail";
  if (c.warnPages > 0) return "warn";
  if (c.judgePages > 0) return "needs_judge";
  return "pass";
}

function ScoreRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-text-muted">{label}</span>
        <span className={`tnum font-medium ${scoreColor(value)}`}>{value}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded bg-surface-2">
        <div
          className={`h-full ${value >= 85 ? "bg-success" : value >= 70 ? "bg-accent" : value >= 50 ? "bg-warning" : "bg-danger"}`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

function Bar({ val, title }: { val: number; title: string }) {
  return (
    <span
      title={`${title}: ${val}`}
      className={`inline-block h-3 w-1.5 rounded-sm ${val >= 85 ? "bg-success" : val >= 70 ? "bg-accent" : val >= 50 ? "bg-warning" : "bg-danger"}`}
    />
  );
}
