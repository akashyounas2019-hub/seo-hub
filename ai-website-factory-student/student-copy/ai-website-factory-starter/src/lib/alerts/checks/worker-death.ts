/**
 * worker_death — flags claude_jobs stuck in:
 *   - status=pending and createdAt older than 20m → backlog isn't draining
 *   - status in (claimed,running) and startedAt older than 15m → worker likely died mid-job
 *
 * Catches the Mac worker silently dying / launchd not restarting.
 */
import { and, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { claudeJobs } from "@/db/schema";
import type { CheckResult, AlertCandidate } from "../check-engine";
import { getRuleConfig } from "../check-engine";

export async function run(): Promise<CheckResult> {
  const startedAt = Date.now();
  const candidates: AlertCandidate[] = [];

  const { config } = await getRuleConfig("worker_death", null);
  const pendingGraceMs = Number(config.pendingGraceMinutes) * 60_000;
  const runningTooLongMs = Number(config.runningTooLongMinutes) * 60_000;

  const now = new Date();
  const pendingThreshold = new Date(now.getTime() - pendingGraceMs);
  const runningThreshold = new Date(now.getTime() - runningTooLongMs);

  const stuckPending = await db()
    .select({
      id: claudeJobs.id,
      kind: claudeJobs.kind,
      title: claudeJobs.title,
      createdAt: claudeJobs.createdAt,
    })
    .from(claudeJobs)
    .where(and(sql`${claudeJobs.status} = 'pending'`, lt(claudeJobs.createdAt, pendingThreshold)))
    .limit(50);

  if (stuckPending.length > 0) {
    const oldest = stuckPending.reduce((a, b) => (a.createdAt < b.createdAt ? a : b));
    const ageMin = Math.floor((now.getTime() - oldest.createdAt.getTime()) / 60_000);
    candidates.push({
      kind: "worker_death",
      siteId: null,
      entity: "pending-backlog",
      severity: stuckPending.length >= 5 ? "critical" : "error",
      title: `${stuckPending.length} claude_job(s) stuck pending`,
      body: `Oldest pending job is ${ageMin}m old (id=${oldest.id}, kind=${oldest.kind}). Check Mac worker via \`ps aux | grep claude-worker\` and \`launchctl list | grep gyl\`.`,
      payload: {
        stuckCount: stuckPending.length,
        oldestJobId: oldest.id,
        oldestAgeMinutes: ageMin,
        kinds: [...new Set(stuckPending.map((s) => s.kind))],
      },
    });
  }

  const stuckRunning = await db()
    .select({ id: claudeJobs.id, kind: claudeJobs.kind, startedAt: claudeJobs.startedAt })
    .from(claudeJobs)
    .where(
      and(
        inArray(claudeJobs.status, ["claimed", "running"]),
        sql`(${claudeJobs.startedAt} IS NULL OR ${claudeJobs.startedAt} < ${runningThreshold})`,
      ),
    )
    .limit(20);

  if (stuckRunning.length > 0) {
    candidates.push({
      kind: "worker_death",
      siteId: null,
      entity: "running-too-long",
      severity: "error",
      title: `${stuckRunning.length} in-flight job(s) older than ${runningTooLongMs / 60_000}m`,
      body: `Jobs marked claimed/running but their startedAt is older than ${runningTooLongMs / 60_000}m. Worker likely crashed mid-job, or job is genuinely slow — review per-job timeout.`,
      payload: {
        stuckCount: stuckRunning.length,
        jobIds: stuckRunning.map((s) => s.id),
        kinds: [...new Set(stuckRunning.map((s) => s.kind))],
      },
    });
  }

  return {
    candidates,
    durationMs: Date.now() - startedAt,
    observed: `pending stuck=${stuckPending.length}; in-flight too long=${stuckRunning.length}`,
  };
}
