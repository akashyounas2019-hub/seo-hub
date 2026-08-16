"use server";

/**
 * Server actions for the network-health dashboard.
 *
 *   - queueNetworkAudit({siteId?})  → drops a claude_jobs row(s) with
 *     kind='audit:network_health' preferWorker='mac' so the Mac worker
 *     runs the gyl-network-health script via the Claude Code subscription.
 *   - importLatestAuditFromDisk()   → reads the latest JSON output the
 *     Mac worker wrote under ~/gyl-sites/_network/ and upserts into
 *     site_health_audits + page_health_issues + health_dimension_scores.
 *
 * The "fix" actions in later phases (G4/G5) follow the same pattern: drop
 * a preferWorker='mac' job, the worker drains it, the platform imports
 * the result.
 */

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { claudeJobs, sites, sitePages } from "@/db/schema";
import { recordAdminAction } from "@/lib/audit-log";
import { requireAdmin } from "@/lib/server-auth";
import { importNetworkHealthRun } from "@/lib/health-audit-import";
import { inferPageType } from "@/lib/section-schema";

/**
 * Queue a network-health audit. If siteId is set, audit just that one site;
 * otherwise audit every active site in the network.
 */
export async function queueNetworkAudit(opts: { siteId?: string } = {}): Promise<{ ok: boolean; queued?: number; error?: string }> {
  await ensureSchema();
  const me = await requireAdmin();

  const targetSites = opts.siteId
    ? await db().select().from(sites).where(eq(sites.id, opts.siteId)).limit(1)
    : await db().select().from(sites);

  if (targetSites.length === 0) {
    return { ok: false, error: "no sites to audit" };
  }

  // Build a comma-separated input list for the orchestrator. Mac worker reads
  // job.input.sites and runs network-health.mjs with that string.
  const siteHosts = targetSites.map((s) => s.domain).join(",");

  await db().insert(claudeJobs).values({
    kind: "audit:network_health",
    title: opts.siteId
      ? `Audit · ${targetSites[0].name}`
      : `Audit · network (${targetSites.length} sites)`,
    input: {
      sites: siteHosts,
      siteIds: targetSites.map((s) => s.id),
      requestedBy: me.id,
    },
    status: "pending",
    priority: "high",
    preferWorker: "mac",
    createdBy: me.id,
  });

  await recordAdminAction({
    actor: me,
    kind: "audit.network_queue",
    targetType: "site",
    targetId: opts.siteId ?? null,
    summary: opts.siteId
      ? `Queued audit for ${targetSites[0].name}`
      : `Queued audit for ${targetSites.length} site(s)`,
    after: { sites: siteHosts },
  });

  revalidatePath("/admin/health");
  if (opts.siteId) revalidatePath(`/admin/sites/${targetSites[0].slug}/health`);

  return { ok: true, queued: targetSites.length };
}

/**
 * Queue a Section Watch audit. If siteId is set, audit just that site;
 * otherwise queue one job per active site in the network. For each target
 * site we pick ONE representative published page per distinct inferred
 * pageType (so the $0 vision pass only captures a handful of pages, not the
 * whole site), and drop a preferWorker='mac' claude_jobs row the Mac worker
 * drains on the Claude Code subscription (zero API spend).
 */
export async function queueSectionWatch(opts: { siteId?: string } = {}): Promise<{ ok: boolean; queued?: number; error?: string }> {
  await ensureSchema();
  const me = await requireAdmin();

  const targetSites = opts.siteId
    ? await db().select().from(sites).where(eq(sites.id, opts.siteId)).limit(1)
    : await db().select().from(sites);

  if (targetSites.length === 0) {
    return { ok: false, error: "no sites to audit" };
  }

  let queued = 0;
  for (const site of targetSites) {
    // Pull this site's published pages and choose one representative per type.
    const pages = await db()
      .select({ url: sitePages.url, postType: sitePages.postType, status: sitePages.status })
      .from(sitePages)
      .where(and(eq(sitePages.siteId, site.id), eq(sitePages.status, "publish")));

    const byType = new Map<string, { url: string; pageType: string }>();
    for (const p of pages) {
      const pageType = inferPageType(p.url, p.postType);
      if (pageType === "other") continue; // nothing canonical to check
      if (!byType.has(pageType)) byType.set(pageType, { url: p.url, pageType });
    }

    // Fall back to the homepage if we have no inventory yet, so the audit still
    // does something useful on a freshly-connected site.
    const reps = byType.size > 0
      ? Array.from(byType.values())
      : [{ url: `https://${site.domain}/`, pageType: "home" }];

    await db().insert(claudeJobs).values({
      kind: "audit:section_watch",
      title: `Section watch — ${site.slug}`,
      siteId: site.id,
      input: {
        siteId: site.id,
        pages: reps,
        requestedBy: me.id,
      },
      status: "pending",
      priority: "normal",
      preferWorker: "mac",
      createdBy: me.id,
    });
    queued += 1;
  }

  await recordAdminAction({
    actor: me,
    kind: "audit.section_watch_queue",
    targetType: "site",
    targetId: opts.siteId ?? null,
    summary: opts.siteId
      ? `Queued section watch for ${targetSites[0].name}`
      : `Queued section watch for ${targetSites.length} site(s)`,
  });

  revalidatePath("/admin/seo-health");
  revalidatePath("/admin/health");
  if (opts.siteId) revalidatePath(`/admin/sites/${targetSites[0].slug}/health`);

  return { ok: true, queued };
}

/**
 * Import the latest network-audit run from disk (where the Mac worker
 * dropped it). Returns the count of sites + issues imported.
 */
export async function importLatestAuditFromDisk(opts: { runDate?: string } = {}): Promise<{ ok: boolean; runDate?: string; sites?: number; issues?: number; error?: string }> {
  await ensureSchema();
  const me = await requireAdmin();
  const result = await importNetworkHealthRun({ runDate: opts.runDate });
  if (!result.ok) return { ok: false, error: result.error };

  await recordAdminAction({
    actor: me,
    kind: "audit.import",
    targetType: "other",
    summary: `Imported audit run ${result.runDate} (${result.sitesImported} sites)`,
    after: { sitesImported: result.sitesImported, issuesImported: result.issuesImported },
  });
  revalidatePath("/admin/health");

  return { ok: true, runDate: result.runDate, sites: result.sitesImported, issues: result.issuesImported };
}
