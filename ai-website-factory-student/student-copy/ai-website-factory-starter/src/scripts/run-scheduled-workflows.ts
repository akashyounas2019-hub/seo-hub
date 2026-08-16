/**
 * P9 — Scheduled workflow runner (cron sweeper).
 *
 * Reads `scheduled_workflows` for rows that are enabled + due (next_fire_at
 * <= now()) and enqueues a `claude_jobs` row for each. Updates next_fire_at
 * by evaluating the row's 5-field cron expression in its declared timezone.
 *
 * Invocation:
 *   `npm run run:scheduled-workflows`  (one shot — exit code 0/1)
 *
 * Suggested cron on the VPS: every minute. Cheap because the partial index
 * `scheduled_workflows_next_fire_idx` makes the SELECT a 1-row plan when
 * nothing is due.
 *
 * Deliberately NO external cron library — we ship a tight 80-line evaluator
 * supporting `*`, step (slash-N), lists `1,3,5`, ranges `1-5`, and the
 * standard `MON-SUN` / `JAN-DEC` aliases. That's everything the UI lets
 * the operator pick.
 *
 * Design notes:
 * - Each iteration is wrapped in try/catch so one bad cron string doesn't
 *   stop the entire sweep.
 * - Failures increment `failure_count` but leave `enabled = true`. The UI
 *   surfaces failure_count + last_error; the operator decides whether to
 *   disable a flaky workflow.
 * - We DO update next_fire_at on failure (so we don't tight-loop a broken
 *   row every minute). Penalty is one missed run; operator can re-enable
 *   by editing the cron string in the UI.
 */

import { and, eq, isNotNull, lte } from "drizzle-orm";
import { db, ensureSchema } from "../db/client";
import { claudeJobs, scheduledWorkflows } from "../db/schema";
import { nextCronFire } from "../lib/cron-evaluator";

// ───────────────────────────────────────────────────────────────────
// Main sweep.
// ───────────────────────────────────────────────────────────────────

interface SweepResult {
  fired: number;
  failed: number;
  skipped: number;
  rows: Array<{ id: string; name: string; nextFireAt: Date | null; outcome: "fired" | "failed" | "skipped"; error?: string; jobId?: string }>;
}

export async function sweepScheduledWorkflows(now: Date = new Date()): Promise<SweepResult> {
  const d = db();
  const due = await d
    .select()
    .from(scheduledWorkflows)
    .where(
      and(
        eq(scheduledWorkflows.enabled, true),
        isNotNull(scheduledWorkflows.nextFireAt),
        lte(scheduledWorkflows.nextFireAt, now),
      ),
    );

  const result: SweepResult = { fired: 0, failed: 0, skipped: 0, rows: [] };
  for (const wf of due) {
    try {
      // Compute next fire BEFORE inserting the job, so a bad cron string
      // doesn't enqueue work we can't reschedule.
      const next = nextCronFire(wf.cronExpr, wf.timezone, now);

      // Title prefix so the operator can see this came from a schedule.
      const title = `⏰ ${wf.name}`;

      const [job] = await d
        .insert(claudeJobs)
        .values({
          kind: wf.jobKind,
          title,
          siteId: wf.siteId ?? null,
          input: {
            ...(wf.jobInput ?? {}),
            // Threaded so post-processors can backref the workflow row.
            _scheduledWorkflowId: wf.id,
            _scheduledFiredAt: now.toISOString(),
          },
          status: "pending",
          priority: "normal",
          preferWorker: wf.preferWorker as "mac" | "server" | "any",
          createdBy: wf.createdBy ?? null,
        })
        .returning({ id: claudeJobs.id });

      await d
        .update(scheduledWorkflows)
        .set({
          lastFireAt: now,
          lastJobId: job.id,
          fireCount: wf.fireCount + 1,
          nextFireAt: next,
          lastError: null,
          updatedAt: now,
        })
        .where(eq(scheduledWorkflows.id, wf.id));

      result.fired++;
      result.rows.push({ id: wf.id, name: wf.name, nextFireAt: next, outcome: "fired", jobId: job.id });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Advance next_fire_at by 1h on failure so we don't tight-loop a
      // broken cron string — but only if we can't compute a real next.
      let nextOnFail: Date;
      try {
        nextOnFail = nextCronFire(wf.cronExpr, wf.timezone, now);
      } catch {
        nextOnFail = new Date(now.getTime() + 60 * 60_000);
      }
      await d
        .update(scheduledWorkflows)
        .set({
          failureCount: wf.failureCount + 1,
          lastError: msg.slice(0, 1000),
          nextFireAt: nextOnFail,
          updatedAt: now,
        })
        .where(eq(scheduledWorkflows.id, wf.id));
      result.failed++;
      result.rows.push({ id: wf.id, name: wf.name, nextFireAt: nextOnFail, outcome: "failed", error: msg });
    }
  }
  return result;
}

// ───────────────────────────────────────────────────────────────────
// CLI entrypoint.
// ───────────────────────────────────────────────────────────────────

async function main() {
  await ensureSchema();
  const now = new Date();
  const result = await sweepScheduledWorkflows(now);
  const ts = now.toISOString();
  if (result.rows.length === 0) {
    console.log(`[${ts}] scheduled-workflows: no rows due`);
  } else {
    console.log(`[${ts}] scheduled-workflows: fired=${result.fired} failed=${result.failed}`);
    for (const r of result.rows) {
      const next = r.nextFireAt?.toISOString() ?? "—";
      if (r.outcome === "fired") {
        console.log(`  ✓ ${r.name} (id=${r.id}) → job=${r.jobId} · next=${next}`);
      } else {
        console.log(`  ✗ ${r.name} (id=${r.id}) ${r.error ?? ""} · retry=${next}`);
      }
    }
  }
  process.exit(result.failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("[scheduled-workflows] fatal:", err);
  process.exit(2);
});
