/**
 * /admin/rubric/[siteSlug]/audit/[auditId] — Detailed view of one audit
 * for one page. Shows every finding with status, severity, fix hint,
 * plus the structured evidence the checker extracted.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { localSeoRubricAudits, sites } from "@/db/schema";
import { Pill } from "@/components/ui/Row";
import { requireAdmin } from "@/lib/server-auth";
import { formatRelative } from "@/lib/utils";
import type { RubricFinding } from "@/lib/local-seo-rubric-checker";

export const dynamic = "force-dynamic";

interface EvidenceShape {
  title?: string;
  headings?: Array<{ level: number; text: string }>;
  paragraphs?: string[];
  schemaTypes?: string[];
  internalLinks?: number;
  externalLinks?: number;
  imageCount?: number;
  wordCount?: number;
  sectionsDetected?: string[];
  entitiesFound?: string[];
}

export default async function RubricAuditDetail({
  params,
}: {
  params: { siteSlug: string; auditId: string };
}) {
  await ensureSchema();
  await requireAdmin();

  const [site] = await db().select().from(sites).where(eq(sites.slug, params.siteSlug)).limit(1);
  if (!site) notFound();

  const [audit] = await db().select().from(localSeoRubricAudits).where(eq(localSeoRubricAudits.id, params.auditId)).limit(1);
  if (!audit || audit.siteId !== site.id) notFound();

  const findings = (audit.findings as unknown as RubricFinding[]) ?? [];
  const evidence = (audit.evidence as unknown as EvidenceShape) ?? {};

  // Group by category
  const grouped = findings.reduce<Record<string, RubricFinding[]>>((acc, f) => {
    (acc[f.category] = acc[f.category] ?? []).push(f);
    return acc;
  }, {});

  const categoryOrder = ["on_page", "structure", "schema", "internal_linking", "semantic", "anti_doorway", "eeat", "local_proof"];

  return (
    <div className="max-w-5xl space-y-5">
      <header className="space-y-1 border-b border-border pb-3">
        <Link href={`/admin/rubric/${site.slug}`} className="text-xs text-text-faint hover:text-text">
          ← {site.name}
        </Link>
        <h1 className="text-xl font-medium tracking-tightish text-text break-all">{audit.url}</h1>
        <div className="flex items-center gap-2 text-xs text-text-faint">
          <Pill tone="neutral">{audit.pageType}</Pill>
          <span>{formatRelative(audit.createdAt)}</span>
          {audit.primaryKeyword ? <span>· kw: <strong className="text-text">{audit.primaryKeyword}</strong></span> : null}
          {audit.city ? <span>· city: <strong className="text-text">{audit.city}</strong></span> : null}
          {audit.judgeRan ? <span>· judge ran</span> : <span>· deterministic only</span>}
        </div>
      </header>

      {/* ── Score panel ───────────────────────────────────────────── */}
      <section className="grid gap-3 rounded-xl border border-border bg-surface p-5 md:grid-cols-[1fr,2fr]">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-[0.06em] text-text-faint">Overall score</p>
          <p className={`tnum text-5xl font-semibold tracking-tight ${scoreColor(audit.overallScore)}`}>
            {audit.overallScore}<span className="text-xl text-text-faint">/100</span>
          </p>
          <p className="text-xs text-text-muted">
            {audit.findingsBlocking + audit.findingsHigh + audit.findingsMedium + audit.findingsLow} finding(s)
          </p>
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          <ScoreRow label="On-page" value={audit.onPageScore} />
          <ScoreRow label="Structure" value={audit.structureScore} />
          <ScoreRow label="Schema" value={audit.schemaScore} />
          <ScoreRow label="Internal linking" value={audit.internalLinkingScore} />
          <ScoreRow label="Semantic" value={audit.semanticScore} />
          <ScoreRow label="Anti-doorway" value={audit.antiDoorwayScore} />
        </div>
      </section>

      {/* ── Findings grouped by category ──────────────────────────── */}
      <section className="space-y-4">
        {categoryOrder.map((cat) => {
          const items = grouped[cat] ?? [];
          if (items.length === 0) return null;
          return (
            <div key={cat} className="space-y-2 rounded-xl border border-border bg-surface p-5">
              <h2 className="text-md font-medium text-text">{prettyCategory(cat)}</h2>
              <ul className="space-y-1.5">
                {items.map((f, i) => (
                  <li key={`${f.checkId}-${i}`} className="flex items-start gap-3 rounded-md border border-border bg-surface-2 p-3">
                    <span className="mt-0.5 shrink-0">{statusBadge(f.status)}</span>
                    <div className="flex-1 space-y-0.5 min-w-0">
                      <p className="text-sm text-text">{f.message}</p>
                      <p className="font-mono text-xs text-text-faint">
                        {f.checkId} · weight {f.weight} · {f.severity}
                      </p>
                      {f.status !== "pass" && f.fixHint ? (
                        <p className="text-xs text-text-muted">
                          <strong className="text-text">Fix:</strong> {f.fixHint}
                        </p>
                      ) : null}
                      {f.evidence ? (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-xs text-text-faint hover:text-text">
                            Evidence
                          </summary>
                          <pre className="mt-1 max-h-40 overflow-y-auto rounded bg-surface-3 p-2 font-mono text-xs text-text">
                            {JSON.stringify(f.evidence, null, 2)}
                          </pre>
                        </details>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </section>

      {/* ── Page evidence (what the checker pulled out) ─────────── */}
      <section className="space-y-2 rounded-xl border border-border bg-surface-2 p-5">
        <h2 className="text-md font-medium text-text">Extracted evidence</h2>
        <dl className="grid gap-2 text-xs md:grid-cols-2">
          <Fact label="Word count" value={evidence.wordCount} />
          <Fact label="Headings" value={evidence.headings?.length} />
          <Fact label="Internal links" value={evidence.internalLinks} />
          <Fact label="External links" value={evidence.externalLinks} />
          <Fact label="Images" value={evidence.imageCount} />
          <Fact label="Schema types" value={evidence.schemaTypes?.join(", ") || "(none)"} />
          <Fact label="Sections detected" value={evidence.sectionsDetected?.join(", ") || "(none)"} fullWidth />
          <Fact label="Entities mentioned" value={evidence.entitiesFound?.slice(0, 20).join(", ") || "(none)"} fullWidth />
        </dl>

        {evidence.headings && evidence.headings.length > 0 ? (
          <details className="text-xs">
            <summary className="cursor-pointer text-text-muted hover:text-text">
              Headings detected ({evidence.headings.length})
            </summary>
            <ul className="mt-1 space-y-0.5 font-mono text-text">
              {evidence.headings.slice(0, 30).map((h, i) => (
                <li key={i}>
                  <span className="text-text-faint">H{h.level}:</span> {h.text}
                </li>
              ))}
              {evidence.headings.length > 30 ? <li className="text-text-faint">+ {evidence.headings.length - 30} more</li> : null}
            </ul>
          </details>
        ) : null}
      </section>
    </div>
  );
}

function scoreColor(score: number): string {
  if (score >= 85) return "text-success";
  if (score >= 70) return "text-text";
  if (score >= 50) return "text-warning";
  return "text-danger";
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

function statusBadge(status: RubricFinding["status"]) {
  if (status === "pass") return <Pill tone="success">pass</Pill>;
  if (status === "warn") return <Pill tone="warning">warn</Pill>;
  if (status === "needs_judge") return <Pill tone="info">pending</Pill>;
  return <Pill tone="danger">fail</Pill>;
}

function prettyCategory(cat: string): string {
  const m: Record<string, string> = {
    on_page: "On-page",
    structure: "Structure",
    schema: "Schema",
    internal_linking: "Internal linking",
    semantic: "Semantic coverage",
    anti_doorway: "Anti-doorway",
    eeat: "EEAT",
    local_proof: "Local proof",
  };
  return m[cat] ?? cat;
}

function Fact({ label, value, fullWidth }: { label: string; value: string | number | undefined; fullWidth?: boolean }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div className={fullWidth ? "md:col-span-2" : ""}>
      <dt className="text-text-faint">{label}</dt>
      <dd className="text-text">{value}</dd>
    </div>
  );
}
