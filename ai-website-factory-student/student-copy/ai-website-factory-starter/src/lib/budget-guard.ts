/**
 * G10 — Budget guard.
 *
 * Before approving (auto or otherwise) a fix:* job, check whether the
 * site has burnt its weekly cap. Returns { ok: true, priority } when the
 * job may proceed; { ok: false, reason } when the cap is hit.
 *
 * Priority is "high" when the site is in the priority lane (low composite)
 * OR has the priorityLane flag set; otherwise "normal".
 */
import { and, eq, gte, sql } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { claudeJobs, siteBudgets, siteHealthAudits } from "@/db/schema";

export type GuardResult = { ok: true; priority: "high" | "normal" } | { ok: false; reason: string };

const DEFAULT_BUDGET = {
  weeklyFixCap: 20,
  weeklyGbpPostCap: 2,
  autoApproveEnabled: true,
  priorityLane: false,
  compositeLowThreshold: 70,
};

export async function guardFixDispatch(siteId: string): Promise<GuardResult> {
  await ensureSchema();
  const [budget] = await db().select().from(siteBudgets).where(eq(siteBudgets.siteId, siteId)).limit(1);
  const eff = { ...DEFAULT_BUDGET, ...budget };

  // Count fix:* jobs queued or completed for this site in the past 7 days.
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400_000);
  const [{ count }] = await db()
    .select({ count: sql<number>`count(*)::int` })
    .from(claudeJobs)
    .where(and(
      sql`(${claudeJobs.input}->>'siteId')::uuid = ${siteId}`,
      sql`${claudeJobs.kind} LIKE 'fix:%'`,
      gte(claudeJobs.createdAt, sevenDaysAgo),
    ));

  if (count >= eff.weeklyFixCap) {
    return { ok: false, reason: `weekly fix cap (${eff.weeklyFixCap}) reached for this site` };
  }

  // Check composite from latest audit. If below threshold OR priorityLane=true → high priority.
  let priority: "high" | "normal" = "normal";
  if (eff.priorityLane) {
    priority = "high";
  } else {
    const [latest] = await db()
      .select({ composite: siteHealthAudits.compositeScore })
      .from(siteHealthAudits)
      .where(eq(siteHealthAudits.siteId, siteId))
      .orderBy(sql`run_date DESC`)
      .limit(1);
    if (latest && latest.composite != null && latest.composite < eff.compositeLowThreshold) priority = "high";
  }

  return { ok: true, priority };
}
