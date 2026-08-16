"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { seoProposals } from "@/db/schema";
import { recordAdminAction } from "@/lib/audit-log";
import { requireAdmin } from "@/lib/server-auth";

function s(formData: FormData, k: string): string {
  const v = formData.get(k);
  return typeof v === "string" ? v.trim() : "";
}

/**
 * V5 sample-review verdict. Records the admin's gut-check on a
 * randomly-sampled auto-applied fix.
 *
 * - "up"    → marks as good, no further action
 * - "down"  → marks as bad; V6 rollback path can pick it up
 * - "skip"  → take it out of the queue without giving a verdict
 *
 * The verdict gets recorded on the proposal itself. The rollback
 * action (V6) lives in `seo-rollback.ts` and is wired from here when
 * verdict = down.
 */
export async function reviewProposalAction(formData: FormData): Promise<void> {
  await ensureSchema();
  const me = await requireAdmin();
  const proposalId = s(formData, "proposalId");
  const verdict = s(formData, "verdict");
  if (!proposalId || !["up", "down", "skip"].includes(verdict)) {
    redirect("/admin/seo/sample-review?error=bad-input");
  }

  await db()
    .update(seoProposals)
    .set({
      reviewVerdict: verdict,
      reviewedBy: me.id,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(seoProposals.id, proposalId));

  await recordAdminAction({
    actor: me,
    kind: `seo.review_${verdict}`,
    targetType: "other",
    targetId: proposalId,
    summary: `Sample-review verdict on proposal ${proposalId}: ${verdict}`,
  });

  // V6 hook — if verdict is "down", the rollback action will trigger
  // automatically. Imported lazily to avoid a circular module dep.
  if (verdict === "down") {
    try {
      const { rollbackProposalAction } = await import("./seo-rollback");
      await rollbackProposalAction({ proposalId, actorId: me.id, reason: "sample-review-down" });
    } catch (err) {
      console.error("[review] auto-rollback failed:", err);
    }
  }

  revalidatePath("/admin/seo/sample-review");
  redirect(`/admin/seo/sample-review?ok=${verdict}`);
}
