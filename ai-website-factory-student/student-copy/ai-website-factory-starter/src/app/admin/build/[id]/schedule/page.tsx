/**
 * /admin/build/[id]/schedule — Scheduled workflows for a build project.
 *
 * Server-rendered list of existing scheduled_workflows rows + a form to
 * create new ones. The runner (`npm run run:scheduled-workflows`) sweeps
 * the table every minute and enqueues a claude_jobs row when a row's
 * next_fire_at <= now.
 *
 * Common operator workflows surfaced here:
 *  - "Publish next blog Monday 9am"     → build:page_generate
 *  - "Refresh stale pages quarterly"    → build:refresh_recommender
 *  - "Re-validate fan-out keywords"     → build:keyword_research
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { scheduledWorkflows, siteBuildProjects, type ScheduledWorkflow } from "@/db/schema";
import {
  createScheduledWorkflowAction,
  deleteScheduledWorkflowAction,
  toggleScheduledWorkflowAction,
} from "@/app/actions/scheduled-workflows";
import { JOB_TEMPLATES } from "@/lib/claude-job-templates";
import { CRON_PRESETS } from "@/lib/cron-evaluator";
import { Pill } from "@/components/ui/Row";
import { requireAdmin } from "@/lib/server-auth";
import { formatRelative } from "@/lib/utils";

export const dynamic = "force-dynamic";

// Job kinds the operator can schedule. Keep this short — not every kind
// makes sense on a cron. (E.g. build:global_research runs once per project.)
const SCHEDULABLE_KINDS = new Set<string>([
  "build:page_generate",
  "build:content_refresh",
  "build:refresh_recommender",
  "build:keyword_research",
  "build:quality_review",
  "site_audit",
  "blog_post_draft",
  "competitor_research",
]);

export default async function ScheduleProjectPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { created?: string; error?: string };
}) {
  await ensureSchema();
  await requireAdmin();

  const [project] = await db()
    .select()
    .from(siteBuildProjects)
    .where(eq(siteBuildProjects.id, params.id))
    .limit(1);
  if (!project) notFound();

  const rows: ScheduledWorkflow[] = await db()
    .select()
    .from(scheduledWorkflows)
    .where(eq(scheduledWorkflows.projectId, project.id))
    .orderBy(desc(scheduledWorkflows.createdAt));

  const schedulable = JOB_TEMPLATES.filter((t) => SCHEDULABLE_KINDS.has(t.kind));

  return (
    <div className="max-w-4xl space-y-6">
      <header className="space-y-1">
        <Link href={`/admin/build/${project.id}`} className="text-xs text-text-faint hover:text-text">
          ← Back to project
        </Link>
        <h1 className="text-2xl font-medium tracking-tightish text-text">
          Scheduled workflows
        </h1>
        <p className="text-base text-text-muted">
          Cron-driven runs for <span className="text-text">{project.businessName}</span>. The
          server runner sweeps this table every minute and enqueues a job when a row is due.
        </p>
      </header>

      {searchParams.created ? (
        <div className="rounded-md border border-success/30 bg-success-tint px-3 py-2 text-base text-success">
          Workflow created. Next fire is scheduled — see the list below.
        </div>
      ) : null}
      {searchParams.error ? (
        <div className="rounded-md border border-danger/30 bg-danger-tint px-3 py-2 text-base text-danger">
          {searchParams.error}
        </div>
      ) : null}

      {/* ── Existing workflows ──────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-md font-medium text-text">Active schedules</h2>
        {rows.length === 0 ? (
          <p className="rounded-md border border-dashed border-border-strong bg-surface px-4 py-6 text-base text-text-muted">
            No scheduled workflows yet. Use the form below to create one.
          </p>
        ) : (
          <ul className="space-y-2">
            {rows.map((wf) => (
              <li
                key={wf.id}
                className="grid gap-2 rounded-xl border border-border bg-surface p-4 md:grid-cols-[2fr,1fr,1fr,auto]"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Pill tone={wf.enabled ? "success" : "neutral"}>
                      {wf.enabled ? "enabled" : "paused"}
                    </Pill>
                    <span className="text-base font-medium text-text">{wf.name}</span>
                  </div>
                  <p className="font-mono text-xs text-text-faint">
                    {wf.jobKind} · prefer:{wf.preferWorker}
                  </p>
                </div>
                <div className="space-y-0.5 text-xs text-text-muted">
                  <p className="font-medium uppercase tracking-[0.06em] text-text-faint">Schedule</p>
                  <p className="font-mono text-text">{wf.cronExpr}</p>
                  <p className="text-text-faint">{wf.timezone}</p>
                </div>
                <div className="space-y-0.5 text-xs text-text-muted">
                  <p className="font-medium uppercase tracking-[0.06em] text-text-faint">Next fire</p>
                  <p className="text-text">
                    {wf.nextFireAt ? formatRelative(wf.nextFireAt) : "—"}
                  </p>
                  <p className="text-text-faint">
                    Fired {wf.fireCount}× · {wf.failureCount} failure{wf.failureCount === 1 ? "" : "s"}
                  </p>
                  {wf.lastError ? (
                    <p className="truncate text-danger" title={wf.lastError}>
                      ⚠ {wf.lastError}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <form action={toggleScheduledWorkflowAction}>
                    <input type="hidden" name="id" value={wf.id} />
                    <input type="hidden" name="projectId" value={project.id} />
                    <button
                      type="submit"
                      className="rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-medium text-text hover:border-accent hover:text-accent"
                    >
                      {wf.enabled ? "Pause" : "Resume"}
                    </button>
                  </form>
                  <form action={deleteScheduledWorkflowAction}>
                    <input type="hidden" name="id" value={wf.id} />
                    <input type="hidden" name="projectId" value={project.id} />
                    <button
                      type="submit"
                      className="rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-medium text-text-muted hover:border-danger hover:text-danger"
                    >
                      Delete
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Create form ─────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-md font-medium text-text">Create a schedule</h2>
        <form action={createScheduledWorkflowAction} className="space-y-4 rounded-xl border border-border bg-surface p-5">
          <input type="hidden" name="projectId" value={project.id} />

          <div className="space-y-1.5">
            <label className="text-xs font-medium uppercase tracking-[0.06em] text-text-muted">
              Name
            </label>
            <input
              name="name"
              required
              placeholder="e.g. Weekly Monday blog publish"
              className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-base text-text focus:border-accent focus:outline-none"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium uppercase tracking-[0.06em] text-text-muted">
                Job kind
              </label>
              <select
                name="jobKind"
                required
                className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-base text-text focus:border-accent focus:outline-none"
                defaultValue="build:page_generate"
              >
                {schedulable.map((t) => (
                  <option key={t.kind} value={t.kind}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium uppercase tracking-[0.06em] text-text-muted">
                Worker preference
              </label>
              <select
                name="preferWorker"
                defaultValue="mac"
                className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-base text-text focus:border-accent focus:outline-none"
              >
                <option value="mac">Mac worker (default — $0, subscription)</option>
                <option value="server">Server (API — per-token cost)</option>
                <option value="any">Any (first claim wins)</option>
              </select>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-[2fr,1fr]">
            <div className="space-y-1.5">
              <label className="text-xs font-medium uppercase tracking-[0.06em] text-text-muted">
                Cron expression (5 fields)
              </label>
              <input
                name="cronExpr"
                required
                placeholder="0 9 * * MON"
                defaultValue="0 9 * * MON"
                className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 font-mono text-base text-text focus:border-accent focus:outline-none"
              />
              <p className="text-xs text-text-faint">
                Format: <code className="font-mono">minute hour day-of-month month day-of-week</code>.
                Aliases: <code className="font-mono">MON-SUN</code>, <code className="font-mono">JAN-DEC</code>.
              </p>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium uppercase tracking-[0.06em] text-text-muted">
                Timezone
              </label>
              <input
                name="timezone"
                defaultValue="Asia/Dubai"
                className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-base text-text focus:border-accent focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-medium uppercase tracking-[0.06em] text-text-muted">
              Presets (click to copy into the cron field)
            </p>
            <div className="flex flex-wrap gap-1.5">
              {CRON_PRESETS.map((p) => (
                <CronPresetChip key={p.expr} expr={p.expr} label={p.label} hint={p.hint} />
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium uppercase tracking-[0.06em] text-text-muted">
              Job input (JSON, optional)
            </label>
            <textarea
              name="jobInputJson"
              rows={4}
              defaultValue={`{\n  "siteSlug": "${project.slug ?? ""}"\n}`}
              className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 font-mono text-xs text-text focus:border-accent focus:outline-none"
            />
            <p className="text-xs text-text-faint">
              Merged with <code className="font-mono">{"{ projectId }"}</code> automatically.
              See the job template page for available fields.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
            <button
              type="submit"
              className="h-9 rounded-md bg-accent px-4 text-xs font-medium text-accent-fg shadow-xs transition hover:bg-accent-hover"
            >
              Create schedule →
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-xl border border-border bg-surface-2 p-4 text-xs text-text-muted">
        <p className="font-medium uppercase tracking-[0.06em] text-text-faint">Operational note</p>
        <p className="mt-1.5">
          The sweep runner needs to be invoked on a real-world cron (e.g. on the VPS:
          <code className="ml-1 font-mono text-text">* * * * * cd /srv/gyl-platform &amp;&amp; npm run run:scheduled-workflows</code>).
          On the local PGlite dev DB the sweep can be triggered manually.
        </p>
      </section>

      {/* Inline click-delegation script — wires the preset chips to the
          cron input without spinning up a client component. */}
      <script
        dangerouslySetInnerHTML={{
          __html: `document.addEventListener("click",function(e){var t=e.target;while(t&&t.tagName){if(t.classList&&t.classList.contains("cron-preset-chip")){var v=t.getAttribute("data-cron");if(v){var i=document.querySelector('input[name="cronExpr"]');if(i){i.value=v;i.dispatchEvent(new Event("change"));}}e.preventDefault();break;}t=t.parentElement;}});`,
        }}
      />
    </div>
  );
}

/**
 * Server-rendered preset chip. The actual click → input copy is handled
 * by the small delegation script at the bottom of the page (no client
 * component needed).
 */
function CronPresetChip({ expr, label, hint }: { expr: string; label: string; hint: string }) {
  return (
    <button
      type="button"
      title={`${expr} — ${hint}`}
      data-cron={expr}
      className="cron-preset-chip rounded-md border border-border bg-surface px-2.5 py-1 text-xs text-text-muted hover:border-accent hover:text-text"
    >
      {label}
    </button>
  );
}
