"use server";

/**
 * G5 — fix-queue actions.
 *
 *   - approveFixProposal(id)       queue the underlying fix:* job
 *   - rejectFixProposal(id)        mark rejected
 *   - approveBulk({ kind?, siteId? }) batch-approve everything matching filter
 *   - toggleAutoApproveRule(...)   add/remove an auto-approve rule
 *
 * On approve, we drop a claudeJobs row with preferWorker='mac' so the
 * subscription-only G4 dispatcher runs the fix.
 */

import { revalidatePath } from "next/cache";
import { and, count, eq, sql } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import {
  claudeJobs,
  fixAutoApproveRules,
  fixProposals,
} from "@/db/schema";
import { recordAdminAction } from "@/lib/audit-log";
import { requireAdmin } from "@/lib/server-auth";
import { guardFixDispatch } from "@/lib/budget-guard";

export async function approveFixProposal(id: string): Promise<{ ok: boolean; error?: string; jobId?: string }> {
  await ensureSchema();
  const me = await requireAdmin();
  const [proposal] = await db().select().from(fixProposals).where(eq(fixProposals.id, id)).limit(1);
  if (!proposal) return { ok: false, error: "not-found" };
  if (proposal.status !== "pending") return { ok: false, error: `already-${proposal.status}` };

  const guard = await guardFixDispatch(proposal.siteId);
  if (!guard.ok) return { ok: false, error: guard.reason };

  const [job] = await db().insert(claudeJobs).values({
    kind: proposal.fixKind,
    title: proposal.label,
    input: proposal.input,
    status: "pending",
    priority: guard.priority === "high" ? "high" : (proposal.priority as "low" | "normal" | "high"),
    preferWorker: "mac",
    createdBy: me.id,
  }).returning();

  await db().update(fixProposals).set({
    status: "approved",
    jobId: job.id,
    decidedBy: me.id,
    decidedAt: new Date(),
  }).where(eq(fixProposals.id, id));

  await recordAdminAction({
    actor: me,
    kind: "fix.approve",
    targetType: "site",
    targetId: proposal.siteId,
    summary: `Approved ${proposal.fixKind}`,
    after: { proposalId: id, jobId: job.id },
  });
  revalidatePath("/admin/fix-queue");
  return { ok: true, jobId: job.id };
}

export async function rejectFixProposal(id: string, reason?: string): Promise<{ ok: boolean; error?: string }> {
  await ensureSchema();
  const me = await requireAdmin();
  await db().update(fixProposals).set({
    status: "rejected",
    decidedBy: me.id,
    decidedAt: new Date(),
  }).where(and(eq(fixProposals.id, id), eq(fixProposals.status, "pending")));
  await recordAdminAction({
    actor: me, kind: "fix.reject", targetType: "other", targetId: id,
    summary: `Rejected fix proposal`, after: { reason },
  });
  revalidatePath("/admin/fix-queue");
  return { ok: true };
}

export async function approveBulk(opts: { fixKind?: string; siteId?: string }): Promise<{ ok: boolean; approved: number }> {
  await ensureSchema();
  const me = await requireAdmin();

  const conditions = [eq(fixProposals.status, "pending")];
  if (opts.fixKind) conditions.push(eq(fixProposals.fixKind, opts.fixKind));
  if (opts.siteId) conditions.push(eq(fixProposals.siteId, opts.siteId));

  const rows = await db().select().from(fixProposals).where(and(...conditions));
  let approved = 0;
  let skipped = 0;
  for (const p of rows) {
    const guard = await guardFixDispatch(p.siteId);
    if (!guard.ok) { skipped++; continue; }
    const [job] = await db().insert(claudeJobs).values({
      kind: p.fixKind,
      title: p.label,
      input: p.input,
      status: "pending",
      priority: guard.priority === "high" ? "high" : (p.priority as "low" | "normal" | "high"),
      preferWorker: "mac",
      createdBy: me.id,
    }).returning();
    await db().update(fixProposals).set({
      status: "approved", jobId: job.id, decidedBy: me.id, decidedAt: new Date(),
    }).where(eq(fixProposals.id, p.id));
    approved++;
  }
  await recordAdminAction({
    actor: me, kind: "fix.bulk_approve", targetType: "other",
    summary: `Bulk approved ${approved} proposal(s)${skipped ? ` (${skipped} skipped by budget)` : ""}`,
    after: { fixKind: opts.fixKind, siteId: opts.siteId, approved, skipped },
  });
  revalidatePath("/admin/fix-queue");
  return { ok: true, approved };
}

export async function toggleAutoApproveRule(opts: { fixKind: string; siteId?: string; enabled: boolean; minTrust?: number }): Promise<{ ok: boolean }> {
  await ensureSchema();
  const me = await requireAdmin();
  const existing = await db().select().from(fixAutoApproveRules).where(
    and(
      eq(fixAutoApproveRules.fixKind, opts.fixKind),
      opts.siteId ? eq(fixAutoApproveRules.siteId, opts.siteId) : sql`site_id IS NULL`,
    ),
  ).limit(1);
  if (existing[0]) {
    await db().update(fixAutoApproveRules).set({
      enabled: opts.enabled,
      minTrust: opts.minTrust ?? existing[0].minTrust,
    }).where(eq(fixAutoApproveRules.id, existing[0].id));
  } else {
    await db().insert(fixAutoApproveRules).values({
      fixKind: opts.fixKind,
      siteId: opts.siteId ?? null,
      enabled: opts.enabled,
      minTrust: opts.minTrust ?? 0,
      createdBy: me.id,
    });
  }
  await recordAdminAction({
    actor: me, kind: "fix.auto_approve_toggle", targetType: "other",
    summary: `${opts.enabled ? "Enabled" : "Disabled"} auto-approve for ${opts.fixKind}`,
    after: opts,
  });
  revalidatePath("/admin/fix-queue");
  return { ok: true };
}

/**
 * Pattern-learning hint: after N (=5) manual approvals of the same kind on
 * the same site, surface the suggestion to enable auto-approve.
 */
export async function autoApproveSuggestion(): Promise<Array<{ fixKind: string; siteId: string | null; approvedCount: number }>> {
  await ensureSchema();
  await requireAdmin();
  const rows = await db()
    .select({
      fixKind: fixProposals.fixKind,
      siteId: fixProposals.siteId,
      approvedCount: count(fixProposals.id),
    })
    .from(fixProposals)
    .where(eq(fixProposals.status, "approved"))
    .groupBy(fixProposals.fixKind, fixProposals.siteId)
    .having(sql`count(${fixProposals.id}) >= 5`);
  return rows.map((r) => ({ fixKind: r.fixKind, siteId: r.siteId, approvedCount: Number(r.approvedCount) }));
}
