"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import {
  apiKeys,
  claudeJobs,
  qaRuns,
  siteBuildPages,
  siteBuildProjects,
  sites,
} from "@/db/schema";
import { recordAdminAction } from "@/lib/audit-log";
import { resolveNiche } from "@/lib/niche";
import { evaluatePhaseGate } from "@/lib/build-gates";
import { callPlugin, WpPluginError } from "@/lib/wp-plugin-client";
import { requireAdmin } from "@/lib/server-auth";
import { desc } from "drizzle-orm";

function s(formData: FormData, k: string): string {
  const v = formData.get(k);
  return typeof v === "string" ? v.trim() : "";
}

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || `build-${Date.now().toString(36)}`
  );
}

/** Step 1 of the wizard — create the project + auto-queue the global research job. */
export async function createBuildProjectAction(formData: FormData): Promise<void> {
  await ensureSchema();
  const me = await requireAdmin();

  const businessName = s(formData, "businessName");
  const niche = s(formData, "niche");
  const domain = s(formData, "domain");
  const city = s(formData, "city");
  const region = s(formData, "region") || "United Arab Emirates";
  const servicesRaw = s(formData, "services");
  const services = servicesRaw
    ? servicesRaw.split(",").map((x) => x.trim()).filter(Boolean)
    : [];
  const contentSource = (s(formData, "contentSource") || "agent_draft") as
    | "agent_draft"
    | "user_provided"
    | "hybrid";
  const contentNotes = s(formData, "contentNotes") || null;
  const designMode = (s(formData, "designMode") || "global_research") as
    | "global_research"
    | "specific_examples";
  const inspirationUrls = s(formData, "inspirationUrls") || null;

  if (!businessName || !niche || !city) {
    redirect("/admin/build/new?error=missing-fields");
  }

  const baseSlug = slugify(businessName);
  // Ensure unique
  let slug = baseSlug;
  for (let i = 2; i < 100; i++) {
    const [existing] = await db()
      .select({ id: siteBuildProjects.id })
      .from(siteBuildProjects)
      .where(eq(siteBuildProjects.slug, slug))
      .limit(1);
    if (!existing) break;
    slug = `${baseSlug}-${i}`;
  }

  const [project] = await db()
    .insert(siteBuildProjects)
    .values({
      slug,
      businessName,
      niche,
      domain: domain || null,
      city,
      region,
      services,
      contentSource,
      contentNotes,
      designMode,
      inspirationUrls,
      phase: "research",
      createdBy: me.id,
    })
    .returning();

  // Auto-queue the global research job — Mac worker preferred
  await db().insert(claudeJobs).values({
    kind: "build:global_research",
    title: `Build · Global research · ${businessName}`,
    input: { businessName, niche, targetCity: city, projectId: project.id },
    status: "pending",
    priority: "high",
    preferWorker: "mac",
    createdBy: me.id,
  });

  await recordAdminAction({
    actor: me,
    kind: "build.create",
    targetType: "other",
    targetId: project.id,
    summary: `Created build project: ${businessName} (${city})`,
  });

  revalidatePath("/admin/build");
  redirect(`/admin/build/${project.id}?queued=research`);
}

