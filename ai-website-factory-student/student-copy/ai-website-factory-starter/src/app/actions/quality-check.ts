"use server";

import { db, ensureSchema } from "@/db/client";
import { claudeJobs } from "@/db/schema";
import { requireAdmin } from "@/lib/server-auth";

/**
 * Queue a quality-check job for a given URL. The AKS Mac worker picks up the
 * job and runs the content analysis via Claude Code subscription.
 */
export async function submitQualityCheck(
  url: string,
): Promise<{ ok: true; jobId: string } | { ok: false; error: string }> {
  await ensureSchema();
  const me = await requireAdmin();

  const trimmed = url.trim();
  if (!trimmed) return { ok: false, error: "missing-url" };

  const [created] = await db()
    .insert(claudeJobs)
    .values({
      kind: "quality:check",
      title: `Quality Check — ${trimmed}`,
      input: { url: trimmed },
      status: "pending",
      preferWorker: "mac",
      priority: "normal",
      createdBy: me.id,
    })
    .returning({ id: claudeJobs.id });

  return { ok: true, jobId: created.id };
}
