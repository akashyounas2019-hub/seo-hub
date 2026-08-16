"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { seoActions, seoPolicies, seoProposals } from "@/db/schema";
import { recordAdminAction } from "@/lib/audit-log";
import { requireAdmin } from "@/lib/server-auth";
import { callPlugin, WpPluginError } from "@/lib/wp-plugin-client";

const DAY_MS = 24 * 3600_000;
/** If > 15% of applied fixes for a capability get rolled back in 7d, auto-pause. */
const ROLLBACK_PAUSE_THRESHOLD = 0.15;

/**
 * V6 — Rollback a single applied proposal.
 *
 * Reads the captured before-state from seo_actions.snapshot_before and
 * sends an opposite apply to the WP plugin. For alt_text, this means
 * sending back an empty alt (or whatever the before-state held).
 *
 * After rollback, evaluates the per-capability rollback rate. If
 * over threshold in the last 7 days, the capability gets auto-paused
 * (auto → propose).
 */
interface InvokerArgs {
  proposalId: string;
  actorId: string;
  reason: string;
}

export async function rollbackProposalAction(arg: InvokerArgs | FormData): Promise<void> {
  await ensureSchema();
  const me = await requireAdmin();

  let proposalId: string;
  let reason: string;
  if (arg instanceof FormData) {
    proposalId = String(arg.get("proposalId") ?? "");
    reason = String(arg.get("reason") ?? "manual-rollback");
  } else {
    proposalId = arg.proposalId;
    reason = arg.reason;
  }
  if (!proposalId) {
    if (arg instanceof FormData) redirect("/admin/seo?error=missing-id");
    return;
  }

  const [prop] = await db().select().from(seoProposals).where(eq(seoProposals.id, proposalId)).limit(1);
  if (!prop || prop.status !== "applied") {
    if (arg instanceof FormData) redirect("/admin/seo?error=not-applied");
    return;
  }

  // Latest action row for this proposal (the apply we want to undo).
  const [action] = await db()
    .select()
    .from(seoActions)
    .where(and(eq(seoActions.proposalId, proposalId), eq(seoActions.success, true)))
    .orderBy(desc(seoActions.createdAt))
    .limit(1);
  if (!action) {
    if (arg instanceof FormData) redirect("/admin/seo?error=no-action");
    return;
  }
  if (action.rolledBackAt) {
    if (arg instanceof FormData) redirect("/admin/seo?error=already-rolled-back");
    return;
  }

  // Compose the inverse payload from the snapshot_before.
  const snapshot = (action.snapshotBefore ?? {}) as Record<string, unknown>;
  const payload = (prop.payload ?? {}) as Record<string, unknown>;
  let inverseBody: Record<string, unknown> | null = null;
  switch (prop.kind) {
    case "alt_text":
      // Before-state for alt was empty — re-send an empty alt to clear.
      inverseBody = {
        kind: "alt_text",
        image_url: payload.image_url,
        page_url: payload.page_url,
        alt: "",
      };
      break;
    case "meta_title":
      inverseBody = {
        kind: "meta_title",
        page_url: payload.page_url,
        title: (snapshot.title as string) ?? (payload.before as string) ?? "",
      };
      break;
    case "meta_description":
      inverseBody = {
        kind: "meta_description",
        page_url: payload.page_url,
        description: (snapshot.description as string) ?? (payload.before as string) ?? "",
      };
      break;
    case "schema_inject":
      // No clean undo for schema injection without a per-block ID. Mark
      // the proposal as rolled back but don't push — the admin needs to
      // remove the block manually in WP.
      break;
    default:
      break;
  }

  let rolledBackOk = true;
  let errorMsg: string | null = null;
  if (inverseBody) {
    try {
      const resp = await callPlugin<{ ok: boolean; error?: string }>(prop.siteId, {
        method: "POST",
        path: "/seo-apply",
        body: inverseBody,
      });
      if (!resp.ok) {
        rolledBackOk = false;
        errorMsg = resp.error ?? "plugin returned ok:false";
      }
    } catch (err) {
      rolledBackOk = false;
      errorMsg = err instanceof WpPluginError ? `${err.reason}: ${err.message}` : err instanceof Error ? err.message : String(err);
    }
  }

  await db()
    .update(seoActions)
    .set({ rolledBackAt: new Date(), rolledBackBy: me.id })
    .where(eq(seoActions.id, action.id));
  await db()
    .update(seoProposals)
    .set({ status: rolledBackOk ? "rejected" : "failed", rejectReason: `rollback: ${reason}`, errorMessage: errorMsg, updatedAt: new Date() })
    .where(eq(seoProposals.id, proposalId));

  await recordAdminAction({
    actor: me,
    kind: rolledBackOk ? "seo.rollback_ok" : "seo.rollback_failed",
    targetType: "site",
    targetId: prop.siteId,
    summary: `Rolled back ${prop.kind} for proposal ${proposalId}${errorMsg ? `: ${errorMsg}` : ""}`,
  });

  // Per-capability auto-pause check.
  await maybeAutoPauseCapability(prop.siteId, prop.kind);

  void me;
  if (arg instanceof FormData) {
    revalidatePath("/admin/seo");
    redirect(`/admin/seo?${rolledBackOk ? "ok=rolled-back" : "error=rollback-failed"}`);
  }
}

/**
 * After a rollback, count how many applied fixes for this capability on
 * this site have been rolled back in the last 7 days. If the rate
 * exceeds 15%, downgrade the capability to "propose" so future fixes
 * queue for human approval instead of auto-applying.
 */
async function maybeAutoPauseCapability(siteId: string, kind: string): Promise<void> {
  const weekAgo = new Date(Date.now() - 7 * DAY_MS);
  const [stats] = await db()
    .select({
      total: sql<number>`count(*)::int`,
      rolled: sql<number>`count(*) filter (where ${seoActions.rolledBackAt} is not null)::int`,
    })
    .from(seoActions)
    .where(
      and(
        eq(seoActions.siteId, siteId),
        sql`${seoActions.kind}::text = ${kind}`,
        eq(seoActions.success, true),
        gte(seoActions.createdAt, weekAgo),
      ),
    );
  const total = stats?.total ?? 0;
  const rolled = stats?.rolled ?? 0;
  if (total < 5) return;                            // not enough sample
  if (rolled / total < ROLLBACK_PAUSE_THRESHOLD) return;

  // Downgrade capability mode to "propose".
  const [policy] = await db().select().from(seoPolicies).where(eq(seoPolicies.siteId, siteId)).limit(1);
  const caps = (policy?.capabilities ?? {}) as Record<string, "auto" | "propose" | "off">;
  if (caps[kind] !== "auto") return;                // already not auto, nothing to do
  caps[kind] = "propose";
  await db()
    .insert(seoPolicies)
    .values({ siteId, capabilities: caps, enabled: true })
    .onConflictDoUpdate({ target: seoPolicies.siteId, set: { capabilities: caps, updatedAt: new Date() } });
  console.warn(`[seo:rollback] auto-paused "${kind}" for site ${siteId} — ${rolled}/${total} rolled back in 7d`);
}
