/**
 * A2 — Individual QA run detail.
 *
 * Groups checks by URL × viewport. Failures highlighted at top.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { qaChecks, qaRuns, sites } from "@/db/schema";
import { suppressCheckAction } from "@/app/actions/qa";
import { Pill, Row, RowList } from "@/components/ui/Row";
import { AgentWorking } from "@/components/ui/AgentWorking";
import { AutoRefresh } from "@/components/ui/AutoRefresh";
import { checkLabel } from "@/lib/qa-checks";
import { requireAdmin } from "@/lib/server-auth";
import { formatRelative } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function QaRunDetailPage({
  params,
  searchParams,
}: {
  params: { runId: string };
  searchParams: { queued?: string };
}) {
  await ensureSchema();
  await requireAdmin();
  const d = db();

  const [row] = await d
    .select({
      r: qaRuns,
      siteSlug: sites.slug,
      siteName: sites.name,
    })
    .from(qaRuns)
    .leftJoin(sites, eq(sites.id, qaRuns.siteId))
    .where(eq(qaRuns.id, params.runId))
    .limit(1);
  if (!row) notFound();

  const checks = await d
    .select()
    .from(qaChecks)
    .where(eq(qaChecks.runId, params.runId))
    .orderBy(
      // Failures first, then warnings, then passes
      asc(qaChecks.url),
      asc(qaChecks.viewport),
      asc(qaChecks.checkKind),
    );

  // Group by url+viewport
  type Group = { url: string; viewport: string; checks: typeof checks };
  const groups = new Map<string, Group>();
  for (const c of checks) {
    const key = `${c.url}__${c.viewport}`;
    if (!groups.has(key)) groups.set(key, { url: c.url, viewport: c.viewport, checks: [] as unknown as typeof checks });
    (groups.get(key)!.checks as unknown as typeof checks).push(c);
  }

  const r = row.r;
  const total = r.passCount + r.warnCount + r.failCount;
  const score = total > 0 ? Math.round((r.passCount / total) * 100) : 0;
  const working = (r.status === "pending" || r.status === "running") && checks.length === 0;

  return (
    <div className="space-y-6">
      {working ? <AutoRefresh intervalMs={6000} /> : null}
      <header className="brand-rule">
        <Link href="/admin/agent/qa" className="text-xs text-text-faint hover:text-text">
          ← QA dashboard
        </Link>
        <div className="mt-1 flex items-baseline justify-between gap-3">
          <h1 className="">
            {row.siteName ?? "Run"} — QA Run
          </h1>
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
        </div>
        <p className="mt-1.5 text-xs text-text-muted">
          Scope: <span className="font-mono">{r.scope}</span>
          {r.scopeRef ? <> · <span className="font-mono">{r.scopeRef}</span></> : null}
          {" "}· Started {r.startedAt ? formatRelative(r.startedAt) : "—"}
          {r.finishedAt ? <> · Finished {formatRelative(r.finishedAt)}</> : null}
        </p>
      </header>

      {searchParams.queued ? (
        <div className="rounded-md border border-info/30 bg-info-tint px-3 py-2 text-xs text-info">
          Run queued. The worker on the VPS picks pending runs every few minutes — or run it now from the VPS:
          <code className="ml-2 font-mono text-xs">docker exec gyl-platform npm run qa:run -- --run-id={params.runId}</code>
        </div>
      ) : null}

      {/* Summary */}
      <section className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-border bg-surface p-3">
          <p className="text-xs uppercase tracking-[0.06em] text-text-faint">Score</p>
          <p className="">{total > 0 ? `${score}%` : "—"}</p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-3">
          <p className="text-xs uppercase tracking-[0.06em] text-text-faint">Passed</p>
          <p className="">{r.passCount}</p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-3">
          <p className="text-xs uppercase tracking-[0.06em] text-text-faint">Warnings</p>
          <p className="">{r.warnCount}</p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-3">
          <p className="text-xs uppercase tracking-[0.06em] text-text-faint">Failures</p>
          <p className="">{r.failCount}</p>
        </div>
      </section>

      {working ? (
        <AgentWorking
          title="Running the design QA suite"
          stages={[
            { key: "pending", label: "Queued" },
            { key: "running", label: "Auditing pages × viewports" },
            { key: "done", label: "Report ready" },
          ]}
          currentStage={r.status}
          messages={[
            "Loading each page in headless Chromium across 4 viewports…",
            "Running 14+ visual & accessibility checks per view…",
            "Scoring contrast, tap targets, overlaps, and layout…",
            "Compiling the pass / warn / fail report…",
          ]}
          note="Playwright on the worker — no API cost"
          startedAt={r.startedAt ?? undefined}
          skeleton="rows"
          skeletonCount={5}
        />
      ) : null}

      {/* Grouped checks */}
      {Array.from(groups.values()).map((g) => (
        <section key={`${g.url}__${g.viewport}`} className="rounded-xl border border-border bg-surface p-5">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="">
              <span className="font-mono text-xs text-text-faint">{g.viewport}</span>
              {" · "}
              <a href={g.url} target="_blank" rel="noopener noreferrer" className="font-mono text-xs text-accent hover:underline">{g.url}</a>
            </h2>
            <span className="text-xs text-text-faint">{(g.checks as unknown as typeof checks).length} checks</span>
          </div>
          <RowList>
            {(g.checks as unknown as typeof checks)
              .slice()
              .sort((a: typeof checks[number], b: typeof checks[number]) => {
                const order = { fail: 0, warn: 1, pass: 2, skipped: 3 } as Record<string, number>;
                return (order[a.status] ?? 99) - (order[b.status] ?? 99);
              })
              .map((c: typeof checks[number]) => (
                <Row key={c.id} className={c.suppressed ? "opacity-50" : ""}>
                  <div id={`check-${c.id}`} className="flex flex-1 items-center gap-3">
                    <Pill
                      tone={
                        c.status === "pass"
                          ? "success"
                          : c.status === "warn"
                            ? "warning"
                            : c.status === "fail"
                              ? "danger"
                              : "neutral"
                      }
                    >
                      {c.status}
                    </Pill>
                    {c.severity ? (
                      <Pill tone={c.severity === "critical" ? "danger" : c.severity === "high" ? "danger" : "warning"}>
                        {c.severity}
                      </Pill>
                    ) : null}
                    <span className="text-xs font-medium text-text">{checkLabel(c.checkKind)}</span>
                    <span className="flex-1 truncate text-xs text-text-muted">{c.message ?? "—"}</span>
                    <span className="shrink-0 text-xs text-text-faint">{c.durationMs}ms</span>
                    {(c.status === "fail" || c.status === "warn") && !c.suppressed ? (
                      <form action={suppressCheckAction}>
                        <input type="hidden" name="checkId" value={c.id} />
                        <button type="submit" className="text-xs text-text-faint hover:text-danger">
                          Suppress
                        </button>
                      </form>
                    ) : null}
                  </div>
                </Row>
              ))}
          </RowList>
          {/* Show evidence for failures */}
          {(g.checks as unknown as typeof checks).filter((c) => c.status !== "pass" && Object.keys((c.evidence as Record<string, unknown>) ?? {}).length > 0).length > 0 ? (
            <details className="mt-3">
              <summary className="cursor-pointer text-xs text-accent">Evidence (JSON)</summary>
              <pre className="mt-2 max-h-80 overflow-y-auto rounded bg-surface-soft p-3 font-mono text-xs text-text-muted">
                {JSON.stringify(
                  (g.checks as unknown as typeof checks)
                    .filter((c) => c.status !== "pass")
                    .reduce((acc, c) => {
                      acc[`${c.checkKind} (${c.status})`] = c.evidence;
                      return acc;
                    }, {} as Record<string, unknown>),
                  null,
                  2,
                )}
              </pre>
            </details>
          ) : null}
        </section>
      ))}
    </div>
  );
}
