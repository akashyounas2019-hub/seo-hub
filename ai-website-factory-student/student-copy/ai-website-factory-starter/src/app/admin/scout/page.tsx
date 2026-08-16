/**
 * Scout hub — manual dispatch surface for the SEO agent team.
 *
 * Different mental model from /admin/agent/jobs: this screen exists so the
 * operator can pick an agent, see only the task types that agent accepts,
 * and dispatch a one-off manual run. The claude_jobs row lands with
 * trigger_source='scout' so it can be filtered from scheduled runs.
 *
 * The Scout Team sidebar (Keyword Scout, Content Scout, etc.) still exists
 * and still routes to its per-tool landing pages. This hub is the direct
 * per-agent entry point that lives above those.
 */
import Link from "next/link";
import { and, eq, sql } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { claudeJobs, sites } from "@/db/schema";
import { requireAdmin } from "@/lib/server-auth";
import { TASK_TYPES, loadRoster, type AgentRosterItem } from "@/lib/agent-roster";
import { ScoutHubClient } from "./ScoutHubClient";
import { assignSeoAgentTaskAction } from "@/app/actions/agent-tasks";

export const dynamic = "force-dynamic";

interface AgentLoad {
  pending: number;
  claimed: number;
  running: number;
  done7d: number;
}

export default async function ScoutHubPage({
  searchParams = {},
}: {
  searchParams?: { agent?: string; ok?: string; error?: string };
}) {
  await ensureSchema();
  await requireAdmin();
  const d = db();

  const roster = await loadRoster();
  const activeRoster = roster.filter(
    (r) => r.id !== "leader" && r.isActive !== false,
  );

  // Per-agent load — mirrors what the Agent Jobs hero reads, so numbers agree
  // between screens. We only look at agent_task rows (not cloud-seo:* etc.)
  // because those are what the Scout hub queues.
  const loadRows = await d
    .select({
      agentId: sql<string>`(${claudeJobs.input}->>'agentId')`,
      pending: sql<number>`count(*) filter (where status='pending')::int`,
      claimed: sql<number>`count(*) filter (where status='claimed')::int`,
      running: sql<number>`count(*) filter (where status='running')::int`,
      done7d: sql<number>`count(*) filter (where status='done' and ${claudeJobs.createdAt} >= now() - interval '7 days')::int`,
    })
    .from(claudeJobs)
    .where(and(eq(claudeJobs.kind, "agent_task"), sql`${claudeJobs.input} ? 'agentId'`))
    .groupBy(sql`(${claudeJobs.input}->>'agentId')`);

  const loadByAgent = new Map<string, AgentLoad>();
  for (const r of loadRows) {
    if (!r.agentId) continue;
    loadByAgent.set(r.agentId, {
      pending: r.pending ?? 0,
      claimed: r.claimed ?? 0,
      running: r.running ?? 0,
      done7d: r.done7d ?? 0,
    });
  }

  const siteList = await d
    .select({ slug: sites.slug, name: sites.name })
    .from(sites)
    .orderBy(sites.name);

  const preselected = searchParams.agent && activeRoster.some((a) => a.id === searchParams.agent)
    ? searchParams.agent
    : (activeRoster[0]?.id ?? "");

  return (
    <div className="space-y-6">
      <header className="brand-rule">
        <p className="text-xs font-medium uppercase tracking-[0.08em] text-text-faint">Scout hub</p>
        <h1 className="mt-1 text-2xl font-medium tracking-tightish text-text">
          Dispatch a manual run
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm text-text-muted">
          Pick an agent, choose from the task types it accepts, and queue a one-off run. Every job
          lands in <Link href="/admin/agent/jobs" className="text-accent hover:underline">/admin/agent/jobs</Link>{" "}
          tagged with <span className="font-mono text-[11px]">trigger_source=scout</span>. For scheduled
          + automated runs use each agent&apos;s{" "}
          <Link href="/admin/agent/jobs" className="text-accent hover:underline">profile page</Link>.
        </p>
      </header>

      {searchParams.ok === "queued" ? (
        <div className="rounded-md border border-success/30 bg-success-tint px-3 py-2 text-xs text-success">
          Task queued. Watch it on{" "}
          <Link href="/admin/agent/jobs" className="underline">Agent Jobs</Link>.
        </div>
      ) : null}
      {searchParams.error ? (
        <div className="rounded-md border border-danger/30 bg-danger-tint px-3 py-2 text-xs text-danger">
          {flashError(searchParams.error)}
        </div>
      ) : null}

      <ScoutHubClient
        roster={activeRoster.map((a) => ({
          id: a.id,
          name: a.name,
          title: a.title,
          focus: a.focus,
          isCustom: !!a.isCustom,
          taskTypes: a.taskTypes ?? ["custom"],
          load: loadByAgent.get(a.id) ?? { pending: 0, claimed: 0, running: 0, done7d: 0 },
        }))}
        taskTypes={TASK_TYPES.map((t) => ({
          id: t.id,
          label: t.label,
          description: t.description,
        }))}
        sites={siteList.map((s) => ({ slug: s.slug, name: s.name }))}
        preselectedAgentId={preselected}
        assignAction={assignSeoAgentTaskAction}
      />
    </div>
  );
}

function flashError(code: string): string {
  const map: Record<string, string> = {
    invalid: "Missing agent or task type.",
    "task-not-supported": "That task type isn't accepted by this agent.",
  };
  return map[code] ?? "Something went wrong queuing the task.";
}

export type ScoutRosterItem = Pick<AgentRosterItem, "id" | "name" | "title" | "focus"> & {
  isCustom: boolean;
  taskTypes: string[];
  load: AgentLoad;
};
