"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { siteScreenshots } from "@/db/schema";
import { recordAdminAction } from "@/lib/audit-log";
import { requireAdmin } from "@/lib/server-auth";

function s(formData: FormData, k: string): string {
  const v = formData.get(k);
  return typeof v === "string" ? v.trim() : "";
}

/** Mark a screenshot as reviewed. */
export async function reviewScreenshotAction(formData: FormData): Promise<void> {
  await ensureSchema();
  const me = await requireAdmin();
  const id = s(formData, "screenshotId");
  if (!id) return;
  await db()
    .update(siteScreenshots)
    .set({ reviewed: true, reviewedBy: me.id, reviewedAt: new Date() })
    .where(eq(siteScreenshots.id, id));
  await recordAdminAction({
    actor: me,
    kind: "screenshot.review",
    targetType: "site",
    targetId: id,
    summary: `Reviewed screenshot ${id}`,
  });
  revalidatePath("/admin/screenshots");
  revalidatePath("/admin/sites");
}
