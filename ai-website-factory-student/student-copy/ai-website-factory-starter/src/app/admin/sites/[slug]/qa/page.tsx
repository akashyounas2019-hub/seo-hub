/**
 * A2 — Per-site QA history.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { qaRuns, sites } from "@/db/schema";
import { enqueueQaRunAction } from "@/app/actions/qa";
import { Pill, Row, RowList } from "@/components/ui/Row";
import { SiteTabs } from "../SiteTabs";
import { requireAdmin } from "@/lib/server-auth";
import { formatRelative } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function SiteQaHistoryPage({ params }: { params: { slug: string } }) {
  await ensureSchema();
  await requireAdmin();
  const [site] = await db().select().from(sites).where(eq(sites.slug, params.slug)).limit(1);
  if (!site) notFound();

  const runs = await db()
    .select()
    .from(qaRuns)
    .where(eq(qaRuns.siteId, site.id))
    .orderBy(desc(qaRuns.createdAt))
    .limit(30);

  return (
    <div className="space-y-6">
      <header className="brand-rule">
        <Link href={`/admin/sites/${site.slug}`} className="text-xs text-text-faint hover:text-text">
          ← {site.name}
        </Link>
        <div className="mt-1 flex items-baseline justify-between gap-3">
          <h1 className="">QA history</h1>
          <form action={enqueueQaRunAction}>
            <input type="hidden" name="siteSlug" value={site.slug} />
            <input type="hidden" name="scope" value="site" />
            <button type="submit" className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-brand-navy-deep hover:bg-accent-hover">
              Run QA now →
            </button>
          </form>
        </div>
        <p className="mt-1.5 text-xs text-text-muted">
          Every run tests this site across mobile, tablet, desktop and wide viewports — looking for layout breaks, broken buttons, form failures, and missing industry conventions.
        </p>
      </header>
      <SiteTabs slug={params.slug} />

      {runs.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-6 text-xs text-text-muted">
          <p className="font-medium text-text">No QA runs yet.</p>
          <p className="mt-1">Click &quot;Run QA now&quot; above. The first one takes ~2 minutes.</p>
        </div>
      ) : (
        <RowList footer={`${runs.length} run${runs.length === 1 ? "" : "s"}`}>
          {runs.map((r) => (
            <Row key={r.id}>
              <Link href={`/admin/agent/qa/${r.id}`} className="flex flex-1 items-center gap-3">
                <Pill
                  tone={
                    r.status === "done"
                      ? r.failCount > 0
                        ? "danger"
                        : r.warnCount > 0
                          ? "warning"
                          : "success"
                      : r.status === "running"
                        ? "info"
                        : r.status === "failed"
                          ? "danger"
                          : "neutral"
                  }
                >
                  {r.status}
                </Pill>
                <span className="font-mono text-xs text-text-faint">{r.scope}</span>
                <span className="flex-1 truncate text-xs text-text-muted">{r.summary ?? "Awaiting worker..."}</span>
                <span className="shrink-0 tnum text-xs text-success">{r.passCount}p</span>
                <span className="shrink-0 tnum text-xs text-warning">{r.warnCount}w</span>
                <span className="shrink-0 tnum text-xs text-danger">{r.failCount}f</span>
                <span className="shrink-0 text-xs text-text-faint">{formatRelative(r.createdAt)}</span>
              </Link>
            </Row>
          ))}
        </RowList>
      )}
    </div>
  );
}