/** Approve the current phase and queue the next phase's job. */
export async function advancePhaseAction(formData: FormData): Promise<void> {
  await ensureSchema();
  const me = await requireAdmin();
  const id = s(formData, "id");
  const force = s(formData, "force") === "1";
  if (!id) return;
  const [project] = await db().select().from(siteBuildProjects).where(eq(siteBuildProjects.id, id)).limit(1);
  if (!project) return;

  const phaseOrder = ["brief", "research", "dna", "sitemap", "pages", "review", "deploy", "live"];
  const idx = phaseOrder.indexOf(project.phase);
  if (idx < 0 || idx >= phaseOrder.length - 1) return;
  const nextPhase = phaseOrder[idx + 1];

  // Re-evaluate the phase gate server-side. The client UI gates the same
  // way but we don't trust it — a forged form post shouldn't be able to
  // bypass quality. If the gate fails AND force=1 wasn't supplied, redirect
  // with an error.
  const phaseToJobKind: Record<string, string | null> = {
    brief: null,
    research: "build:global_research",
    dna: "build:design_dna",
    sitemap: "build:sitemap_plan",
    pages: "build:page_generate",
    review: "build:quality_review",
    deploy: null,
    live: null,
  };
  const currentJobKind = phaseToJobKind[project.phase];
  const recentJob = currentJobKind
    ? (
        await db()
          .select()
          .from(claudeJobs)
          .where(sql`${claudeJobs.kind} = ${currentJobKind} AND ${claudeJobs.input}->>'projectId' = ${project.id}`)
          .orderBy(desc(claudeJobs.createdAt))
          .limit(1)
      )[0]
    : undefined;
  const projectPages = await db()
    .select()
    .from(siteBuildPages)
    .where(eq(siteBuildPages.projectId, project.id))
    .orderBy(siteBuildPages.sortOrder);

  const gate = evaluatePhaseGate(
    project.phase as Parameters<typeof evaluatePhaseGate>[0],
    project,
    recentJob,
    projectPages,
  );
  if (!gate.ok && !force) {
    await recordAdminAction({
      actor: me,
      kind: "build.advance_blocked",
      targetType: "other",
      targetId: project.id,
      summary: `Gate blocked advance from ${project.phase} (score ${gate.score})`,
      after: { blocking: gate.blocking, warnings: gate.warnings, score: gate.score },
    });
    redirect(`/admin/build/${id}?error=gate-blocked`);
  }
  if (!gate.ok && force) {
    // Log the override so we can see who pushed forward despite issues.
    await recordAdminAction({
      actor: me,
      kind: "build.advance_force",
      targetType: "other",
      targetId: project.id,
      summary: `Force-advanced from ${project.phase} despite gate score ${gate.score}`,
      after: { blocking: gate.blocking, warnings: gate.warnings, score: gate.score },
    });
  }

  // Queue the right job for the next phase
  let kind: string | null = null;
  let title = "";
  let input: Record<string, unknown> = { projectId: project.id, businessName: project.businessName, niche: resolveNiche(project), targetCity: project.city ?? "" };
  if (nextPhase === "dna") {
    kind = "build:design_dna";
    title = `Build · Design DNA · ${project.businessName}`;
    const researchText =
      typeof project.research === "object" && project.research !== null && "markdown" in project.research
        ? String((project.research as { markdown: string }).markdown)
        : "";
    input = { ...input, research: researchText, preferences: project.contentNotes ?? "" };
  } else if (nextPhase === "sitemap") {
    kind = "build:sitemap_plan";
    title = `Build · Sitemap · ${project.businessName}`;
    const dnaText =
      typeof project.designDna === "object" && project.designDna !== null && "markdown" in project.designDna
        ? String((project.designDna as { markdown: string }).markdown)
        : "";
    input = {
      ...input,
      services: (project.services as string[]).join(", "),
      serviceAreas: project.city ?? "",
      designDna: dnaText,
    };
  } else if (nextPhase === "review") {
    kind = "build:quality_review";
    title = `Build · Quality review · ${project.businessName}`;
    input = { ...input, pagesList: "(pages list will be auto-populated)" };
  }
  // pages / deploy / live phases handled by separate actions (page-by-page generation, deploy button)

  await db()
    .update(siteBuildProjects)
    .set({ phase: nextPhase, updatedAt: new Date() })
    .where(eq(siteBuildProjects.id, id));

  if (kind) {
    await db().insert(claudeJobs).values({
      kind,
      title,
      input,
      status: "pending",
      priority: "high",
      // Heavy reasoning — route to Mac Claude Code worker so it runs on
      // operator's subscription instead of burning API tokens. Server
      // executor takes over after 5 min stale fallback if Mac is offline.
      preferWorker: "mac",
      createdBy: me.id,
    });
  }

  await recordAdminAction({
    actor: me,
    kind: "build.advance",
    targetType: "other",
    targetId: project.id,
    summary: `Advanced to ${nextPhase}`,
  });

  revalidatePath(`/admin/build/${project.id}`);
}

/** Queue a generation job for a single page. */
export async function generatePageAction(formData: FormData): Promise<void> {
  await ensureSchema();
  const me = await requireAdmin();
  const pageId = s(formData, "pageId");
  if (!pageId) return;

  const [page] = await db().select().from(siteBuildPages).where(eq(siteBuildPages.id, pageId)).limit(1);
  if (!page) return;
  const [project] = await db().select().from(siteBuildProjects).where(eq(siteBuildProjects.id, page.projectId)).limit(1);
  if (!project) return;

  const dnaText =
    typeof project.designDna === "object" && project.designDna !== null && "markdown" in project.designDna
      ? String((project.designDna as { markdown: string }).markdown)
      : "";

  await db().insert(claudeJobs).values({
    kind: "build:page_generate",
    title: `Build · Generate · ${page.title}`,
    input: {
      projectId: project.id,
      pageId: page.id,
      businessName: project.businessName,
      niche: resolveNiche(project),
      targetCity: project.city ?? "",
      pageType: page.pageType,
      pageTitle: page.title,
      targetKeyword: "",
      designDna: dnaText,
      extraContext: project.contentNotes ?? "",
      // E — real-world facts baked into the prompt so AI cites real
      // prices/drivers/fleet/areas instead of generic prose.
      businessFacts: project.businessFacts ? JSON.stringify(project.businessFacts) : "",
    },
    status: "pending",
    priority: "normal",
    preferWorker: "mac",
    createdBy: me.id,
  });

  await db()
    .update(siteBuildPages)
    .set({ status: "generating", updatedAt: new Date() })
    .where(eq(siteBuildPages.id, pageId));

  await recordAdminAction({
    actor: me,
    kind: "build.page.generate",
    targetType: "other",
    targetId: pageId,
    summary: `Queued generation: ${page.title}`,
  });

  revalidatePath(`/admin/build/${project.id}`);
  revalidatePath(`/admin/build/${project.id}/pages`);
  revalidatePath(`/admin/build/${project.id}/pages/${pageId}`);
}

