"use server";

/**
 * Schema Architect actions — generate-on-demand + approve/reject for
 * `schema_inject` seoProposals. Reuses the same proposal/action/audit
 * lifecycle as the SEO Inbox (src/app/actions/seo.ts,
 * src/app/actions/seo-bulk.ts) but scoped to one kind and redirecting back
 * to /admin/schema-architect instead of /admin/seo.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { aiUsage, seoActions, seoProposals, sitePages, sites } from "@/db/schema";
import { proposeSchema } from "@/lib/seo-agent-onpage";
import { validateSchema } from "@/lib/seo-validators";
import { validateSchemaUrlsResolve } from "@/lib/seo-validators-external";
import { costMicroUsd } from "@/lib/ai-pricing";
import { recordAdminAction } from "@/lib/audit-log";
import { requireAdmin } from "@/lib/server-auth";
import { callPlugin, WpPluginError } from "@/lib/wp-plugin-client";

function pageKindFromPostType(postType: string, slug: string): "home" | "service" | "city" | "article" | "faq" | "contact" | "about" | "unknown" {
  if (slug === "" || slug === "/" || slug === "home") return "home";
  if (postType === "post") return "article";
  if (slug.includes("faq")) return "faq";
  if (slug.includes("contact")) return "contact";
  if (slug.includes("about")) return "about";
  if (postType === "page") return "service";
  return "unknown";
}

/**
 * Generate one schema_inject proposal for a single page, right now —
 * outside the nightly seo:scan cron. Runs the same propose → validate →
 * insert-as-pending pipeline as seo-scan.ts's runSchemaProposal, minus the
 * crawl step (we already have the page's stored metadata).
 */
