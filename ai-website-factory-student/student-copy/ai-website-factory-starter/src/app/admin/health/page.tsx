/**
 * /admin/health — Network health matrix.
 *
 * Shows every site × four dimension scores + composite, with delta vs
 * previous week. Click any site → /admin/sites/[slug]/health for drill-down.
 *
 * Data source: site_health_audits (latest per site) + health_dimension_scores
 * (this-week + last-week for delta).
 */
import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { siteHealthAudits, sites, healthDimensionScores, pageHealthIssues } from "@/db/schema";
import { Pill, Row, RowList } from "@/components/ui/Row";
import { requireAdmin } from "@/lib/server-auth";
import { RunAuditButton } from "./RunAuditButton";

export const dynamic = "force-dynamic";

interface SiteRow {
  id: string;
  slug: string;
  name: string;
  domain: string;
  runDate: string | null;
  composite: number | null;
  structure: number | null;
  design: number | null;
  onpage: number | null;
  indexing: number | null;
  redCount: number;
  amberCount: number;
  compositeDelta: number | null;
}

async function loadRows(): Promise<SiteRow[]> {
  // Latest audit per site.
  const latest = db()
    .select({
      siteId: siteHealthAudits.siteId,
      maxCreated: sql<Date>`max(${siteHealthAudits.createdAt})`.as("max_created"),
    })
    .from(siteHealthAudits)
    .groupBy(siteHealthAudits.siteId)
    .as("latest");

  const all = await db()
    .select({
      id: sites.id,
      slug: sites.slug,
      name: sites.name,
      domain: sites.domain,
      runDate: siteHealthAudits.runDate,
      composite: siteHealthAudits.compositeScore,
      structure: siteHealthAudits.structureScore,
      design: siteHealthAudits.designScore,
      onpage: siteHealthAudits.onpageScore,
      indexing: siteHealthAudits.indexingScore,
      auditId: siteHealthAudits.id,
    })
    .from(sites)
    .leftJoin(latest, eq(latest.siteId, sites.id))
    .leftJoin(siteHealthAudits, sql`${siteHealthAudits.siteId} = ${sites.id} AND ${siteHealthAudits.createdAt} = ${latest.maxCreated}`)
    .orderBy(sites.name);

  // Pull issue counts + delta for the audit ids.
  const auditIds = all.map((r) => r.auditId).filter((x): x is string => !!x);
  const issueCounts = auditIds.length
    ? await db()
        .select({
          auditId: pageHealthIssues.auditId,
          red: sql<number>`count(*) filter (where ${pageHealthIssues.severity} = 'red')::int`,
          amber: sql<number>`count(*) filter (where ${pageHealthIssues.severity} = 'amber')::int`,
        })
        .from(pageHealthIssues)
        .where(sql`${pageHealthIssues.auditId} = ANY(${auditIds})`)
        .groupBy(pageHealthIssues.auditId)
    : [];
  const countsById = new Map(issueCounts.map((c) => [c.auditId, c]));

  // Delta from health_dimension_scores most recent row per site.
  const latestWeek = await db()
    .select({
      siteId: healthDimensionScores.siteId,
      compositeDelta: healthDimensionScores.compositeDelta,
    })
    .from(healthDimensionScores)
    .orderBy(desc(healthDimensionScores.weekStart));
  const deltaBySite = new Map<string, number | null>();
  for (const r of latestWeek) if (!deltaBySite.has(r.siteId)) deltaBySite.set(r.siteId, r.compositeDelta);

  return all.map((r) => ({
    id: r.id, slug: r.slug, name: r.name, domain: r.domain,
    runDate: r.runDate,
    composite: r.composite, structure: r.structure,
    design: r.design, onpage: r.onpage, indexing: r.indexing,
    redCount: r.auditId ? (countsById.get(r.auditId)?.red ?? 0) : 0,
    amberCount: r.auditId ? (countsById.get(r.auditId)?.amber ?? 0) : 0,
    compositeDelta: deltaBySite.get(r.id) ?? null,
  }));
}

function scoreCell(n: number | null): { label: string; tone: "success" | "warning" | "danger" | "neutral" } {
  if (n == null) return { label: "—", tone: "neutral" };
  if (n >= 85) return { label: String(n), tone: "success" };
  if (n >= 70) return { label: String(n), tone: "warning" };
  return { label: String(n), tone: "danger" };
}

