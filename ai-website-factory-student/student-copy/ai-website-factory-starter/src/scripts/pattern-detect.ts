/**
 * P2 — Nightly cross-site pattern detection.
 *
 * Runs the 6 deterministic detectors in lib/patterns.ts, dedupes against
 * existing open patterns (matched by kind), and:
 *
 *  - INSERTs new patterns with status='open'
 *  - UPDATEs the evidence + sites_affected for re-detected patterns
 *  - RESOLVEs open patterns that no longer fire (status='resolved')
 *  - SPAWNs agent_tasks for any pattern with a CTA, unless an open task
 *    already exists for that pattern
 *
 * Idempotent: re-running the same day is safe.
 *
 * Suggested cron: daily 04:55 UTC (after scoring:compute at 04:45).
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, ensureSchema } from "../db/client";
import { agentTasks, sitePatterns } from "../db/schema";
import { detectAllPatterns, type PatternProposal } from "../lib/patterns";

const dryRun = process.argv.includes("--dry-run");

async function upsertPattern(p: PatternProposal): Promise<{ id: string; isNew: boolean }> {
  // Look up open pattern by kind.
  const [existing] = await db()
    .select({ id: sitePatterns.id })
    .from(sitePatterns)
    .where(and(eq(sitePatterns.kind, p.kind), eq(sitePatterns.status, "open")))
    .limit(1);

  if (existing) {
    await db()
      .update(sitePatterns)
      .set({
        title: p.title,
        summary: p.summary,
        severity: p.severity,
        sitesAffected: p.sitesAffected,
        evidence: p.evidence,
      })
      .where(eq(sitePatterns.id, existing.id));
    return { id: existing.id, isNew: false };
  }

  const [inserted] = await db()
    .insert(sitePatterns)
    .values({
      kind: p.kind,
      severity: p.severity,
      title: p.title,
      summary: p.summary,
      sitesAffected: p.sitesAffected,
      evidence: p.evidence,
    })
    .returning({ id: sitePatterns.id });
  return { id: inserted.id, isNew: true };
}

async function ensureAgentTask(p: PatternProposal, patternId: string) {
  if (!p.cta) return null;
  // Already has an open agent_task for this pattern?
  const [existing] = await db()
    .select({ id: agentTasks.id })
    .from(agentTasks)
    .where(and(eq(agentTasks.patternId, patternId), inArray(agentTasks.status, ["proposed", "in_progress"])))
    .limit(1);
  if (existing) return existing.id;

  const [inserted] = await db()
    .insert(agentTasks)
    .values({
      patternId,
      kind: p.cta.kind,
      priority: p.cta.priority ?? "normal",
      title: p.cta.title,
      description: p.cta.description,
      cta: { href: p.cta.href ?? null },
    })
    .returning({ id: agentTasks.id });
  return inserted.id;
}

async function autoResolveStale(currentKinds: Set<string>) {
  // Any open pattern whose kind didn't fire today → mark resolved.
  const open = await db()
    .select({ id: sitePatterns.id, kind: sitePatterns.kind })
    .from(sitePatterns)
    .where(eq(sitePatterns.status, "open"));
  const toResolve = open.filter((p) => !currentKinds.has(p.kind));
  if (toResolve.length === 0) return 0;
  await db()
    .update(sitePatterns)
    .set({ status: "resolved", resolvedAt: new Date() })
    .where(inArray(sitePatterns.id, toResolve.map((p) => p.id)));
  return toResolve.length;
}

async function main() {
  await ensureSchema();
  const now = new Date();
  console.log("[patterns] detecting…");
  const proposals = await detectAllPatterns(now);
  console.log(`[patterns] ${proposals.length} pattern proposal(s) returned`);

  if (dryRun) {
    for (const p of proposals) {
      console.log(`  ↳ [${p.severity}] ${p.kind} — ${p.title}`);
    }
    return;
  }

  const currentKinds = new Set(proposals.map((p) => p.kind));
  let newCount = 0;
  let updatedCount = 0;
  let taskCount = 0;
  for (const p of proposals) {
    const { id, isNew } = await upsertPattern(p);
    if (isNew) newCount++;
    else updatedCount++;
    const taskId = await ensureAgentTask(p, id);
    if (taskId && isNew) taskCount++;
  }
  const resolved = await autoResolveStale(currentKinds);

  console.log(`[patterns] done — new=${newCount} updated=${updatedCount} resolved=${resolved} tasks=${taskCount}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[patterns] fatal", err);
    process.exit(1);
  });
