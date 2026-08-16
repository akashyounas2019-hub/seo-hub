/**
 * Server actions for the Local SEO Rubric audit module.
 *
 * The heavy lifting (per-page audits, judge calls) runs inside the
 * action server-side. For large sites (50+ pages) we kick off a
 * `claude_jobs` row so the Mac worker handles it asynchronously
 * instead of holding the request open for 30+ seconds.
 */

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { claudeJobs, sites, siteBuildProjects } from "@/db/schema";
import { recordAdminAction } from "@/lib/audit-log";
import { auditBuildProject, auditLiveSite } from "@/lib/local-seo-rubric-runner";
import { requireAdmin } from "@/lib/server-auth";

function s(formData: FormData, k: string): string {
  const v = formData.get(k);
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Kick off an audit for a LIVE site. For ≤ 20 pages we run inline so
 * the operator gets immediate feedback; for larger sites we enqueue
 * a claude_jobs row and the Mac worker handles it.
 */
export async function runLiveSiteRubricAction(formData: FormData): Promise<void> {
  await ensureSchema();
  const me = await requireAdmin();
  const siteId = s(formData, "siteId");
  const noJudgeFlag = s(formData, "noJudge") === "1";
  if (!siteId) redirect("/admin/rubric?error=missing-site");

  const [site] = await db().select().from(sites).where(eq(sites.id, siteId)).limit(1);
  if (!site) redirect("/admin/rubric?error=unknown-site");

  // For large sites the audit takes minutes — enqueue a job instead.
  // For small sites run inline.
  const ENQUEUE_THRESHOLD = 25; // pages
  // Cheap probe: ask the plugin for a fast count via /seo-inventory?per_page=1
  // We don't actually fetch yet — instead we just enqueue when forced or
  // always inline for now. Operator can use the CLI for big batches.
  const inline = s(formData, "inline") === "1";

  if (inline) {
    try {
      const result = await auditLiveSite(site.id, { runJudge: !noJudgeFlag });
      await recordAdminAction({
        actor: me,
        kind: "rubric.audit_live",
        targetType: "site",
        targetId: site.id,
        summary: `Live rubric audit: ${result.audited}/${result.totalPages} pages · avg score ${result.averageScore}`,
      });
      revalidatePath(`/admin/rubric/${site.slug}`);
      redirect(`/admin/rubric/${site.slug}?audited=${result.audited}&avg=${result.averageScore}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      redirect(`/admin/rubric/${site.slug}?error=${encodeURIComponent(msg.slice(0, 100))}`);
    }
  } else {
    // Enqueue claude_jobs row — Mac worker preferred (zero API cost on the
    // deterministic pass; cheap Haiku spend on the judge)
    await db().insert(claudeJobs).values({
      kind: "rubric:audit_live",
      title: `Rubric audit · ${site.name}`,
      siteId: site.id,
      input: { siteId: site.id, siteSlug: site.slug, runJudge: !noJudgeFlag, threshold: ENQUEUE_THRESHOLD },
      status: "pending",
      priority: "normal",
      preferWorker: "mac",
      createdBy: me.id,
    });
    await recordAdminAction({
      actor: me,
      kind: "rubric.audit_enqueued",
      targetType: "site",
      targetId: site.id,
      summary: `Enqueued rubric audit for ${site.name}`,
    });
    revalidatePath(`/admin/rubric/${site.slug}`);
    redirect(`/admin/rubric/${site.slug}?queued=1`);
  }
}

/** Kick off an audit for a BUILD project (pre-deploy gate). */
export async function runBuildProjectRubricAction(formData: FormData): Promise<void> {
  await ensureSchema();
  const me = await requireAdmin();
  const projectId = s(formData, "projectId");
  const noJudgeFlag = s(formData, "noJudge") === "1";
  if (!projectId) redirect("/admin/rubric?error=missing-project");

  const [project] = await db().select().from(siteBuildProjects).where(eq(siteBuildProjects.id, projectId)).limit(1);
  if (!project) redirect("/admin/rubric?error=unknown-project");

  try {
    const result = await auditBuildProject(project.id, { runJudge: !noJudgeFlag });
    await recordAdminAction({
      actor: me,
      kind: "rubric.audit_build",
      targetType: "other",
      targetId: project.id,
      summary: `Pre-deploy rubric audit: ${result.audited}/${result.totalPages} pages · avg score ${result.averageScore}`,
    });
    revalidatePath(`/admin/build/${project.id}`);
    revalidatePath(`/admin/rubric/build/${project.id}`);
    redirect(`/admin/rubric/build/${project.id}?audited=${result.audited}&avg=${result.averageScore}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    redirect(`/admin/build/${project.id}?error=${encodeURIComponent(msg.slice(0, 100))}`);
  }
}
