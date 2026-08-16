/**
 * /admin/audit-log — Network-wide event log.
 *
 * Every "system did something" event lands here: fixes applied, plugin
 * deploys, CSS broadcasts, content publishes, manual ops. Operators
 * inspect a row's before/after diff to understand exactly what changed.
 */
import Link from "next/link";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { auditLog, sites, users } from "@/db/schema";
import { Pill } from "@/components/ui/Row";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination, pageParams, type SearchParams as PagerParams } from "@/components/ui/Pagination";
import { SettingsTabs } from "@/components/ui/SettingsTabs";
import { requireAdmin } from "@/lib/server-auth";
import { formatRelative } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface SearchParams { kind?: string; site?: string; }

const KIND_TONE: Record<string, "neutral" | "success" | "warning" | "danger"> = {
  fix_applied: "success",
  plugin_deployed: "success",
  theme_deployed: "success",
  css_broadcast: "success",
  page_published: "success",
  page_updated: "neutral",
  option_pushed: "neutral",
  manual_note: "neutral",
  fix_rolled_back: "warning",
  alert_resolved: "neutral",
};

export default async function AuditLogPage({
  searchParams,
}: { searchParams: Promise<SearchParams> }) {
  await ensureSchema();
  await requireAdmin();
  const params = await searchParams;
  const { page, perPage } = pageParams(params as PagerParams, 50);

  const conditions = [] as ReturnType<typeof eq>[];
  if (params.kind) conditions.push(eq(auditLog.kind, params.kind));
  if (params.site) conditions.push(eq(sites.slug, params.site));

  const rows = await db()
    .select({
      id: auditLog.id,
      kind: auditLog.kind,
      summary: auditLog.summary,
      payload: auditLog.payload,
      beforeState: auditLog.beforeState,
      afterState: auditLog.afterState,
      source: auditLog.source,
      createdAt: auditLog.createdAt,
      siteSlug: sites.slug,
      siteName: sites.name,
      actorName: users.name,
    })
    .from(auditLog)
    .leftJoin(sites, eq(sites.id, auditLog.siteId))
    .leftJoin(users, eq(users.id, auditLog.actorId))
    .where(conditions.length > 0 ? and(...conditions) : sql`true`)
    .orderBy(desc(auditLog.createdAt))
    .limit(perPage)
    .offset((page - 1) * perPage);

  // Full count for the active filter (join to sites mirrors the row query so
  // the ?site= slug filter counts correctly). Drives the pager total.
  const [{ total }] = await db()
    .select({ total: sql<number>`count(*)::int` })
    .from(auditLog)
    .leftJoin(sites, eq(sites.id, auditLog.siteId))
    .where(conditions.length > 0 ? and(...conditions) : sql`true`);

  const kindCounts = await db()
    .select({ kind: auditLog.kind, n: sql<number>`count(*)::int` })
    .from(auditLog)
    .groupBy(auditLog.kind)
    .orderBy(desc(sql<number>`count(*)::int`))
    .limit(15);

  return (
    <div className="mx-auto max-w-[1280px] space-y-6">
      <SettingsTabs active="audit-log" />
      <PageHeader
        title="Event audit log"
        subtitle="Every system change across every site, newest first. Click a row to inspect the before / after payload."
      />

      {kindCounts.length > 0 && (
        <nav className="flex flex-wrap gap-2 text-xs">
          <Link
            href="/admin/audit-log"
            className={`rounded-md border px-3 py-1 ${
              !params.kind ? "border-accent bg-accent-tint text-text" : "border-border bg-surface text-text-muted hover:bg-surface-2"
            }`}
          >
            all kinds
          </Link>
          {kindCounts.map((k) => (
            <Link
              key={k.kind}
              href={`/admin/audit-log?kind=${k.kind}`}
              className={`rounded-md border px-3 py-1 ${
                params.kind === k.kind ? "border-accent bg-accent-tint text-text" : "border-border bg-surface text-text-muted hover:bg-surface-2"
              }`}
            >
              {k.kind} · {k.n}
            </Link>
          ))}
        </nav>
      )}

      <section className="space-y-2">
        {rows.length === 0 ? (
          <EmptyState
            glyph="tasks"
            title={params.kind ? "No events of this kind" : "No events logged yet"}
            description={
              params.kind
                ? "Nothing recorded for this filter. Try another kind above."
                : "As the system applies fixes, deploys plugins, broadcasts CSS, or publishes pages, each change lands here with a full before / after diff."
            }
          />
        ) : (
          rows.map((r) => (
            <details key={r.id} className="rounded-lg border border-border bg-surface">
              <summary className="cursor-pointer list-none p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="flex items-baseline gap-3">
                    <Pill tone={KIND_TONE[r.kind] ?? "neutral"}>{r.kind}</Pill>
                    <span className="font-mono text-xs text-text-faint">{r.source}</span>
                    {r.siteSlug && (
                      <Link
                        href={`/admin/sites/${r.siteSlug}`}
                        className="text-xs text-accent hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {r.siteName}
                      </Link>
                    )}
                  </div>
                  <div className="text-xs text-text-faint">
                    {r.actorName && <span className="mr-2">{r.actorName}</span>}
                    {formatRelative(r.createdAt)}
                  </div>
                </div>
                <h3 className="mt-2 text-sm font-medium text-text">{r.summary}</h3>
              </summary>
              <div className="border-t border-border bg-surface-2 p-4 text-xs">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <div className="mb-1 text-xs uppercase tracking-wide text-text-faint">Before</div>
                    {r.beforeState ? (
                      <pre className="max-h-72 overflow-auto rounded bg-surface p-2 text-xs text-text">
                        {JSON.stringify(r.beforeState, null, 2)}
                      </pre>
                    ) : (
                      <p className="text-text-faint">(no before state captured)</p>
                    )}
                  </div>
                  <div>
                    <div className="mb-1 text-xs uppercase tracking-wide text-text-faint">After</div>
                    {r.afterState ? (
                      <pre className="max-h-72 overflow-auto rounded bg-surface p-2 text-xs text-text">
                        {JSON.stringify(r.afterState, null, 2)}
                      </pre>
                    ) : (
                      <p className="text-text-faint">(no after state captured)</p>
                    )}
                  </div>
                </div>
                {r.payload && Object.keys(r.payload as Record<string, unknown>).length > 0 && (
                  <div className="mt-3">
                    <div className="mb-1 text-xs uppercase tracking-wide text-text-faint">Payload</div>
                    <pre className="max-h-48 overflow-auto rounded bg-surface p-2 text-xs text-text">
                      {JSON.stringify(r.payload, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </details>
          ))
        )}
        <Pagination
          basePath="/admin/audit-log"
          page={page}
          totalItems={total}
          perPage={perPage}
          searchParams={params as PagerParams}
        />
      </section>
    </div>
  );
}
