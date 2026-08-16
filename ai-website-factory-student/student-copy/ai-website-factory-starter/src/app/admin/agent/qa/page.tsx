/**
 * A2 — Network QA dashboard.
 *
 * Shows recent QA runs across every site + a failure inbox for the
 * highest-severity open issues.
 */
import Link from "next/link";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { qaChecks, qaRuns, sites } from "@/db/schema";
import { enqueueQaRunAction } from "@/app/actions/qa";
import { Pill, Row, RowList } from "@/components/ui/Row";
import { Pagination, pageParams, type SearchParams } from "@/components/ui/Pagination";
import { checkLabel } from "@/lib/qa-checks";
import { requireAdmin } from "@/lib/server-auth";
import { formatRelative } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function QaDashboardPage({
  searchParams = {},
}: {
  searchParams?: SearchParams & { error?: string };
}) {
  await ensureSchema();
  await requireAdmin();
  const d = db();

  const { page, perPage } = pageParams(searchParams);

  const [runsCountRow, recentRuns] = await Promise.all([
    d.select({ n: sql<number>`count(*)::int` }).from(qaRuns),
    d
      .select({
        r: qaRuns,
        siteSlug: sites.slug,
        siteName: sites.name,
      })
      .from(qaRuns)
      .leftJoin(sites, eq(sites.id, qaRuns.siteId))
      .orderBy(desc(qaRuns.createdAt))
      .limit(perPage)
      .offset((page - 1) * perPage),
  ]);
  const runsTotal = runsCountRow[0]?.n ?? 0;

  // Top open failures (severity high or critical) from the last 7 days
  const sevenDays = new Date(Date.now() - 7 * 24 * 3600_000);
  const topFailures = await d
    .select({
      c: qaChecks,
      siteSlug: sites.slug,
      siteName: sites.name,
    })
    .from(qaChecks)
    .leftJoin(sites, eq(sites.id, qaChecks.siteId))
    .where(
      and(
        eq(qaChecks.status, "fail"),
        eq(qaChecks.suppressed, false),
        sql`${qaChecks.createdAt} >= ${sevenDays.toISOString()}::timestamptz`,
        sql`${qaChecks.severity} in ('high', 'critical')`,
      ),
    )
    .orderBy(desc(qaChecks.createdAt))
    .limit(30);

  const allSites = await d.select({ slug: sites.slug, name: sites.name }).from(sites).orderBy(sites.name);

  // Aggregate counts
  const [counts] = await d
    .select({
      runs7d: sql<number>`count(*) filter (where ${qaRuns.createdAt} >= ${sevenDays.toISOString()}::timestamptz)::int`,
      runsPending: sql<number>`count(*) filter (where status = 'pending')::int`,
      runsRunning: sql<number>`count(*) filter (where status = 'running')::int`,
    })
    .from(qaRuns);
  const [checkCounts] = await d
    .select({
      passes7d: sql<number>`count(*) filter (where status='pass' and ${qaChecks.createdAt} >= ${sevenDays.toISOString()}::timestamptz)::int`,
      warns7d: sql<number>`count(*) filter (where status='warn' and ${qaChecks.createdAt} >= ${sevenDays.toISOString()}::timestamptz)::int`,
      fails7d: sql<number>`count(*) filter (where status='fail' and ${qaChecks.createdAt} >= ${sevenDays.toISOString()}::timestamptz)::int`,
    })
    .from(qaChecks);

  return (
    <div className="space-y-6">
      <header className="brand-rule">
        <h1 className="">
          QA Suite
        </h1>
        <p className="mt-1.5 text-xs text-text-muted">
          Multi-viewport (mobile/tablet/desktop/wide) UI &amp; functional testing. Detects text overflow, broken buttons, form failures, missing industry conventions.
        </p>
      </header>

      {searchParams.error ? (
        <div className="rounded-md border border-warning/30 bg-warning-tint px-3 py-2 text-xs text-warning">
          {searchParams.error}
        </div>
      ) : null}

      {/* KPI strip */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi label="Runs (7d)" value={counts?.runs7d ?? 0} />
        <Kpi label="Passed checks" value={checkCounts?.passes7d ?? 0} tone="success" />
        <Kpi label="Warnings" value={checkCounts?.warns7d ?? 0} tone="warning" />
        <Kpi label="Failures" value={checkCounts?.fails7d ?? 0} tone="danger" />
        <Kpi label="Queued" value={(counts?.runsPending ?? 0) + (counts?.runsRunning ?? 0)} tone="info" />
      </section>

      {/* Enqueue a run */}
      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="">Run QA on a site</h2>
        <p className="text-xs text-text-faint">
          Schedules the run. The worker on the VPS picks it up immediately (or runs in the nightly batch at 02:00 UTC).
        </p>
        <form action={enqueueQaRunAction} className="mt-3 flex flex-wrap items-end gap-2">
          <label className="block">
            <span className="block text-xs font-medium uppercase tracking-[0.06em] text-text-faint">Site</span>
            <select
              name="siteSlug"
              required
              defaultValue=""
              className="mt-1 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs outline-none focus:border-accent"
            >
              <option value="" disabled>Choose…</option>
              {allSites.map((s) => (
                <option key={s.slug} value={s.slug}>{s.name}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs font-medium uppercase tracking-[0.06em] text-text-faint">Scope</span>
            <select
              name="scope"
              defaultValue="site"
              className="mt-1 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs outline-none focus:border-accent"
            >
              <option value="site">Full site (home + booking + contact)</option>
              <option value="page">Single page (specify URL)</option>
            </select>
          </label>
          <label className="block flex-1">
            <span className="block text-xs font-medium uppercase tracking-[0.06em] text-text-faint">URL (page scope only)</span>
            <input
              name="scopeRef"
              placeholder="/book-now or https://full.url/page"
              className="mt-1 w-full rounded-md border border-border bg-surface px-2.5 py-1.5 font-mono text-xs outline-none focus:border-accent"
            />
          </label>
          <button type="submit" className="rounded-md bg-accent px-4 py-1.5 text-xs font-medium text-brand-navy-deep hover:bg-accent-hover">
            Queue run →
          </button>
        </form>
      </section>

      {/* Top failures inbox */}
      <section>
        <h2 className="mb-2 text-base font-semibold text-text">Open failures (last 7 days)</h2>
        {topFailures.length === 0 ? (
          <div className="rounded-lg border border-border bg-surface p-6 text-xs text-text-muted">
            <p className="font-medium text-text">No high-severity failures.</p>
            <p className="mt-1">Either everything&apos;s fine, or no QA has run yet — queue one above.</p>
          </div>
        ) : (
          <RowList footer={`${topFailures.length} open issue${topFailures.length === 1 ? "" : "s"}`}>
            {topFailures.map((f) => (
              <Row key={f.c.id}>
                <Link href={`/admin/agent/qa/${f.c.runId}#check-${f.c.id}`} className="flex flex-1 items-center gap-3">
                  <Pill tone={f.c.severity === "critical" ? "danger" : "warning"}>{f.c.severity ?? "—"}</Pill>
                  <Pill tone="neutral">{f.c.viewport}</Pill>
                  <span className="truncate text-xs font-medium text-text">{checkLabel(f.c.checkKind)}</span>
                  <span className="truncate text-xs text-text-muted">{f.c.message}</span>
                  <span className="shrink-0 text-xs text-text-faint">· {f.siteName}</span>
                  <span className="shrink-0 text-xs text-text-faint">{formatRelative(f.c.createdAt)}</span>
                </Link>
              </Row>
            ))}
          </RowList>
        )}
      </section>

      {/* Recent runs */}
      <section>
        <h2 className="mb-2 text-base font-semibold text-text">Recent runs</h2>
        {runsTotal === 0 ? (
          <div className="rounded-lg border border-border bg-surface p-6 text-xs text-text-muted">
            No runs yet.
          </div>
        ) : (
          <RowList>
            {recentRuns.map((row) => {
              const r = row.r;
              return (
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
                    <span className="text-xs font-medium text-text">{row.siteName ?? "—"}</span>
                    <span className="font-mono text-xs text-text-faint">{r.scope}</span>
                    <span className="flex-1 truncate text-xs text-text-muted">
                      {r.summary ?? (r.status === "pending" ? "Awaiting worker..." : "—")}
                    </span>
                    <span className="shrink-0 tnum text-xs text-success">{r.passCount}</span>
                    <span className="shrink-0 tnum text-xs text-warning">{r.warnCount}</span>
                    <span className="shrink-0 tnum text-xs text-danger">{r.failCount}</span>
                    <span className="shrink-0 text-xs text-text-faint">{formatRelative(r.createdAt)}</span>
                  </Link>
                </Row>
              );
            })}
          </RowList>
        )}
        <Pagination
          basePath="/admin/agent/qa"
          page={page}
          totalItems={runsTotal}
          perPage={perPage}
          searchParams={searchParams}
        />
      </section>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number; tone?: "success" | "warning" | "danger" | "info" }) {
  const color =
    tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : tone === "danger" ? "text-danger" : tone === "info" ? "text-info" : "text-text";
  return (
    <div
      className="relative overflow-hidden rounded-xl border border-border px-4 py-3"
      style={{ background: "linear-gradient(180deg, var(--surface), var(--surface-2))" }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-3 top-0 h-px"
        style={{ background: "linear-gradient(90deg, transparent, var(--border-strong), transparent)" }}
      />
      <p className="text-xs font-semibold uppercase tracking-[0.10em] text-text-faint">{label}</p>
      <p className={`mt-2 text-3xl font-semibold tabular-nums leading-none tracking-tight ${color}`}>{value}</p>
    </div>
  );
}
