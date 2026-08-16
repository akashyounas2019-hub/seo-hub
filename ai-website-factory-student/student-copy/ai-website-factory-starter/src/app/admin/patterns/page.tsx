/**
 * P2 — Cross-site patterns inbox.
 *
 * The agent's network-level view. Shows currently-open patterns + their
 * spawned agent tasks. Admin can accept / dismiss / complete each task.
 */
import Link from "next/link";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { agentTasks, sitePatterns, sites } from "@/db/schema";
import {
  acceptAgentTaskAction,
  completeAgentTaskAction,
  dismissAgentTaskAction,
  dismissPatternAction,
} from "@/app/actions/agent-tasks";
import { Pill, Row, RowList } from "@/components/ui/Row";
import { requireAdmin } from "@/lib/server-auth";
import { formatRelative } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function PatternsPage({
  searchParams,
}: {
  searchParams: { tab?: "open" | "resolved" | "dismissed" };
}) {
  await ensureSchema();
  await requireAdmin();
  const tab = (searchParams.tab as string) || "open";
  const d = db();

  const patterns = await d
    .select()
    .from(sitePatterns)
    .where(eq(sitePatterns.status, tab))
    .orderBy(desc(sitePatterns.detectedAt));

  const tasks = await d
    .select()
    .from(agentTasks)
    .where(inArray(agentTasks.status, ["proposed", "in_progress"]))
    .orderBy(desc(agentTasks.createdAt));

  const tasksByPattern = new Map<string, typeof tasks>();
  for (const t of tasks) {
    if (!t.patternId) continue;
    if (!tasksByPattern.has(t.patternId)) tasksByPattern.set(t.patternId, [] as unknown as typeof tasks);
    (tasksByPattern.get(t.patternId)! as typeof tasks).push(t);
  }

  // Affected-sites lookup
  const allSiteIds = new Set<string>();
  for (const p of patterns) {
    for (const sid of (p.sitesAffected as string[]) ?? []) allSiteIds.add(sid);
  }
  const sitesList = allSiteIds.size > 0
    ? await d.select({ id: sites.id, slug: sites.slug, name: sites.name }).from(sites).where(inArray(sites.id, Array.from(allSiteIds)))
    : [];
  const siteById = new Map(sitesList.map((s) => [s.id, s]));

  const [stats] = await d
    .select({
      open: sql<number>`count(*) filter (where status = 'open')::int`,
      resolved: sql<number>`count(*) filter (where status = 'resolved')::int`,
      dismissed: sql<number>`count(*) filter (where status = 'dismissed')::int`,
    })
    .from(sitePatterns);

  return (
    <div className="space-y-6">
      <header className="brand-rule">
        <h1 className="">Patterns</h1>
        <p className="mt-1.5 text-xs text-text-muted">
          Cross-site signals detected nightly by the agent. Each open pattern bubbles up at least one suggested task.
        </p>
      </header>

      <nav className="flex items-center gap-1 border-b border-border">
        <TabLink href="/admin/patterns?tab=open" current={tab} value="open" count={stats?.open ?? 0} />
        <TabLink href="/admin/patterns?tab=resolved" current={tab} value="resolved" count={stats?.resolved ?? 0} />
        <TabLink href="/admin/patterns?tab=dismissed" current={tab} value="dismissed" count={stats?.dismissed ?? 0} />
      </nav>

      {patterns.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-6 text-xs text-text-muted">
          <p className="font-medium text-text">No {tab} patterns.</p>
          <p className="mt-1">
            The detector runs nightly at 04:55 UTC. Run it now with{" "}
            <code className="font-mono">npm run patterns:detect</code>.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {patterns.map((p) => {
            const linked = (tasksByPattern.get(p.id) as typeof tasks) ?? [];
            const sitesShown = ((p.sitesAffected as string[]) ?? []).slice(0, 6);
            const remaining = Math.max(0, ((p.sitesAffected as string[]) ?? []).length - sitesShown.length);
            const severityTone = p.severity === "critical" ? "danger" : p.severity === "warning" ? "warning" : "info";
            return (
              <section key={p.id} className="rounded-xl border border-border bg-surface p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Pill tone={severityTone}>{p.severity}</Pill>
                      <span className="font-mono text-xs text-text-faint">{p.kind}</span>
                      <span className="text-xs text-text-faint">· {formatRelative(p.detectedAt)}</span>
                    </div>
                    <h2 className="">{p.title}</h2>
                    <p className="mt-1 text-xs text-text-muted">{p.summary}</p>

                    {sitesShown.length > 0 ? (
                      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                        {sitesShown.map((sid) => {
                          const s = siteById.get(sid);
                          return s ? (
                            <Link
                              key={sid}
                              href={`/admin/sites/${s.slug}`}
                              className="rounded-sm border border-border bg-surface-soft px-1.5 py-0.5 text-xs text-text hover:border-accent hover:text-accent"
                            >
                              {s.name}
                            </Link>
                          ) : null;
                        })}
                        {remaining > 0 ? (
                          <span className="text-xs text-text-faint">+{remaining} more</span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  {tab === "open" ? (
                    <form action={dismissPatternAction}>
                      <input type="hidden" name="patternId" value={p.id} />
                      <button
                        type="submit"
                        className="rounded-md border border-border px-2 py-1 text-xs text-text-muted hover:border-danger hover:text-danger"
                      >
                        Dismiss
                      </button>
                    </form>
                  ) : null}
                </div>

                {linked.length > 0 ? (
                  <div className="mt-4 space-y-2 border-t border-border pt-3">
                    {linked.map((t) => (
                      <AgentTaskCard key={t.id} t={t} />
                    ))}
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TabLink({
  href,
  current,
  value,
  count,
}: {
  href: string;
  current: string;
  value: string;
  count: number;
}) {
  const active = current === value;
  return (
    <Link
      href={href}
      className={`inline-flex items-baseline gap-1 border-b-2 px-3 py-2 text-xs ${
        active ? "border-accent text-text" : "border-transparent text-text-muted hover:text-text"
      }`}
    >
      <span className="capitalize">{value}</span>
      <span className="tnum text-xs text-text-faint">{count}</span>
    </Link>
  );
}

function AgentTaskCard({ t }: { t: typeof agentTasks.$inferSelect }) {
  const href = (t.cta as Record<string, unknown>)?.href as string | null;
  const priorityTone = t.priority === "high" ? "danger" : t.priority === "low" ? "neutral" : "warning";
  return (
    <div className="flex items-start gap-3 rounded-md bg-surface-soft px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Pill tone={priorityTone}>{t.priority}</Pill>
          <span className="text-xs font-medium text-text">{t.title}</span>
          {t.status === "in_progress" ? (
            <Pill tone="info">in progress</Pill>
          ) : null}
        </div>
        <p className="mt-0.5 text-xs text-text-muted">{t.description}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {href ? (
          <Link
            href={href}
            className="rounded-md bg-accent px-2 py-1 text-xs font-medium text-brand-navy-deep hover:bg-accent-hover"
          >
            Open
          </Link>
        ) : null}
        {t.status === "proposed" ? (
          <form action={acceptAgentTaskAction}>
            <input type="hidden" name="taskId" value={t.id} />
            <button type="submit" className="rounded-md border border-border px-2 py-1 text-xs text-text hover:border-accent">
              Accept
            </button>
          </form>
        ) : (
          <form action={completeAgentTaskAction}>
            <input type="hidden" name="taskId" value={t.id} />
            <button type="submit" className="rounded-md border border-success/40 bg-success-tint px-2 py-1 text-xs text-success hover:bg-success-tint/70">
              Done
            </button>
          </form>
        )}
        <form action={dismissAgentTaskAction}>
          <input type="hidden" name="taskId" value={t.id} />
          <button type="submit" className="rounded-md border border-border px-2 py-1 text-xs text-text-muted hover:border-danger hover:text-danger">
            Dismiss
          </button>
        </form>
      </div>
    </div>
  );
}
