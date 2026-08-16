"use server";

import { eq } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { claudeJobs, sites } from "@/db/schema";
import { requireAdmin } from "@/lib/server-auth";

/**
 * Queue a content-generation job for a keyword + site. The AKS Mac worker
 * picks up the job and generates the content via Claude Code subscription.
 */
export async function submitContentGeneration(
  keyword: string,
  siteId: string,
): Promise<{ ok: true; jobId: string } | { ok: false; error: string }> {
  await ensureSchema();
  const me = await requireAdmin();

  const trimmedKeyword = keyword.trim();
  const trimmedSiteId = siteId.trim();
  if (!trimmedKeyword) return { ok: false, error: "missing-keyword" };
  if (!trimmedSiteId) return { ok: false, error: "missing-site" };

  const [site] = await db()
    .select()
    .from(sites)
    .where(eq(sites.id, trimmedSiteId))
    .limit(1);
  if (!site) return { ok: false, error: "site-not-found" };

  const [created] = await db()
    .insert(claudeJobs)
    .values({
      kind: "content:write",
      title: `Content — "${trimmedKeyword}" for ${site.name}`,
      siteId: site.id,
      input: { keyword: trimmedKeyword, siteId: site.id },
      status: "pending",
      preferWorker: "mac",
      priority: "normal",
      createdBy: me.id,
    })
    .returning({ id: claudeJobs.id });

  return { ok: true, jobId: created.id };
}
