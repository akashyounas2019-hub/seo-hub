import { desc, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/server-auth";
import { db, ensureSchema } from "@/db/client";
import { seoProposals, sitePages, sites } from "@/db/schema";
import { PageHeader } from "@/components/ui/PageHeader";
import { TechnicalScoutTabs } from "@/components/ui/TechnicalScoutTabs";
import { EmptyState } from "@/components/ui/EmptyState";
import { Stat } from "@/components/ui/Stat";
import { formatRelative } from "@/lib/utils";
import {
  approveSchemaProposalAction,
  generateSchemaForPageAction,
  rejectSchemaProposalAction,
} from "@/app/actions/schema-architect";

export const dynamic = "force-dynamic";

const SCHEMA_TYPE_TABS = [
  { key: "all", label: "All types" },
  { key: "Service", label: "Service" },
  { key: "FAQPage", label: "FAQ" },
  { key: "LocalBusiness", label: "LocalBusiness" },
  { key: "AggregateRating", label: "AggregateRating" },
] as const;

function statusStyle(status: "deployed" | "pending" | "missing") {
  switch (status) {
    case "deployed":
      return { bg: "var(--success-tint)", color: "var(--success)", label: "Deployed" };
    case "pending":
      return { bg: "var(--warning-tint)", color: "var(--warning)", label: "Pending approval" };
    case "missing":
      return { bg: "var(--danger-tint)", color: "var(--danger)", label: "Missing" };
  }
}

export default async function SchemaArchitectPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; ok?: string; error?: string }>;
}) {
  await ensureSchema();
  await requireAdmin();
  const sp = await searchParams;
  const activeType = sp.type ?? "all";

  const d = db();

  // ── All schema_inject proposals, newest first, across every site ──
  const allSchemaProposals = await d
    .select({
      id: seoProposals.id,
      siteId: seoProposals.siteId,
      siteSlug: sites.slug,
      siteName: sites.name,
      siteDomain: sites.domain,
      status: seoProposals.status,
      payload: seoProposals.payload,
      rationale: seoProposals.rationale,
      createdAt: seoProposals.createdAt,
      appliedAt: seoProposals.appliedAt,
      errorMessage: seoProposals.errorMessage,
    })
    .from(seoProposals)
    .innerJoin(sites, eq(sites.id, seoProposals.siteId))
    .where(eq(seoProposals.kind, "schema_inject"))
    .orderBy(desc(seoProposals.createdAt))
    .limit(300);

  type ProposalRow = (typeof allSchemaProposals)[number];
  const schemaTypeOf = (p: ProposalRow): string =>
    typeof (p.payload as Record<string, unknown>)?.schema_type === "string"
      ? ((p.payload as Record<string, unknown>).schema_type as string)
      : "Unknown";
  const urlOf = (p: ProposalRow): string =>
    typeof (p.payload as Record<string, unknown>)?.page_url === "string"
      ? ((p.payload as Record<string, unknown>).page_url as string)
      : "";

  const filtered = activeType === "all" ? allSchemaProposals : allSchemaProposals.filter((p) => schemaTypeOf(p) === activeType);

  const pending = filtered.filter((p) => p.status === "pending");
  const applied = filtered.filter((p) => p.status === "applied");
  const failed = filtered.filter((p) => p.status === "failed");

  // ── Latest status per (site, url) — for "page x has y schema, status z" ──
  const latestByPageUrl = new Map<string, ProposalRow>();
  for (const p of allSchemaProposals) {
    const key = `${p.siteId}::${urlOf(p)}`;
    if (!key || !urlOf(p)) continue;
    const existing = latestByPageUrl.get(key);
    if (!existing || p.createdAt > existing.createdAt) latestByPageUrl.set(key, p);
  }

  // ── Candidate pages still missing schema entirely: pull a sample of
  // published pages per site that have never had a schema_inject proposal
  // at all, so the admin can pick one and hit "Generate now". ──
  const candidatePages = await d
    .select({
      id: sitePages.id,
      siteId: sitePages.siteId,
      siteSlug: sites.slug,
      siteName: sites.name,
      url: sitePages.url,
      title: sitePages.title,
      postType: sitePages.postType,
    })
    .from(sitePages)
    .innerJoin(sites, eq(sites.id, sitePages.siteId))
    .where(eq(sitePages.status, "publish"))
    .orderBy(desc(sitePages.lastSyncedAt))
    .limit(500);

  const proposedUrls = new Set(allSchemaProposals.map((p) => `${p.siteId}::${urlOf(p)}`));
  const missingPages = candidatePages
    .filter((pg) => !proposedUrls.has(`${pg.siteId}::${pg.url}`))
    .slice(0, 30);

  const totalApplied = allSchemaProposals.filter((p) => p.status === "applied").length;
  const totalPending = allSchemaProposals.filter((p) => p.status === "pending").length;
  const totalFailed = allSchemaProposals.filter((p) => p.status === "failed").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Schema Architect"
        subtitle="Generate and deploy JSON-LD structured data — Service, FAQ, LocalBusiness, and AggregateRating schema, applied through the same SEO proposal pipeline as every other autopilot fix."
      />

      <TechnicalScoutTabs />

      {sp.error ? (
        <div className="rounded-lg border px-4 py-3 text-sm" style={{ borderColor: "var(--danger)", background: "var(--danger-tint)", color: "var(--danger)" }}>
          {decodeURIComponent(sp.error)}
        </div>
      ) : null}
      {sp.ok === "generated" ? (
        <div className="rounded-lg border px-4 py-3 text-sm" style={{ borderColor: "var(--success)", background: "var(--success-tint)", color: "var(--success)" }}>
          Schema generated and added to the pending queue below.
        </div>
      ) : null}

      {/* ── Stat strip ── */}
      <section className="grid grid-cols-3 gap-3">
        <Stat label="Deployed" value={totalApplied} tone="success" />
        <Stat label="Awaiting approval" value={totalPending} tone={totalPending > 0 ? "warning" : "neutral"} />
        <Stat label="Failed" value={totalFailed} tone={totalFailed > 0 ? "danger" : "neutral"} />
      </section>

      {/* ── Schema type filter ── */}
      <section className="flex flex-wrap gap-2">
        {SCHEMA_TYPE_TABS.map((t) => {
          const isActive = activeType === t.key;
          const href = t.key === "all" ? "/admin/schema-architect" : `/admin/schema-architect?type=${encodeURIComponent(t.key)}`;
          return (
            <a
              key={t.key}
              href={href}
              className="rounded-lg px-4 py-2 text-sm font-medium transition-colors"
              style={
                isActive
                  ? { background: "var(--accent)", color: "#fff" }
                  : { background: "var(--surface-2)", color: "var(--text-muted)", border: "1px solid var(--border)" }
              }
            >
              {t.label}
            </a>
          );
        })}
      </section>

      {/* ── Pending proposals — approve/reject ── */}
      <section className="rounded-xl border border-border bg-surface">
        <div className="px-5 py-4">
          <h2 className="text-sm font-medium text-text">Awaiting approval ({pending.length})</h2>
          <p className="mt-1 text-xs text-text-faint">
            LLM-generated JSON-LD, validated (structural + linked-URL checks) before it ever reaches here. Review and approve to push live via the WP plugin&rsquo;s <code className="font-mono">/seo-apply</code> endpoint.
          </p>
        </div>
        {pending.length === 0 ? (
          <div className="px-5 pb-5">
            <EmptyState glyph="spark" title="Nothing waiting" description="Generate schema for a page below, or wait for the next npm run seo:scan cron pass." />
          </div>
        ) : (
          <div className="divide-y divide-border">
            {pending.map((p) => {
              const payload = p.payload as Record<string, unknown>;
              const jsonLd = typeof payload.json_ld === "string" ? payload.json_ld : "";
              let pretty = jsonLd;
              try {
                pretty = JSON.stringify(JSON.parse(jsonLd), null, 2);
              } catch {
                // leave as-is if it somehow isn't parseable JSON
              }
              return (
                <div key={p.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="text-sm font-medium text-text">{p.siteName}</span>
                        <span className="font-mono text-xs text-text-faint">{urlOf(p)}</span>
                        <span
                          className="rounded px-1.5 py-0.5 text-[11px] font-medium"
                          style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}
                        >
                          {schemaTypeOf(p)}
                        </span>
                      </div>
                      {p.rationale ? <p className="mt-1 text-xs text-text-faint">{p.rationale}</p> : null}
                    </div>
                    <span className="shrink-0 text-xs text-text-faint">{formatRelative(p.createdAt)}</span>
                  </div>
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-accent hover:underline">View JSON-LD</summary>
                    <div className="mt-2 overflow-x-auto rounded-lg border border-border p-3" style={{ background: "var(--surface-2)" }}>
                      <pre className="font-mono text-xs leading-relaxed text-text-muted">{pretty}</pre>
                    </div>
                  </details>
                  <div className="mt-3 flex gap-2">
                    <form action={approveSchemaProposalAction}>
                      <input type="hidden" name="proposalId" value={p.id} />
                      <button
                        type="submit"
                        className="inline-flex h-7 items-center rounded-sm bg-accent px-3 text-xs font-medium text-accent-fg hover:bg-accent-hover"
                      >
                        Approve &amp; deploy
                      </button>
                    </form>
                    <form action={rejectSchemaProposalAction}>
                      <input type="hidden" name="proposalId" value={p.id} />
                      <button
                        type="submit"
                        className="inline-flex h-7 items-center rounded-sm bg-surface-2 px-3 text-xs font-medium text-text-muted hover:bg-surface-3 hover:text-text"
                      >
                        Reject
                      </button>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Deployed schema ── */}
      <section className="rounded-xl border border-border bg-surface">
        <div className="px-5 py-4">
          <h2 className="text-sm font-medium text-text">Deployed ({applied.length})</h2>
          <p className="mt-1 text-xs text-text-faint">Live on the page right now, via a previously-approved proposal.</p>
        </div>
        {applied.length === 0 ? (
          <div className="px-5 pb-5 text-xs text-text-faint">Nothing deployed yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-y border-border text-xs text-text-faint">
                  <th className="px-5 py-2 font-medium">Site</th>
                  <th className="px-3 py-2 font-medium">Page URL</th>
                  <th className="px-3 py-2 font-medium">Schema type</th>
                  <th className="px-3 py-2 font-medium text-right">Deployed</th>
                </tr>
              </thead>
              <tbody>
                {applied.slice(0, 50).map((p) => (
                  <tr key={p.id} className="border-b border-border last:border-0">
                    <td className="px-5 py-2.5 text-sm text-text">{p.siteName}</td>
                    <td className="px-3 py-2.5 font-mono text-xs text-text-muted">{urlOf(p)}</td>
                    <td className="px-3 py-2.5">
                      <span className="rounded px-1.5 py-0.5 text-[11px] font-medium" style={{ background: "var(--success-tint)", color: "var(--success)" }}>
                        {schemaTypeOf(p)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs text-text-faint">{p.appliedAt ? formatRelative(p.appliedAt) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {failed.length > 0 ? (
        <section className="rounded-xl border border-border bg-surface">
          <div className="px-5 py-4">
            <h2 className="text-sm font-medium text-text">Failed deploys ({failed.length})</h2>
            <p className="mt-1 text-xs text-text-faint">The plugin rejected the apply call — usually a stale plugin version or a closed site.</p>
          </div>
          <div className="divide-y divide-border">
            {failed.slice(0, 20).map((p) => (
              <div key={p.id} className="px-5 py-3">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-sm font-medium text-text">{p.siteName}</span>
                  <span className="font-mono text-xs text-text-faint">{urlOf(p)}</span>
                  <span className="rounded px-1.5 py-0.5 text-[11px] font-medium" style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
                    {schemaTypeOf(p)}
                  </span>
                </div>
                {p.errorMessage ? <p className="mt-1 text-xs" style={{ color: "var(--danger)" }}>{p.errorMessage}</p> : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* ── Pages with no schema proposal yet — generate on demand ── */}
      <section className="rounded-xl border border-border bg-surface">
        <div className="px-5 py-4">
          <h2 className="text-sm font-medium text-text">Pages without schema ({missingPages.length})</h2>
          <p className="mt-1 text-xs text-text-faint">
            Published pages that have never had a schema proposal generated. The nightly <code className="font-mono">npm run seo:scan</code> cron will eventually reach these — or generate one now.
          </p>
        </div>
        {missingPages.length === 0 ? (
          <div className="px-5 pb-5 text-xs text-text-faint">
            Every synced page already has a schema proposal on record (pending, deployed, or failed).
          </div>
        ) : (
          <div className="divide-y divide-border">
            {missingPages.map((pg) => {
              const last = latestByPageUrl.get(`${pg.siteId}::${pg.url}`);
              const status: "deployed" | "pending" | "missing" = last
                ? last.status === "applied" ? "deployed" : last.status === "pending" ? "pending" : "missing"
                : "missing";
              const st = statusStyle(status);
              return (
                <div key={pg.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="text-sm font-medium text-text">{pg.siteName}</span>
                      <span className="truncate font-mono text-xs text-text-faint">{pg.url}</span>
                      <span className="rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ background: st.bg, color: st.color }}>
                        {st.label}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-text-faint">{pg.title}</p>
                  </div>
                  <form action={generateSchemaForPageAction}>
                    <input type="hidden" name="pageId" value={pg.id} />
                    <button
                      type="submit"
                      className="inline-flex h-7 shrink-0 items-center rounded-sm bg-accent px-3 text-xs font-medium text-accent-fg hover:bg-accent-hover"
                    >
                      Generate now
                    </button>
                  </form>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

