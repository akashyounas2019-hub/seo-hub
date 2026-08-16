"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, ensureSchema } from "@/db/client";
import { citationQueue } from "@/db/schema";
import { requireAdmin } from "@/lib/server-auth";

export async function addCitation(input: {
  siteId: string;
  directory: string;
  napState?: "not_listed" | "inconsistent" | "listed" | "unknown";
  listingUrl?: string;
  notes?: string;
}): Promise<{ ok: boolean; error?: string }> {
  await ensureSchema();
  await requireAdmin();
  const directory = input.directory.trim().toLowerCase();
  if (!directory) return { ok: false, error: "missing-directory" };
  if (!input.siteId) return { ok: false, error: "missing-site" };

  try {
    await db().insert(citationQueue).values({
      siteId: input.siteId,
      directory,
      napState: input.napState ?? "unknown",
      listingUrl: input.listingUrl?.trim() || null,
      notes: input.notes?.trim() || null,
      checkedAt: new Date(),
    });
    revalidatePath("/admin/gbp");
    revalidatePath(`/admin/sites`);
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("duplicate") || msg.includes("unique")) {
      return { ok: false, error: "already-tracked" };
    }
    return { ok: false, error: msg };
  }
}

export async function updateCitationState(
  id: string,
  napState: "not_listed" | "inconsistent" | "listed" | "unknown",
): Promise<{ ok: boolean }> {
  await ensureSchema();
  await requireAdmin();
  await db().update(citationQueue).set({
    napState,
    checkedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(citationQueue.id, id));
  revalidatePath("/admin/gbp");
  return { ok: true };
}