/** Queue generation for every pending page in a project (parallel). */
export async function generateAllPendingPagesAction(formData: FormData): Promise<void> {
  await ensureSchema();
  const me = await requireAdmin();
  const projectId = s(formData, "projectId");
  if (!projectId) return;

  const [project] = await db().select().from(siteBuildProjects).where(eq(siteBuildProjects.id, projectId)).limit(1);
  if (!project) return;

  const pending = await db()
    .select()
    .from(siteBuildPages)
    .where(and(eq(siteBuildPages.projectId, projectId), inArray(siteBuildPages.status, ["pending", "failed"])));

  const dnaText =
    typeof project.designDna === "object" && project.designDna !== null && "markdown" in project.designDna
      ? String((project.designDna as { markdown: string }).markdown)
      : "";

  for (const page of pending) {
    await db().insert(claudeJobs).values({
      kind: "build:page_generate",
      title: `Build · Generate · ${page.title}`,
      input: {
        projectId: project.id,
        pageId: page.id,
        businessName: project.businessName,
        niche: resolveNiche(project),
        targetCity: project.city ?? "",
        pageType: page.pageType,
        pageTitle: page.title,
        targetKeyword: "",
        designDna: dnaText,
        extraContext: project.contentNotes ?? "",
        // E — real-world facts (see single-page action above)
        businessFacts: project.businessFacts ? JSON.stringify(project.businessFacts) : "",
      },
      status: "pending",
      priority: "normal",
      preferWorker: "mac",
      createdBy: me.id,
    });
    await db()
      .update(siteBuildPages)
      .set({ status: "generating", updatedAt: new Date() })
      .where(eq(siteBuildPages.id, page.id));
  }

  await recordAdminAction({
    actor: me,
    kind: "build.pages.generate-all",
    targetType: "other",
    targetId: projectId,
    summary: `Queued generation for ${pending.length} page(s)`,
  });

  revalidatePath(`/admin/build/${projectId}`);
  revalidatePath(`/admin/build/${projectId}/pages`);
}

/** Manual edit of a page's body markdown / meta. */
export async function updatePageAction(formData: FormData): Promise<void> {
  await ensureSchema();
  const me = await requireAdmin();
  const pageId = s(formData, "pageId");
  if (!pageId) return;
  const bodyMd = formData.get("bodyMarkdown");
  const update: Partial<typeof siteBuildPages.$inferInsert> = {
    updatedAt: new Date(),
    status: "edited",
  };
  if (typeof bodyMd === "string") {
    update.bodyMarkdown = bodyMd;
    const { markdownToHtml } = await import("@/lib/markdown");
    update.bodyHtml = markdownToHtml(bodyMd);
  }
  const title = formData.get("title");
  const h1 = formData.get("h1");
  const metaTitle = formData.get("metaTitle");
  const metaDescription = formData.get("metaDescription");
  if (typeof title === "string" && title.trim()) update.title = title.trim();
  if (typeof h1 === "string") update.h1 = h1;
  if (typeof metaTitle === "string") update.metaTitle = metaTitle;
  if (typeof metaDescription === "string") update.metaDescription = metaDescription;

  await db().update(siteBuildPages).set(update).where(eq(siteBuildPages.id, pageId));

  const [page] = await db().select().from(siteBuildPages).where(eq(siteBuildPages.id, pageId)).limit(1);
  if (page) {
    revalidatePath(`/admin/build/${page.projectId}/pages/${pageId}`);
    revalidatePath(`/admin/build/${page.projectId}/pages`);
  }
}

/**
 * Push every "ready" page to WordPress via the GYL Suite plugin.
 *
 * Requires the project's domain to map to a `sites` row that already has
 * the plugin installed + an active API key. We use the existing
 * callPlugin() helper which handles HMAC signing.
 */
