"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { qaRuns, sites } from "@/db/schema";
import { recordAdminAction } from "@/lib/audit-log";
import { requireAdmin } from "@/lib/server-auth";

function s(formData: FormData, k: string): string {
  const v = formData.get(k);
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Enqueue a new QA run. The actual run is executed asynchronously by the
 * `npm run qa:run -- --run-id=<id>` script (kicked from cron or manually
 * on the VPS — we don't fork a process from a server action because
 * Playwright is heavy and we'd rather batch).
 */
export async function enqueueQaRunAction(formData: FormData): Promise<void> {
  await ensureSchema();
  const me = await requireAdmin();
  const siteSlug = s(formData, "siteSlug");
  const scope = (s(formData, "scope") || "site") as "site" | "page" | "variant";
  const scopeRef = s(formData, "scopeRef") || null;

  if (!siteSlug) return;
  const [site] = await db().select().from(sites).where(eq(sites.slug, siteSlug)).limit(1);
  if (!site) {
    redirect("/admin/agent/qa?error=site-not-found");
  }

  const [run] = await db()
    .insert(qaRuns)
    .values({
      scope,
      siteId: site.id,
      scopeRef,
      status: "pending",
      triggerKind: "manual",
      triggeredBy: me.id,
    })
    .returning({ id: qaRuns.id });

  await recordAdminAction({
    actor: me,
    kind: "qa.enqueue",
    targetType: "site",
    targetId: site.id,
    summary: `QA run queued for ${siteSlug} (scope=${scope})`,
  });

  revalidatePath("/admin/agent/qa");
  revalidatePath(`/admin/sites/${siteSlug}/qa`);
  redirect(`/admin/agent/qa/${run.id}?queued=1`);
}

/** Mark a check as suppressed (known false-positive). */
export async function suppressCheckAction(formData: FormData): Promise<void> {
  await ensureSchema();
  const me = await requireAdmin();
  const checkId = s(formData, "checkId");
  if (!checkId) return;
  const { qaChecks } = await import("@/db/schema");
  await db()
    .update(qaChecks)
    .set({ suppressed: true, suppressedBy: me.id })
    .where(eq(qaChecks.id, checkId));
  revalidatePath("/admin/agent/qa");
}
