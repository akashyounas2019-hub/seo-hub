"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { seoActions, seoProposals } from "@/db/schema";
import { recordAdminAction } from "@/lib/audit-log";
import { requireAdmin } from "@/lib/server-auth";
import { callPlugin, WpPluginError } from "@/lib/wp-plugin-client";

/**
 * Approve a queued SEO proposal — send the change to the WP plugin and
 * record the result in `seo_actions`. Admin-only for Phase 1; per-site
 * delegated roles will come in Phase 2's polish pass.
 */
export async function approveSeoProposalAction(formData: FormData): Promise<void> {
  await ensureSchema();
  const user = await requireAdmin();
  const proposalId = String(formData.get("proposalId") ?? "").trim();
  if (!proposalId) redirect("/admin/seo?error=missing-id");

  const [proposal] = await db().select().from(seoProposals).where(eq(seoProposals.id, proposalId)).limit(1);
  if (!proposal) redirect("/admin/seo?error=not-found");
  if (proposal.status !== "pending") redirect(`/admin/seo?error=already-${proposal.status}`);

  // Optimistic lock to 'approved' so a duplicate click can't double-apply.
  await db()
    .update(seoProposals)
    .set({ status: "approved", updatedAt: new Date() })
    .where(eq(seoProposals.id, proposalId));

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
    errorMessage =
      err instanceof WpPluginError
        ? `${err.reason}: ${err.message}`
        : err instanceof Error
          ? err.message
          : String(err);
  }

  await db()
    .update(seoProposals)
    .set({
      status: success ? "applied" : "failed",
      appliedAt: success ? new Date() : null,
      appliedBy: success ? user.id : null,
      errorMessage,
      updatedAt: new Date(),
    })
    .where(eq(seoProposals.id, proposalId));

  await db().insert(seoActions).values({
    proposalId,
    siteId: proposal.siteId,
    kind: proposal.kind,
    appliedVia: "manual",
    pluginResponse,
    success,
    errorMessage,
  });

  await recordAdminAction({
    actor: user,
    kind: success ? "seo.proposal.applied" : "seo.proposal.failed",
    targetType: "site",
    targetId: proposal.siteId,
    summary: `${proposal.kind} proposal ${success ? "applied" : "FAILED"} (${proposalId})`,
    before: { status: "pending" },
    after: { status: success ? "applied" : "failed", error: errorMessage },
  });

  revalidatePath("/admin/seo");
  redirect("/admin/seo");
}

/**
 * Reject a queued proposal. Admin can optionally include a reason that's
 * stored on the row for later "what got declined and why" review.
 */
export async function rejectSeoProposalAction(formData: FormData): Promise<void> {
  await ensureSchema();
  const user = await requireAdmin();
  const proposalId = String(formData.get("proposalId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim() || null;
  if (!proposalId) redirect("/admin/seo?error=missing-id");

  const [proposal] = await db().select().from(seoProposals).where(eq(seoProposals.id, proposalId)).limit(1);
  if (!proposal) redirect("/admin/seo?error=not-found");
  if (proposal.status !== "pending") redirect(`/admin/seo?error=already-${proposal.status}`);

  await db()
    .update(seoProposals)
    .set({
      status: "rejected",
      rejectedAt: new Date(),
      rejectedBy: user.id,
      rejectReason: reason,
      updatedAt: new Date(),
    })
    .where(eq(seoProposals.id, proposalId));

  await recordAdminAction({
    actor: user,
    kind: "seo.proposal.rejected",
    targetType: "site",
    targetId: proposal.siteId,
    summary: `${proposal.kind} proposal rejected${reason ? `: ${reason}` : ""}`,
  });

  revalidatePath("/admin/seo");
  redirect("/admin/seo");
}
