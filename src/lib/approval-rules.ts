// Pure evaluation logic for approval_rules. No DB access here -- callers
// (api.orchestrator's job-completion handler, the Approvals screen's
// "re-evaluate all pending" action) fetch the rule list and task fields and
// pass them in, so this stays trivially unit-testable.

export type ApprovalPriority = "low" | "medium" | "high" | "critical";

const PRIORITY_RANK: Record<string, number> = { low: 0, medium: 1, high: 2, critical: 3 };

export type EvaluableRule = {
  id: string;
  name: string;
  minPriority: string | null;
  category: string | null;
  siteId: string | null;
  requiresApproval: boolean;
  enabled: boolean;
};

export type EvaluableTask = {
  priority: string | null | undefined;
  category: string | null | undefined;
  siteId: string | null | undefined;
};

export type ApprovalDecision = {
  requiresApproval: boolean;
  matchedRule: EvaluableRule | null;
};

/**
 * Decides whether a task needs the owner's own approval or can be
 * auto-approved (Head of Department tier), given the enabled rule set.
 *
 * Matching: a rule applies to a task only if every dimension the rule sets
 * (non-null) matches the task -- minPriority means "task priority is at or
 * above this threshold", category/siteId mean exact match. A rule with all
 * three dimensions null applies to everything (a global default).
 *
 * Specificity: among all matching rules, the one setting the most
 * dimensions wins (site+category+priority beats priority-only). Ties break
 * by requiring approval (fail safe -- when rules disagree, prefer asking).
 */
/**
 * Real attribution for an auto-approved task: the Head of Department user
 * account (users.role = 'head_of_department'), if one exists. Falls back to
 * a generic label when none has been added in Settings > Roles yet -- never
 * silent, but never claims a specific person approved something when no
 * such person is configured.
 *
 * Was previously duplicated byte-for-byte in api.jobs.$id.complete.ts and
 * api.tasks.pending-approval.ts -- both real approval code paths (a task
 * auto-approved at creation time vs. via "Re-evaluate pending") needing
 * this exact lookup, with no shared source of truth to keep them in sync.
 */
export async function resolveHeadOfDepartment(): Promise<string> {
  const { db } = await import("@/db/client");
  const { users } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  try {
    const d = db();
    const [hod] = await d.select().from(users).where(eq(users.role, "head_of_department" as any)).limit(1);
    return hod ? (hod.email || hod.name || "Head of Department") : "Head of Department (unassigned)";
  } catch {
    return "Head of Department (unassigned)";
  }
}

export function evaluateApproval(task: EvaluableTask, rules: EvaluableRule[]): ApprovalDecision {
  const taskPriorityRank = PRIORITY_RANK[(task.priority || "medium").toLowerCase()] ?? 1;

  let best: { rule: EvaluableRule; specificity: number } | null = null;

  for (const rule of rules) {
    if (!rule.enabled) continue;

    let specificity = 0;

    if (rule.minPriority) {
      const ruleRank = PRIORITY_RANK[rule.minPriority.toLowerCase()] ?? 0;
      if (taskPriorityRank < ruleRank) continue; // task priority below threshold -- rule doesn't apply
      specificity++;
    }

    if (rule.category) {
      if (!task.category || task.category !== rule.category) continue;
      specificity++;
    }

    if (rule.siteId) {
      if (!task.siteId || task.siteId !== rule.siteId) continue;
      specificity++;
    }

    if (!best || specificity > best.specificity) {
      best = { rule, specificity };
    } else if (specificity === best.specificity && rule.requiresApproval && !best.rule.requiresApproval) {
      // Tie-break: prefer the rule that requires approval (fail safe).
      best = { rule, specificity };
    }
  }

  if (!best) {
    // No rule matched at all -- fail safe, default to requiring approval.
    return { requiresApproval: true, matchedRule: null };
  }

  return { requiresApproval: best.rule.requiresApproval, matchedRule: best.rule };
}
