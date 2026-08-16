"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, ensureSchema } from "@/db/client";
import { trackedKeywords, sites } from "@/db/schema";
import { requireAdmin } from "@/lib/server-auth";

export async function addTrackedKeyword(input: {
  siteId: string;
  keyword: string;
  targetUrl?: string;
  location?: string;
  device?: "desktop" | "mobile";
}): Promise<{ ok: boolean; error?: string; id?: string }> {
  await ensureSchema();
  await requireAdmin();
  const keyword = input.keyword.trim();
  if (!keyword) return { ok: false, error: "missing-keyword" };
  if (!input.siteId) return { ok: false, error: "missing-site" };

  // Confirm the site exists before inserting (FK would catch this but a clean
  // error message is better than a Postgres unique-violation surface).
  const [site] = await db().select({ id: sites.id }).from(sites).where(eq(sites.id, input.siteId)).limit(1);
  if (!site) return { ok: false, error: "site-not-found" };

  try {
    const [row] = await db().insert(trackedKeywords).values({
      siteId: input.siteId,
      keyword,
      targetUrl: input.targetUrl?.trim() || null,
      location: input.location?.trim() || "United Arab Emirates",
      device: input.device ?? "desktop",
      source: "auto",
      enabled: true,
    }).returning();
    revalidatePath("/admin/keywords");
    revalidatePath(`/admin/sites`);
    return { ok: true, id: row.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("duplicate") || msg.includes("unique")) {
      return { ok: false, error: "already-tracked" };
    }
    return { ok: false, error: msg };
  }
}

export async function disableTrackedKeyword(id: string): Promise<{ ok: boolean }> {
  await ensureSchema();
  await requireAdmin();
  await db().update(trackedKeywords).set({ enabled: false }).where(eq(trackedKeywords.id, id));
  revalidatePath("/admin/keywords");
  return { ok: true };
}
