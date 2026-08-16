"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { claudeJobs, sites } from "@/db/schema";
import { recordAdminAction } from "@/lib/audit-log";
import { templateByKind } from "@/lib/claude-job-templates";
import { rotateWorkerSecret } from "@/lib/claude-worker-auth";
import { requireAdmin } from "@/lib/server-auth";

function s(formData: FormData, k: string): string {
  const v = formData.get(k);
  return typeof v === "string" ? v.trim() : "";
}

/** Enqueue a new job. */
export async function enqueueClaudeJobAction(formData: FormData): Promise<void> {
  await ensureSchema();
  const me = await requireAdmin();
  const kind = s(formData, "kind");
  const tmpl = templateByKind(kind);
  if (!tmpl) redirect("/admin/agent/jobs?error=unknown-template");

  // Collect inputs from the template's field definitions
  const input: Record<string, string> = {};
  for (const f of tmpl.fields) {
    const v = s(formData, f.name);
    if (v) input[f.name] = v;
    if (f.required && !v) {
      redirect(`/admin/agent/jobs/new?kind=${kind}&error=missing-${f.name}`);
    }
  }

  // Resolve site if siteSlug was specified
  let siteId: string | null = null;
  let title = tmpl.label;
  if (input.siteSlug) {
    const [site] = await db().select().from(sites).where(eq(sites.slug, input.siteSlug)).limit(1);
    if (!site) redirect(`/admin/agent/jobs/new?kind=${kind}&error=unknown-site`);
    siteId = site.id;
    title = `${tmpl.label} — ${site.name}`;
  }

  const [created] = await db()
    .insert(claudeJobs)
    .values({
      kind,
      title,
      siteId,
      input: input as Record<string, unknown>,
      status: "pending",
      priority: (s(formData, "priority") as "high" | "normal" | "low") || "normal",
      createdBy: me.id,
    })
    .returning({ id: claudeJobs.id });

  await recordAdminAction({
    actor: me,
    kind: "claude_job.enqueue",
    targetType: "other",
    targetId: created.id,
    summary: `Enqueued ${kind} (job ${created.id})`,
  });

  revalidatePath("/admin/agent/jobs");
  redirect(`/admin/agent/jobs/${created.id}?queued=1`);
}

/** Cancel a pending job. */
export async function cancelClaudeJobAction(formData: FormData): Promise<void> {
  await ensureSchema();
  const me = await requireAdmin();
  const id = s(formData, "id");
  if (!id) return;
  await db()
    .update(claudeJobs)
    .set({ status: "cancelled", finishedAt: new Date() })
    .where(eq(claudeJobs.id, id));
  await recordAdminAction({
    actor: me,
    kind: "claude_job.cancel",
    targetType: "other",
    targetId: id,
    summary: `Cancelled job ${id}`,
  });
  revalidatePath("/admin/agent/jobs");
  revalidatePath(`/admin/agent/jobs/${id}`);
}

/** Rotate the worker secret. Returns the new secret in a flash param. */
export async function rotateWorkerSecretAction(): Promise<void> {
  await ensureSchema();
  const me = await requireAdmin();
  const fresh = await rotateWorkerSecret();
  await recordAdminAction({
    actor: me,
    kind: "claude_job.rotate_secret",
    targetType: "org",
    summary: "Rotated Claude Code worker secret",
  });
  revalidatePath("/admin/agent/jobs");
  redirect(`/admin/agent/jobs?newSecret=${encodeURIComponent(fresh)}`);
}
