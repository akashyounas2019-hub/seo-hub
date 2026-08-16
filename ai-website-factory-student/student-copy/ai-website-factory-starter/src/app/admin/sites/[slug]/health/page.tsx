/**
 * /admin/sites/[slug]/health — Per-site health drill-down.
 *
 * Shows the latest audit's 4 dimension scores, the ranked findings list
 * (red first), and a sparkline of composite over the last 8 weeks.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq, sql } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import {
  sites,
  siteHealthAudits,
  pageHealthIssues,
  healthDimensionScores,
} from "@/db/schema";
import { Pill, Row, RowList } from "@/components/ui/Row";
import { SiteTabs } from "../SiteTabs";
import { requireAdmin } from "@/lib/server-auth";
import { RunAuditButton } from "../../../health/RunAuditButton";
import { RunSectionWatchButton } from "../../../seo-health/RunSectionWatchButton";
import { REQUIRED_SECTIONS, SECTION_LABELS, type PageType } from "@/lib/section-schema";

export const dynamic = "force-dynamic";

interface PageProps { params: { slug: string } }

const DIMENSIONS = [
  { key: "structure", label: "Structure", desc: "Canonical IA + spokes + machine files" },
  { key: "design",    label: "Design",    desc: "Header/footer parity + mobile + heroes" },
  { key: "onpage",    label: "On-page",   desc: "Title/meta/H1/schema per checklist" },
  { key: "indexing",  label: "Indexing",  desc: "Sitemap probe + GSC reasons" },
] as const;

function scoreTone(n: number | null): "success" | "warning" | "danger" | "neutral" {
  if (n == null) return "neutral";
  if (n >= 85) return "success";
  if (n >= 70) return "warning";
  return "danger";
}

export default async function SiteHealthPage({ params }: PageProps) {
  await ensureSchema();
  await requireAdmin();

  const [site] = await db().select().from(sites).where(eq(sites.slug, params.slug)).limit(1);
  if (!site) notFound();

  const [audit] = await db()
    .select()
    .from(siteHealthAudits)
    .where(eq(siteHealthAudits.siteId, site.id))
    .orderBy(desc(siteHealthAudits.createdAt))
    .limit(1);

  const issues = audit
    ? await db()
        .select()
        .from(pageHealthIssues)
        .where(eq(pageHealthIssues.auditId, audit.id))
        .orderBy(desc(pageHealthIssues.severity))
    : [];

  const weeks = await db()
    .select()
    .from(healthDimensionScores)
    .where(eq(healthDimensionScores.siteId, site.id))
    .orderBy(desc(healthDimensionScores.weekStart))
    .limit(8);

  // Bucket issues by dimension
  const byDim = new Map<string, typeof issues>();
  for (const i of issues) {
    const list = byDim.get(i.dimension) ?? [];
    list.push(i);
    byDim.set(i.dimension, list);
  }

  // Section Watch — per-page present/missing checklist. The ingest route stores
  // a `sections` summary inside the audit's `raw` jsonb.
  const rawSections = (audit?.raw as { sections?: {
    runAt?: string;
    pages?: Array<{ url: string; pageType: string; present: string[]; missing: string[] }>;
  } } | undefined)?.sections;
  const sectionPages = rawSections?.pages ?? [];

  return (
    <div className="mx-auto max-w-[1080px] space-y-8">
      <section className="space-y-3 pt-2">
        <div className="flex items-center gap-2 text-xs text-text-faint">
          <Link href="/admin/health" className="hover:text-text">Network Health</Link>
          <span>·</span>
          <Link href={`/admin/sites/${site.slug}`} className="hover:text-text">{site.name}</Link>
          <span>·</span>
          <span>Health</span>
        </div>
        <div className="flex items-baseline justify-between">
          <h1 className="text-3xl font-medium tracking-tightish text-text">
            {site.name} — Health
          </h1>
          <RunAuditButton siteId={site.id} />
        </div>
        <p className="text-md text-text-muted">
          {site.domain} ·{" "}
          {audit ? `Last audited ${audit.runDate}` : "No audit run yet — kick one off."}
        </p>
      </section>

      {audit ? (
        <>
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            {DIMENSIONS.map((d) => {
              const score = (audit as Record<string, unknown>)[`${d.key}Score`] as number | null;
              const tone = scoreTone(score);
              return (
                <div key={d.key} className="rounded-md border border-border bg-surface p-4">
                  <div className="text-xs uppercase tracking-wide text-text-faint">{d.label}</div>
                  <div className={`mt-2 text-3xl font-semibold ${
                    tone === "success" ? "text-green-700" :
                    tone === "warning" ? "text-amber-600" :
                    tone === "danger" ? "text-red-600" : "text-text-faint"
                  }`}>
                    {score ?? "—"}
                    <span className="text-base font-normal text-text-faint">/100</span>
                  </div>
                  <p className="mt-2 text-xs text-text-faint">{d.desc}</p>
                </div>
              );
            })}
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-medium tracking-tightish text-text">
              Composite — last 8 weeks
            </h2>
            <div className="rounded-md border border-border bg-surface p-4">
              <div className="flex items-end gap-1 h-32">
                {weeks.slice().reverse().map((w) => {
                  const h = (w.composite ?? 0);
                  const tone = scoreTone(w.composite);
                  return (
                    <div key={w.id} className="flex-1 flex flex-col items-center justify-end">
                      <div
                        className={`w-full ${
                          tone === "success" ? "bg-green-500" :
                          tone === "warning" ? "bg-amber-500" :
                          tone === "danger" ? "bg-red-500" : "bg-slate-300"
                        }`}
                        style={{ height: `${Math.max(2, h)}%` }}
                        title={`${w.weekStart}: ${w.composite ?? "—"}`}
                      />
                      <div className="mt-1 text-xs text-text-faint truncate w-full text-center">{w.weekStart.slice(5)}</div>
                    </div>
                  );
                })}
                {weeks.length === 0 && (
                  <div className="w-full text-center text-md text-text-muted py-8">
                    No history yet. Sparkline fills in after a few weekly audits.
                  </div>
                )}
              </div>
            </div>
          </section>

          {Array.from(byDim.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([dim, list]) => {
            const reds = list.filter((i) => i.severity === "red");
            const ambers = list.filter((i) => i.severity === "amber");
            const dimLabel = DIMENSIONS.find((d) => d.key === dim)?.label ?? dim;
            return (
              <section key={dim} className="space-y-3">
                <header className="flex items-baseline justify-between border-b border-border pb-2">
                  <h2 className="text-lg font-medium tracking-tightish text-text">
                    {dimLabel} findings
                  </h2>
                  <span className="text-xs text-text-faint">
                    {reds.length > 0 && <span className="text-red-500">{reds.length} red</span>}
                    {reds.length > 0 && ambers.length > 0 && " · "}
                    {ambers.length > 0 && <span className="text-amber-500">{ambers.length} amber</span>}
                  </span>
                </header>
      <SiteTabs slug={params.slug} />
                <RowList>
                  {[...reds, ...ambers].slice(0, 25).map((i) => (
                    <Row key={i.id}>
                      <div className="flex w-full items-center gap-3">
                        <Pill tone={i.severity === "red" ? "danger" : "warning"}>
                          {i.severity}
                        </Pill>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-md text-text">{i.label}</div>
                          <div className="truncate text-xs text-text-faint">
                            {i.pageUrl ?? "site-wide"} · <code>{i.issueKey}</code>
                          </div>
                        </div>
                      </div>
                    </Row>
                  ))}
                  {list.length > 25 && (
                    <div className="rounded-md border border-border bg-surface px-3 py-2 text-xs text-text-faint">
                      _… and {list.length - 25} more findings_
                    </div>
                  )}
                  {list.length === 0 && (
                    <div className="rounded-md border border-border bg-surface px-3 py-3 text-md text-text-muted">
                      No findings for this dimension.
                    </div>
                  )}
                </RowList>
              </section>
            );
          })}

          {/* ── Section Watch — required-section checklist per page type ──── */}
          <section className="space-y-3">
            <header className="flex items-baseline justify-between border-b border-border pb-2">
              <div>
                <h2 className="text-lg font-medium tracking-tightish text-text">Sections</h2>
                <p className="text-xs text-text-faint">
                  Canonical section coverage per page type, detected by the $0 vision watch.
                </p>
              </div>
              <RunSectionWatchButton siteId={site.id} />
            </header>
            {sectionPages.length === 0 ? (
              <div className="rounded-md border border-border bg-surface px-3 py-3 text-md text-text-muted">
                No section watch has run yet. Use <strong>Run section watch</strong> above — the Mac worker captures one
                representative page per type and flags which required sections are missing.
              </div>
            ) : (
              <div className="space-y-4">
                {sectionPages.map((p) => {
                  const pageType = p.pageType as PageType;
                  const required = REQUIRED_SECTIONS[pageType] ?? REQUIRED_SECTIONS.other;
                  const presentSet = new Set(p.present ?? []);
                  return (
                    <div key={p.url} className="rounded-md border border-border bg-surface p-4">
                      <div className="flex items-baseline justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-md font-medium text-text">{pageType}</div>
                          <div className="truncate text-xs text-text-faint">{p.url}</div>
                        </div>
                        <span className="shrink-0 text-xs text-text-faint">
                          {(p.missing?.length ?? 0) === 0
                            ? "all sections present"
                            : `${p.missing.length} missing`}
                        </span>
                      </div>
                      {required.length === 0 ? (
                        <p className="mt-2 text-xs text-text-faint">No canonical sections defined for this page type.</p>
                      ) : (
                        <ul className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                          {required.map((req) => {
                            const has = presentSet.has(req.type);
                            return (
                              <li key={req.type} className="flex items-center gap-2 text-md">
                                <span
                                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                                    has
                                      ? "bg-success/15 text-success"
                                      : req.severity === "red"
                                        ? "bg-danger/15 text-danger"
                                        : "bg-warning/15 text-warning"
                                  }`}
                                >
                                  {has ? "✓" : "✗"}
                                </span>
                                <span className={has ? "text-text" : "text-text-muted"}>
                                  {SECTION_LABELS[req.type] ?? req.type}
                                </span>
                                {!has && (
                                  <span
                                    className={`ml-auto text-xs uppercase tracking-wide ${
                                      req.severity === "red" ? "text-danger" : "text-warning"
                                    }`}
                                  >
                                    {req.severity}
                                  </span>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      ) : (
        <section className="rounded-md border border-border bg-surface px-6 py-10 text-center text-md text-text-muted">
          No audit data yet. Use the <strong>Re-audit this site</strong> button above. The Mac worker will run the four-dimension audit on your Claude Code subscription.
        </section>
      )}
    </div>
  );
}
