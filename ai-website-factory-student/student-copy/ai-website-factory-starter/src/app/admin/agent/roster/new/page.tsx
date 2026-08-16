/**
 * Add New Agent — creates a custom entry in `agent_profiles` that lands on
 * the Agent Jobs hero alongside the six built-ins. Straight form → server
 * action → redirect back to the roster.
 */
import Link from "next/link";
import { ensureSchema } from "@/db/client";
import { requireAdmin } from "@/lib/server-auth";
import { createCustomAgentAction } from "@/app/actions/agent-profiles";

export const dynamic = "force-dynamic";

export default async function AddAgentPage({
  searchParams,
}: {
  searchParams?: { error?: string };
}) {
  await ensureSchema();
  await requireAdmin();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href="/admin/agent/jobs" className="text-xs text-text-faint hover:text-text">
          ← Agent Jobs
        </Link>
        <h1 className="mt-1 text-2xl font-medium tracking-tightish text-text">
          Add a new agent
        </h1>
        <p className="mt-1.5 text-xs text-text-muted">
          Custom agents show up on the Agent Jobs hero alongside AKS and the five specialists.
          You can assign tasks to them from{" "}
          <span className="font-mono">/admin/agent/tasks/new</span> like any built-in agent.
        </p>
      </div>

      {searchParams?.error === "name-required" ? (
        <div className="rounded-md border border-danger/30 bg-danger-tint px-3 py-2 text-xs text-danger">
          Give the agent a name (at least 2 characters).
        </div>
      ) : null}

      <form
        action={createCustomAgentAction}
        className="space-y-4 rounded-2xl border border-border bg-surface p-5 sm:p-6"
      >
        <label className="block">
          <span className="block text-xs font-medium uppercase tracking-[0.06em] text-text-faint">
            Name *
          </span>
          <input
            name="name"
            type="text"
            required
            minLength={2}
            maxLength={80}
            placeholder="e.g. Ada Cheng"
            className="mt-1 w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
          />
        </label>

        <label className="block">
          <span className="block text-xs font-medium uppercase tracking-[0.06em] text-text-faint">
            Title
          </span>
          <input
            name="title"
            type="text"
            maxLength={80}
            defaultValue="Custom Agent"
            placeholder="e.g. Local SEO Specialist"
            className="mt-1 w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
          />
          <span className="mt-1 block text-[11px] text-text-faint">
            Short role label shown under the name on the hero card.
          </span>
        </label>

        <label className="block">
          <span className="block text-xs font-medium uppercase tracking-[0.06em] text-text-faint">
            Focus
          </span>
          <input
            name="focus"
            type="text"
            maxLength={140}
            placeholder="e.g. Local citations · reviews · GBP posts"
            className="mt-1 w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
          />
          <span className="mt-1 block text-[11px] text-text-faint">
            One-line description of what this agent owns.
          </span>
        </label>

        <label className="block">
          <span className="block text-xs font-medium uppercase tracking-[0.06em] text-text-faint">
            Custom instructions
          </span>
          <textarea
            name="skillInstructions"
            rows={8}
            placeholder="These instructions get appended to every job assigned to this agent. Steer their tone, scope, or checklist."
            className="mt-1 w-full resize-y rounded-md border border-border bg-surface-2 p-3 font-mono text-[12px] leading-relaxed text-text focus:border-accent focus:outline-none"
          />
          <span className="mt-1 block text-[11px] text-text-faint">
            Optional. You can edit this later from the agent&apos;s profile.
          </span>
        </label>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Link
            href="/admin/agent/jobs"
            className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs text-text hover:bg-surface-2"
          >
            Cancel
          </Link>
          <button
            type="submit"
            className="rounded-md bg-accent px-4 py-1.5 text-xs font-medium text-white hover:bg-accent-hover"
          >
            Create agent
          </button>
        </div>
      </form>
    </div>
  );
}
