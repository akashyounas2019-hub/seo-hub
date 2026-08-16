/**
 * A3 — Claude Code job detail view.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { claudeJobs, sites, users } from "@/db/schema";
import { cancelClaudeJobAction } from "@/app/actions/claude-jobs";
import { Pill } from "@/components/ui/Row";
import { AgentWorking } from "@/components/ui/AgentWorking";
import { AutoRefresh } from "@/components/ui/AutoRefresh";
import { templateByKind } from "@/lib/claude-job-templates";
import { requireAdmin } from "@/lib/server-auth";
import { formatRelative } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ClaudeJobDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { queued?: string };
}) {
  await ensureSchema();
  await requireAdmin();

  const [row] = await db()
    .select({
      j: claudeJobs,
      siteSlug: sites.slug,
      siteName: sites.name,
      author: users.email,
    })
    .from(claudeJobs)
    .leftJoin(sites, eq(sites.id, claudeJobs.siteId))
    .leftJoin(users, eq(users.id, claudeJobs.createdBy))
    .where(eq(claudeJobs.id, params.id))
    .limit(1);
  if (!row) notFound();
  const j = row.j;
  const tmpl = templateByKind(j.kind);

  const tone =
    j.status === "done"
      ? "success"
      : j.status === "failed"
        ? "danger"
        : j.status === "running" || j.status === "claimed"
          ? "info"
          : j.status === "cancelled"
            ? "neutral"
            : "warning";

  const working = j.status === "pending" || j.status === "claimed" || j.status === "running";

  return (
    <div className="space-y-6">
      {working ? <AutoRefresh intervalMs={6000} /> : null}
      <header className="brand-rule">
        <Link href="/admin/agent/jobs" className="text-xs text-text-faint hover:text-text">← Jobs</Link>
        <div className="mt-1 flex items-baseline justify-between gap-3">
          <h1 className="">{j.title}</h1>
          <Pill tone={tone}>{j.status}</Pill>
        </div>
        <p className="mt-1.5 text-xs text-text-muted">
          <span className="font-mono">{j.kind}</span>
          {row.siteName ? <> · {row.siteName}</> : null}
          {j.workerId ? <> · worker <code className="font-mono text-xs">{j.workerId}</code></> : null}
          {" · "}
          {tmpl ? <>~{tmpl.estMinutes} min · </> : null}
          created {formatRelative(j.createdAt)}
        </p>
      </header>

      {searchParams.queued ? (
        <div className="rounded-md border border-info/30 bg-info-tint px-3 py-2 text-xs text-info">
          Job queued. The Mac worker polls every 30 seconds. Make sure your worker is running:
          <code className="ml-2 font-mono text-xs">node worker/claude-worker.mjs</code>
        </div>
      ) : null}

      {/* Status + meta */}
      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-surface p-3">
          <p className="text-xs uppercase tracking-[0.06em] text-text-faint">Started</p>
          <p className="">{j.startedAt ? formatRelative(j.startedAt) : "—"}</p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-3">
          <p className="text-xs uppercase tracking-[0.06em] text-text-faint">Finished</p>
          <p className="">{j.finishedAt ? formatRelative(j.finishedAt) : "—"}</p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-3">
          <p className="text-xs uppercase tracking-[0.06em] text-text-faint">Duration</p>
          <p className="">{j.durationMs ? `${Math.round(j.durationMs / 1000)}s` : "—"}</p>
        </div>
      </section>

      {/* Inputs */}
      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="">Inputs</h2>
        <pre className="mt-2 max-h-48 overflow-y-auto rounded bg-surface-soft px-3 py-2 font-mono text-xs text-text-muted">
          {JSON.stringify(j.input, null, 2)}
        </pre>
      </section>

      {/* Output */}
      {j.outputMarkdown ? (
        <section className="rounded-xl border border-border bg-surface p-5">
          <h2 className="">Output</h2>
          <pre className="mt-2 whitespace-pre-wrap font-sans text-xs leading-relaxed text-text">{j.outputMarkdown}</pre>
        </section>
      ) : working ? (
        <AgentWorking
          title={j.title || "The agent is working"}
          stages={[
            { key: "pending", label: "Queued" },
            { key: "claimed", label: "Claimed by worker" },
            { key: "running", label: "Running" },
          ]}
          currentStage={j.status}
          messages={[
            j.status === "pending"
              ? "Waiting for the Mac worker to claim this job…"
              : j.status === "claimed"
                ? "Worker claimed the job — starting up…"
                : "Worker is running the job — output appears here when complete…",
            tmpl ? `Task: ${tmpl.label ?? j.kind} (~${tmpl.estMinutes} min typical)` : `Task kind: ${j.kind}`,
            "This page refreshes itself as the job progresses.",
          ]}
          note="Running on your Mac worker — Claude Code subscription, no API cost"
          startedAt={j.startedAt ?? j.createdAt}
          skeleton="rows"
          skeletonCount={4}
        />
      ) : null}

      {/* Error */}
      {j.error ? (
        <section className="rounded-xl border border-danger/30 bg-danger-tint p-5">
          <h2 className="">Failed</h2>
          <pre className="mt-2 whitespace-pre-wrap font-mono text-xs text-danger">{j.error}</pre>
        </section>
      ) : null}

      {/* Cancel */}
      {(j.status === "pending" || j.status === "claimed") ? (
        <form action={cancelClaudeJobAction} className="flex items-center justify-end">
          <input type="hidden" name="id" value={j.id} />
          <button type="submit" className="text-xs text-text-faint hover:text-danger">
            Cancel job
          </button>
        </form>
      ) : null}
    </div>
  );
}
