"use server";

import { and, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, ensureSchema } from "@/db/client";
import { seoActions, seoProposals } from "@/db/schema";
import { recordAdminAction } from "@/lib/audit-log";
import { requireAdmin } from "@/lib/server-auth";
import { callPlugin, WpPluginError } from "@/lib/wp-plugin-client";

/**
 * Bulk approve all pending SEO proposals matching `kind` (optionally scoped
 * to one site). Used by /admin/seo group "Approve all 47" buttons.
 *
 * For each row: lock → call plugin → write result + audit. Same flow as
 * the single-proposal approve action, just loop. Returns counts so the UI
 * can show "Approved 45, failed 2" toast on the next render.
 */
export async function bulkApproveByKind(input: {
  kind: string;
  siteId?: string;
}): Promise<{ ok: boolean; approved: number; failed: number; skipped: number }> {
  await ensureSchema();
  const user = await requireAdmin();
  if (!input.kind) return { ok: false, approved: 0, failed: 0, skipped: 0 };

  const conditions = [
    eq(seoProposals.status, "pending"),
    eq(seoProposals.kind, input.kind as never),
  ];
  if (input.siteId) conditions.push(eq(seoProposals.siteId, input.siteId));

  const rows = await db().select().from(seoProposals).where(and(...conditions)).limit(500);

  let approved = 0, failed = 0, skipped = 0;
  for (const proposal of rows) {
    // Optimistic lock to 'approved'.
    const lockResult = await db()
      .update(seoProposals)
      .set({ status: "approved", updatedAt: new Date() })
      .where(and(eq(seoProposals.id, proposal.id), eq(seoProposals.status, "pending")));
    if (!lockResult) { skipped++; continue; }

    let success = false;
    let pluginResponse: Record<string, unknown> | null = null;
    let errorMessage: string | null = null;

    try {
      const resp = await callPlugin<{ ok: boolean; updated?: number; error?: string }>(proposal.siteId, {
        method: "POST",
        path: "/seo-apply",
        body: { kind: proposal.kind, ...(proposal.payload as Record<string, unknown>) },
      });
      pluginResponse = resp;
      success = resp.ok === true;
      if (!success) errorMessage = resp.error ?? "plugin returned ok:false";
    } catch (err) {
      errorMessage = err instanceof WpPluginError
        ? `${err.reason}: ${err.message}`
        : err instanceof Error ? err.message : String(err);
    }

    await db().update(seoProposals).set({
      status: success ? "applied" : "failed",
      appliedAt: success ? new Date() : null,
      appliedBy: success ? user.id : null,
      errorMessage,
      updatedAt: new Date(),
    }).where(eq(seoProposals.id, proposal.id));

    await db().insert(seoActions).values({
      proposalId: proposal.id,
      siteId: proposal.siteId,
      kind: proposal.kind,
      appliedVia: "manual",
      pluginResponse,
      success,
      errorMessage,
    });

    if (success) approved++; else failed++;
  }

  await recordAdminAction({
    actor: user,
    kind: "seo.proposal.bulk_approve",
    targetType: "other",
    summary: `Bulk approved ${input.kind}: ${approved} ok, ${failed} failed`,
    after: { kind: input.kind, siteId: input.siteId, approved, failed, skipped },
  });
  revalidatePath("/admin/seo");
  return { ok: true, approved, failed, skipped };
}

/**
 * Bulk reject all pending SEO proposals matching `kind`. No plugin call.
 */
export async function bulkRejectByKind(input: {
  kind: string;
  siteId?: string;
  reason?: string;
}): Promise<{ ok: boolean; rejected: number }> {
  await ensureSchema();
  const user = await requireAdmin();
  if (!input.kind) return { ok: false, rejected: 0 };

  const conditions = [
    eq(seoProposals.status, "pending"),
    eq(seoProposals.kind, input.kind as never),
  ];
  if (input.siteId) conditions.push(eq(seoProposals.siteId, input.siteId));

  const result = await db().update(seoProposals).set({
    status: "rejected",
    rejectedAt: new Date(),
    rejectedBy: user.id,
    rejectReason: input.reason?.trim() || `Bulk rejected (${input.kind})`,
    updatedAt: new Date(),
  }).where(and(...conditions)).returning({ id: seoProposals.id });

  const rejected = result.length;
  await recordAdminAction({
    actor: user,
    kind: "seo.proposal.bulk_reject",
    targetType: "other",
    summary: `Bulk rejected ${input.kind}: ${rejected} items`,
    after: { kind: input.kind, siteId: input.siteId, rejected, reason: input.reason },
  });
  revalidatePath("/admin/seo");
  return { ok: true, rejected };
}