export async function deployToWordPressAction(formData: FormData): Promise<void> {
  await ensureSchema();
  const me = await requireAdmin();
  const projectId = s(formData, "projectId");
  if (!projectId) redirect("/admin/build?error=missing-id");

  const [project] = await db().select().from(siteBuildProjects).where(eq(siteBuildProjects.id, projectId)).limit(1);
  if (!project) redirect("/admin/build?error=not-found");

  // Resolve the target sites.id row. Either by publishedSiteId (already
  // wired) or by matching the project domain.
  let targetSite: typeof sites.$inferSelect | null = null;
  if (project.publishedSiteId) {
    const [s] = await db().select().from(sites).where(eq(sites.id, project.publishedSiteId)).limit(1);
    targetSite = s ?? null;
  } else if (project.domain) {
    const [s] = await db().select().from(sites).where(eq(sites.domain, project.domain)).limit(1);
    targetSite = s ?? null;
    if (s) {
      await db()
        .update(siteBuildProjects)
        .set({ publishedSiteId: s.id, updatedAt: new Date() })
        .where(eq(siteBuildProjects.id, projectId));
    }
  }
  if (!targetSite) {
    redirect(`/admin/build/${projectId}?error=no-target-site`);
  }

  // Verify the plugin connection has an active API key
  const [key] = await db().select().from(apiKeys).where(and(eq(apiKeys.siteId, targetSite.id), eq(apiKeys.active, true))).limit(1);
  if (!key) {
    redirect(`/admin/build/${projectId}?error=no-api-key`);
  }

  const pages = await db()
    .select()
    .from(siteBuildPages)
    .where(and(eq(siteBuildPages.projectId, projectId), inArray(siteBuildPages.status, ["ready", "edited"])));

  let ok = 0;
  let failed = 0;

  for (const page of pages) {
    // Build the HTML body + append JSON-LD schema blocks inline so the
    // plugin's create-page endpoint stores them verbatim. (Future: pass
    // schema separately if the plugin gains a structured field.)
    const schemaHtml = (page.schemaJson as Array<Record<string, unknown>>)
      .map((block) => `<script type="application/ld+json">${JSON.stringify(block)}</script>`)
      .join("\n");
    const html = (page.bodyHtml ?? "") + (schemaHtml ? "\n" + schemaHtml : "");

    try {
      const resp = await callPlugin<{ ok: boolean; post_id?: number; error?: string }>(targetSite.id, {
        method: "POST",
        path: page.pageType === "blog" ? "/content/create-post" : "/content/create-page",
        body: {
          title: page.title,
          slug: page.pageSlug.replace(/^\//, ""),
          content: html,
          status: "publish",
          meta_title: page.metaTitle,
          meta_description: page.metaDescription,
        },
      });
      if (resp.ok && resp.post_id) {
        await db()
          .update(siteBuildPages)
          .set({
            status: "published",
            wpPostId: resp.post_id,
            publishedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(siteBuildPages.id, page.id));
        ok++;
      } else {
        await db()
          .update(siteBuildPages)
          .set({ status: "failed", updatedAt: new Date() })
          .where(eq(siteBuildPages.id, page.id));
        failed++;
      }
    } catch (err) {
      const msg = err instanceof WpPluginError
        ? `${err.reason} ${err.status}: ${err.bodyText.slice(0, 200)}`
        : err instanceof Error
          ? err.message
          : String(err);
      console.warn(`[build.deploy] page ${page.id} failed:`, msg);
      await db()
        .update(siteBuildPages)
        .set({ status: "failed", updatedAt: new Date() })
        .where(eq(siteBuildPages.id, page.id));
      failed++;
    }
  }

  // Advance project phase to live (or back to deploy on failures)
  const allOk = failed === 0;
  await db()
    .update(siteBuildProjects)
    .set({
      phase: allOk ? "live" : "deploy",
      updatedAt: new Date(),
    })
    .where(eq(siteBuildProjects.id, projectId));

  // Post-publish QA — auto-queue a Playwright run on the live site
  if (allOk) {
    await db().insert(qaRuns).values({
      scope: "site",
      siteId: targetSite.id,
      status: "pending",
      triggerKind: "manual",
      triggeredBy: me.id,
      summary: `Auto-queued after build deploy: ${project.businessName}`,
    });
  }

  await recordAdminAction({
    actor: me,
    kind: "build.deploy",
    targetType: "site",
    targetId: targetSite.id,
    summary: `Deployed ${ok}/${pages.length} pages (failed=${failed})`,
  });

  revalidatePath(`/admin/build/${projectId}`);
  revalidatePath(`/admin/sites/${targetSite.slug}/qa`);
  redirect(`/admin/build/${projectId}?deployed=${ok}&failed=${failed}`);
}

/**
 * P6 — Push (or update) a single page via the GYL Suite WP REST receiver.
 *
 * Used when the operator edits a single page and wants to re-publish it
 * without re-running the whole bulk deploy. The plugin endpoint is
 * idempotent: same slug → wp_update_post; new slug → wp_insert_post.
 */
export async function publishSinglePageAction(formData: FormData): Promise<void> {
  await ensureSchema();
  const me = await requireAdmin();
  const pageId = s(formData, "pageId");
  if (!pageId) redirect("/admin/build?error=missing-page-id");

  const [page] = await db().select().from(siteBuildPages).where(eq(siteBuildPages.id, pageId)).limit(1);
  if (!page) redirect("/admin/build?error=page-not-found");

  const [project] = await db()
    .select()
    .from(siteBuildProjects)
    .where(eq(siteBuildProjects.id, page.projectId))
    .limit(1);
  if (!project) redirect("/admin/build?error=project-not-found");

  // Resolve target site (same lookup as bulk deploy)
  let targetSite: typeof sites.$inferSelect | null = null;
  if (project.publishedSiteId) {
    const [t] = await db().select().from(sites).where(eq(sites.id, project.publishedSiteId)).limit(1);
    targetSite = t ?? null;
  } else if (project.domain) {
    const [t] = await db().select().from(sites).where(eq(sites.domain, project.domain)).limit(1);
    targetSite = t ?? null;
  }
  if (!targetSite) {
    redirect(`/admin/build/${project.id}/pages/${page.id}?error=no-target-site`);
  }

  const schemaHtml = (page.schemaJson as Array<Record<string, unknown>>)
    .map((block) => `<script type="application/ld+json">${JSON.stringify(block)}</script>`)
    .join("\n");
  const html = (page.bodyHtml ?? "") + (schemaHtml ? "\n" + schemaHtml : "");

  try {
    // If we already know the WP post id, hit /update-page. Otherwise hit
    // /create-page (which is idempotent via slug lookup anyway).
    const path = page.wpPostId
      ? "/content/update-page"
      : page.pageType === "blog"
        ? "/content/create-post"
        : "/content/create-page";

    const body: Record<string, unknown> = {
      title: page.title,
      slug: page.pageSlug.replace(/^\//, ""),
      content: html,
      status: "publish",
      meta_title: page.metaTitle,
      meta_description: page.metaDescription,
    };
    if (page.wpPostId) body.id = page.wpPostId;

    const resp = await callPlugin<{ ok: boolean; post_id?: number; permalink?: string; error?: string }>(
      targetSite.id,
      { method: "POST", path, body },
    );
    if (resp.ok && resp.post_id) {
      await db()
        .update(siteBuildPages)
        .set({
          status: "published",
          wpPostId: resp.post_id,
          publishedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(siteBuildPages.id, page.id));
      await recordAdminAction({
        actor: me,
        kind: "build.page_republish",
        targetType: "site",
        targetId: targetSite.id,
        summary: `Published page "${page.title}" → wp_post_id ${resp.post_id}`,
      });
    } else {
      await db()
        .update(siteBuildPages)
        .set({ status: "failed", updatedAt: new Date() })
        .where(eq(siteBuildPages.id, page.id));
    }
  } catch (err) {
    const msg = err instanceof WpPluginError
      ? `${err.reason} ${err.status}: ${err.bodyText.slice(0, 200)}`
      : err instanceof Error
        ? err.message
        : String(err);
    console.warn(`[build.publishSinglePage] page ${page.id} failed:`, msg);
    await db()
      .update(siteBuildPages)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(siteBuildPages.id, page.id));
  }

  revalidatePath(`/admin/build/${project.id}/pages/${page.id}`);
  revalidatePath(`/admin/build/${project.id}/pages`);
  redirect(`/admin/build/${project.id}/pages/${page.id}?republished=1`);
}

/** Discard a project. */
export async function deleteBuildProjectAction(formData: FormData): Promise<void> {
  await ensureSchema();
  const me = await requireAdmin();
  const id = s(formData, "id");
  if (!id) return;
  await db().delete(siteBuildProjects).where(eq(siteBuildProjects.id, id));
  await recordAdminAction({
    actor: me,
    kind: "build.delete",
    targetType: "other",
    targetId: id,
    summary: "Deleted build project",
  });
  revalidatePath("/admin/build");
  redirect("/admin/build");
}