export default async function NetworkHealthPage() {
  await ensureSchema();
  await requireAdmin();
  const rows = await loadRows();

  const totalRed = rows.reduce((a, r) => a + r.redCount, 0);
  const totalAmber = rows.reduce((a, r) => a + r.amberCount, 0);
  const flagged = rows.filter((r) => r.composite != null && r.composite < 70);

  return (
    <div className="mx-auto max-w-[1280px] space-y-10">
      <section className="space-y-3 pt-2">
        <div className="flex items-center gap-2 text-xs text-text-faint">
          <span>Network Health</span>
        </div>
        <div className="flex items-baseline justify-between">
          <h1 className="text-3xl font-medium tracking-tightish text-text">
            Site health across the network
          </h1>
          <RunAuditButton />
        </div>
        <p className="max-w-[68ch] text-md text-text-muted">
          Latest audit run for each site. Four dimensions: structure (canonical IA), design
          (header/footer/mobile/heroes), on-page SEO (title/meta/H1/schema), indexing (sitemap
          coverage). Composite &lt; 70 flagged for priority intervention.
        </p>
        <div className="flex items-center gap-4 pt-1 text-base text-text-faint">
          <span><span className="text-text">{rows.length}</span> sites</span>
          <span className="text-text-faint">·</span>
          <span><span className="text-red-500">{totalRed}</span> red findings</span>
          <span className="text-text-faint">·</span>
          <span><span className="text-amber-500">{totalAmber}</span> amber findings</span>
          {flagged.length > 0 && (
            <>
              <span className="text-text-faint">·</span>
              <span><span className="text-red-500">{flagged.length}</span> need priority intervention</span>
            </>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium tracking-tightish text-text">Network matrix</h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-md">
            <thead>
              <tr className="border-b border-border text-left text-xs text-text-faint">
                <th className="py-2 pr-4 font-medium">Site</th>
                <th className="py-2 px-3 font-medium">Structure</th>
                <th className="py-2 px-3 font-medium">Design</th>
                <th className="py-2 px-3 font-medium">On-page</th>
                <th className="py-2 px-3 font-medium">Indexing</th>
                <th className="py-2 px-3 font-medium">Composite</th>
                <th className="py-2 px-3 font-medium">Δ</th>
                <th className="py-2 px-3 font-medium">Findings</th>
                <th className="py-2 px-3 font-medium">Run</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const dims = [r.structure, r.design, r.onpage, r.indexing].map(scoreCell);
                const comp = scoreCell(r.composite);
                const deltaStr = r.compositeDelta == null ? "—" : (r.compositeDelta > 0 ? `+${r.compositeDelta}` : String(r.compositeDelta));
                return (
                  <tr key={r.id} className="border-b border-border/40 hover:bg-surface-elevated">
                    <td className="py-2 pr-4">
                      <Link href={`/admin/sites/${r.slug}/health`} className="text-text hover:text-accent">
                        <div className="font-medium">{r.name}</div>
                        <div className="text-xs text-text-faint">{r.domain}</div>
                      </Link>
                    </td>
                    {dims.map((d, i) => (
                      <td key={i} className={`py-2 px-3 font-mono ${
                        d.tone === "success" ? "text-green-700" :
                        d.tone === "warning" ? "text-amber-600" :
                        d.tone === "danger" ? "text-red-600" : "text-text-faint"
                      }`}>{d.label}</td>
                    ))}
                    <td className={`py-2 px-3 font-mono font-semibold ${
                      comp.tone === "success" ? "text-green-700" :
                      comp.tone === "warning" ? "text-amber-600" :
                      comp.tone === "danger" ? "text-red-600" : "text-text-faint"
                    }`}>{comp.label}</td>
                    <td className={`py-2 px-3 font-mono text-xs ${
                      r.compositeDelta != null && r.compositeDelta > 0 ? "text-green-700" :
                      r.compositeDelta != null && r.compositeDelta < 0 ? "text-red-600" :
                      "text-text-faint"
                    }`}>{deltaStr}</td>
                    <td className="py-2 px-3 text-xs">
                      {r.redCount > 0 && <span className="text-red-500">{r.redCount} red</span>}
                      {r.redCount > 0 && r.amberCount > 0 && <span className="text-text-faint"> · </span>}
                      {r.amberCount > 0 && <span className="text-amber-500">{r.amberCount} amber</span>}
                      {r.redCount === 0 && r.amberCount === 0 && <span className="text-text-faint">—</span>}
                    </td>
                    <td className="py-2 px-3 text-xs text-text-faint">{r.runDate ?? "never"}</td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr><td colSpan={9} className="py-6 text-center text-md text-text-muted">
                  No sites yet. Add sites at <Link href="/admin/sites" className="text-accent hover:underline">/admin/sites</Link>.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {flagged.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-medium tracking-tightish text-text">Priority intervention</h2>
          <RowList>
            {flagged.map((r) => {
              const weak = [
                r.structure != null && r.structure < 70 ? `structure ${r.structure}` : null,
                r.design != null && r.design < 70 ? `design ${r.design}` : null,
                r.onpage != null && r.onpage < 70 ? `onpage ${r.onpage}` : null,
                r.indexing != null && r.indexing < 70 ? `indexing ${r.indexing}` : null,
              ].filter(Boolean).join(" · ");
              return (
                <Row key={r.id} href={`/admin/sites/${r.slug}/health`}>
                  <div className="flex w-full items-center gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="text-md text-text">{r.name}</div>
                      <div className="text-xs text-text-faint">weakest: {weak || "—"}</div>
                    </div>
                    <Pill tone="warning">composite {r.composite}</Pill>
                  </div>
                </Row>
              );
            })}
          </RowList>
        </section>
      )}
    </div>
  );
}
