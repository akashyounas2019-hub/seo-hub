"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, ensureSchema } from "@/db/client";
import { pushDropDismissals } from "@/db/schema";
import { requireAdmin } from "@/lib/server-auth";

export async function dismissCompositeDrop(input: {
  siteId: string;
  untilScore?: number;
  note?: string;
}): Promise<{ ok: boolean }> {
  await ensureSchema();
  const me = await requireAdmin();
  await db().insert(pushDropDismissals).values({
    siteId: input.siteId,
    dismissedAt: new Date(),
    dismissedUntilScore: input.untilScore ?? null,
    dismissedBy: me.id,
    note: input.note ?? null,
  }).onConflictDoUpdate({
    target: pushDropDismissals.siteId,
    set: {
      dismissedAt: new Date(),
      dismissedUntilScore: input.untilScore ?? null,
      dismissedBy: me.id,
      note: input.note ?? null,
    },
  });
  revalidatePath("/admin/inbox");
  revalidatePath(`/admin/sites`);
  return { ok: true };
}

export async function clearCompositeDropDismissal(siteId: string): Promise<{ ok: boolean }> {
  await ensureSchema();
  await requireAdmin();
  await db().delete(pushDropDismissals).where(eq(pushDropDismissals.siteId, siteId));
  revalidatePath("/admin/inbox");
  return { ok: true };
}