export async function generateSchemaForPageAction(formData: FormData): Promise<void> {
  await ensureSchema();
  await requireAdmin();
  const pageId = String(formData.get("pageId") ?? "").trim();
  if (!pageId) redirect("/admin/schema-architect?error=missing-page");

  const [page] = await db().select().from(sitePages).where(eq(sitePages.id, pageId)).limit(1);
  if (!page) redirect("/admin/schema-architect?error=page-not-found");

  const [site] = await db().select().from(sites).where(eq(sites.id, page.siteId)).limit(1);
  if (!site) redirect("/admin/schema-architect?error=site-not-found");

  let proposal;
  try {
    proposal = await proposeSchema({
      pageUrl: page.url,
      pageType: pageKindFromPostType(page.postType, page.slug),
      title: page.title,
      h1: page.title,
      metaDescription: "",
      bodyExcerpt: "",
      existingSchemaTypes: [],
      site: {
        name: site.name,
        domain: site.domain,
        city: site.city ?? null,
        region: site.region ?? null,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "generation-failed";
    redirect(`/admin/schema-architect?error=${encodeURIComponent(message)}`);
  }

  const micro = costMicroUsd({
    model: proposal.model,
    inputTokens: proposal.inputTokens,
    outputTokens: proposal.outputTokens,
    cacheReadTokens: proposal.cacheReadTokens,
    cacheWriteTokens: proposal.cacheWriteTokens,
  });
  await db().insert(aiUsage).values({
    agent: "seo_scan",
    parentType: null,
    parentId: null,
    siteId: site.id,
    model: proposal.model,
    inputTokens: proposal.inputTokens,
    outputTokens: proposal.outputTokens,
    cacheReadTokens: proposal.cacheReadTokens,
    cacheWriteTokens: proposal.cacheWriteTokens,
    costMicroUsd: micro,
    durationMs: proposal.durationMs,
  });

  if (!proposal.jsonLd || !proposal.schemaType) {
    redirect(`/admin/schema-architect?error=${encodeURIComponent(proposal.skipReason ?? "model-declined")}`);
  }

  const formatVal = validateSchema({ schemaType: proposal.schemaType, jsonLd: proposal.jsonLd });
  if (!formatVal.ok) {
    redirect(`/admin/schema-architect?error=${encodeURIComponent("invalid-schema: " + formatVal.errors.join("; "))}`);
  }

  const urlVal = await validateSchemaUrlsResolve(proposal.jsonLd);
  if (!urlVal.ok) {
    redirect(`/admin/schema-architect?error=${encodeURIComponent("broken-url-in-schema: " + urlVal.errors.join("; "))}`);
  }

  await db().insert(seoProposals).values({
    siteId: site.id,
    kind: "schema_inject",
    status: "pending",
    autoApply: false,
    payload: { page_url: page.url, schema_type: proposal.schemaType, json_ld: proposal.jsonLd },
    rationale: `Generated on demand for ${page.url} — ${proposal.schemaType} fills a gap on this page.`,
    model: proposal.model,
    inputTokens: proposal.inputTokens,
    outputTokens: proposal.outputTokens,
    cacheReadTokens: proposal.cacheReadTokens,
  });

  revalidatePath("/admin/schema-architect");
  redirect("/admin/schema-architect?ok=generated");
}

export async function approveSchemaProposalAction(formData: FormData): Promise<void> {
  await ensureSchema();
  const user = await requireAdmin();
  const proposalId = String(formData.get("proposalId") ?? "").trim();
  if (!proposalId) redirect("/admin/schema-architect?error=missing-id");

  const [proposal] = await db().select().from(seoProposals).where(eq(seoProposals.id, proposalId)).limit(1);
  if (!proposal) redirect("/admin/schema-architect?error=not-found");
  if (proposal.status !== "pending") redirect(`/admin/schema-architect?error=already-${proposal.status}`);

  await db().update(seoProposals).set({ status: "approved", updatedAt: new Date() }).where(eq(seoProposals.id, proposalId));

  let success = false;
  let pluginResponse: Record<string, unknown> | null = null;
  let errorMessage: string | null = null;

  try {
    const resp = await callPlugin<{ ok: boolean; updated?: number; error?: string }>(proposal.siteId, {
      method: "POST",
      path: "/seo-apply",
      body: { kind: proposal.kind, ...(proposal.payload as Record<string, unknown>) },
    });
    pluginResponse = resp;
    success = resp.ok === true;
    if (!success) errorMessage = resp.error ?? "plugin returned ok:false";
  } catch (err) {
    errorMessage = err instanceof WpPluginError ? `${err.reason}: ${err.message}` : err instanceof Error ? err.message : String(err);
  }

  await db().update(seoProposals).set({
    status: success ? "applied" : "failed",
    appliedAt: success ? new Date() : null,
    appliedBy: success ? user.id : null,
    errorMessage,
    updatedAt: new Date(),
  }).where(eq(seoProposals.id, proposalId));

  await db().insert(seoActions).values({
    proposalId, siteId: proposal.siteId, kind: proposal.kind,
    appliedVia: "manual", pluginResponse, success, errorMessage,
  });

  await recordAdminAction({
    actor: user,
    kind: success ? "seo.proposal.applied" : "seo.proposal.failed",
    targetType: "site", targetId: proposal.siteId,
    summary: `${proposal.kind} proposal ${success ? "applied" : "FAILED"} (${proposalId})`,
    before: { status: "pending" },
    after: { status: success ? "applied" : "failed", error: errorMessage },
  });

  revalidatePath("/admin/schema-architect");
  redirect("/admin/schema-architect");
}

export async function rejectSchemaProposalAction(formData: FormData): Promise<void> {
  await ensureSchema();
  const user = await requireAdmin();
  const proposalId = String(formData.get("proposalId") ?? "").trim();
  if (!proposalId) redirect("/admin/schema-architect?error=missing-id");

  const [proposal] = await db().select().from(seoProposals).where(eq(seoProposals.id, proposalId)).limit(1);
  if (!proposal) redirect("/admin/schema-architect?error=not-found");
  if (proposal.status !== "pending") redirect(`/admin/schema-architect?error=already-${proposal.status}`);

  await db().update(seoProposals).set({
    status: "rejected", rejectedAt: new Date(), rejectedBy: user.id, rejectReason: "manual-reject", updatedAt: new Date(),
  }).where(eq(seoProposals.id, proposalId));

  await recordAdminAction({
    actor: user, kind: "seo.proposal.rejected", targetType: "site", targetId: proposal.siteId,
    summary: `${proposal.kind} proposal rejected`,
  });

  revalidatePath("/admin/schema-architect");
  redirect("/admin/schema-architect");
}
