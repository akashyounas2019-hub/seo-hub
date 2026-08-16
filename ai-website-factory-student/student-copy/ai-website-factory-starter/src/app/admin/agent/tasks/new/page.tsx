/**
 * "Assign to Agent" — delegate a website task to a specific SEO agent.
 *
 * Visual language matches /admin/agent/jobs (dark border cards, brass accent,
 * animated status dots). Submitting inserts a `claude_jobs` row of kind
 * `agent_task` so the assignment shows up in Recent Jobs.
 */
import Link from "next/link";
import { db, ensureSchema } from "@/db/client";
import { sites } from "@/db/schema";
import { requireAdmin } from "@/lib/server-auth";
import { AGENT_ROSTER, TASK_TYPES } from "@/lib/agent-roster";
import { assignSeoAgentTaskAction } from "@/app/actions/agent-tasks";
import { AssignAgentTaskForm } from "./AssignAgentTaskForm";

export const dynamic = "force-dynamic";

export default async function AssignAgentTaskPage({
  searchParams,
}: {
  searchParams: { site?: string; type?: string; agent?: string; error?: string };
}) {
  await ensureSchema();
  await requireAdmin();

  const allSites = await db()
    .select({ slug: sites.slug, name: sites.name })
    .from(sites)
    .orderBy(sites.name);

  return (
    <div className="space-y-6">
      <header className="brand-rule">
        <Link href="/admin/agent/jobs" className="text-xs text-text-faint hover:text-text">
          ← Agent Jobs
        </Link>
        <h1 className="text-2xl font-medium tracking-tightish text-text">Assign to agent</h1>
        <p className="mt-1.5 text-xs text-text-muted">
          Pick a predefined task or write a custom one, choose the SEO agent to own it, and drop
          any specific instructions. The assignment appears in Recent Jobs as an{" "}
          <code className="font-mono">agent_task</code>.
        </p>
      </header>

      {searchParams.error ? (
        <div className="rounded-md border border-warning/30 bg-warning-tint px-3 py-2 text-xs text-warning">
          Could not queue the task — check the fields and try again.
        </div>
      ) : null}

      <AssignAgentTaskForm
        action={assignSeoAgentTaskAction}
        sites={allSites}
        roster={AGENT_ROSTER}
        taskTypes={TASK_TYPES}
        defaults={{
          siteSlug: searchParams.site ?? "",
          taskType: searchParams.type ?? "blog_writing",
          agentId: searchParams.agent ?? "",
        }}
      />
    </div>
  );
}
