/**
 * SEO scan — Phase 1 entry point.
 *
 * Iterates every enabled site, crawls a sample of pages, asks the agent to
 * propose alt text for every <img> that lacks one, and (when the per-site
 * policy allows) immediately applies the fix via the WP plugin.
 *
 * Each invocation writes:
 *   - one `seo_audits` row per (site, kind) — kind='alt_text' in Phase 1
 *   - one `seo_findings` row per image missing alt
 *   - one `seo_proposals` row per fix the agent generated
 *   - one `seo_actions` row per fix actually applied (success or failure)
 *   - one `ai_usage` row per Anthropic call, for cost dashboards
 *
 * Usage:
 *   npm run seo:scan                          # every site
 *   npm run seo:scan -- --site=<slug>         # one site
 *   npm run seo:scan -- --site=<slug> --dry   # propose but don't apply
 *
 * Suggested cron (production):
 *   0 3 * * *   cd /home/gyl/gyl-platform && /usr/bin/node --env-file=.env.production --import tsx src/scripts/seo-scan.ts --kind=alt_text >> /var/log/gyl-seo-scan.log 2>&1
 */
import { eq } from "drizzle-orm";
import { db, ensureSchema } from "../db/client";
import {
  aiUsage,
  seoActions,
  seoAudits,
  seoFindings,
  seoPolicies,
  seoProposals,
  seoValidationFailures,
  sites,
} from "../db/schema";
import { costMicroUsd } from "../lib/ai-pricing";
import { proposeAltText, type AltTextProposal } from "../lib/seo-agent";
import {
  proposeMetaDescription,
  proposeMetaTitle,
  proposeSchema,
  type MetaDescriptionProposal,
  type MetaTitleProposal,
  type SchemaProposal,
} from "../lib/seo-agent-onpage";
import { proposeContentRecommendation } from "../lib/seo-agent-content";
import { proposeCompetitorTeardown } from "../lib/seo-agent-competitor";
import { scanHtmlForA11y } from "../lib/seo-a11y-checker";
import { checkNapConsistency, extractNap } from "../lib/seo-local-checker";
import { evaluateCwv, fetchCwv } from "../lib/seo-cwv-checker";
import { probeSecurity } from "../lib/seo-security-checker";
import { extractCtaTexts, extractHeroRegion, proposeUiUxFindings } from "../lib/seo-agent-uiux";
import {
  validateAltText,
  validateMetaDescription,
  validateMetaTitle,
  validateSchema,
  type ValidationResult,
} from "../lib/seo-validators";
import { validateSchemaUrlsResolve, validateUrlsResolve } from "../lib/seo-validators-external";
import { CRITIC_AUTO_THRESHOLD, criticPass, type CriticVerdict } from "../lib/seo-critic";
import { crawlPage, discoverPages, type CrawledPage } from "../lib/seo-crawler";
import { callPlugin, WpPluginError, WpPluginNotConfiguredError } from "../lib/wp-plugin-client";
import { getLLMClient, isLLMConfigured } from "../lib/llm";

type AuditKind = "alt_text" | "on_page" | "content_quality" | "competitor" | "accessibility" | "local_seo" | "core_web_vitals" | "security" | "ui_ux" | "all";

interface RunArgs {
  siteFilterSlug?: string;
  dryRun: boolean;
  kind: AuditKind;
}

function parseArgs(argv: string[]): RunArgs {
  // Default to running every implemented audit kind. Crons can scope down
  // via --kind=alt_text or --kind=on_page if you want only one capability.
  const out: RunArgs = { dryRun: false, kind: "all" };
  for (const a of argv.slice(2)) {
    if (a === "--dry" || a === "--dry-run") out.dryRun = true;
    else if (a.startsWith("--site=")) out.siteFilterSlug = a.slice("--site=".length);
    else if (a.startsWith("--kind=")) {
      const k = a.slice("--kind=".length);
      const valid = ["alt_text", "on_page", "content_quality", "competitor", "accessibility", "local_seo", "core_web_vitals", "security", "ui_ux", "all"];
      if (valid.includes(k)) out.kind = k as AuditKind;
      else {
        console.error(`Unsupported --kind: ${k}. Use one of: ${valid.join(", ")}`);
        process.exit(2);
      }
    }
  }
  return out;
}

interface RunCounters {
  pagesCrawled: number;
  imagesScanned: number;
  imagesMissingAlt: number;
  proposalsGenerated: number;
  proposalsApplied: number;
  proposalsFailed: number;
  costMicroUsd: number;
}

function emptyCounters(): RunCounters {
  return {
    pagesCrawled: 0,
    imagesScanned: 0,
    imagesMissingAlt: 0,
    proposalsGenerated: 0,
    proposalsApplied: 0,
    proposalsFailed: 0,
    costMicroUsd: 0,
  };
}

/** Determine if a given proposal kind should auto-apply for a site. */
function isAutoApply(
  capabilities: Record<string, "auto" | "propose" | "off"> | undefined,
  kind: "alt_text",
): "auto" | "propose" | "off" {
  if (!capabilities) return "auto"; // Phase 1 default — alt text auto-applies
  return capabilities[kind] ?? "auto";
}

/**
 * Centralised validation hook — pipeline V1.
 *
 * Every propose-X helper sends its draft through here before inserting
 * into seo_proposals. Failures are logged to seo_validation_failures
 * and the proposal is dropped silently.
 *
 * Returns true if the proposal should proceed, false if it was rejected.
 */
async function passesValidation(args: {
  siteId: string;
  kind: string;
  validator: string;
  result: ValidationResult;
  sample: Record<string, unknown>;
}): Promise<boolean> {
  if (args.result.ok && args.result.warnings.length === 0) return true;
  if (!args.result.ok) {
    await db().insert(seoValidationFailures).values({
      siteId: args.siteId,
      kind: args.kind,
      validator: args.validator,
      errors: args.result.errors,
      warnings: args.result.warnings,
      sampleOutput: args.sample,
    });
    return false;
  }
  // Warnings only — log them but let it through.
  await db().insert(seoValidationFailures).values({
    siteId: args.siteId,
    kind: args.kind,
    validator: args.validator + ":warn",
    errors: [],
    warnings: args.result.warnings,
    sampleOutput: args.sample,
  });
  return true;
}

async function recordUsage(args: {
  agent: string;
  parentType: string;
  parentId: string;
  siteId: string;
  proposal: AltTextProposal;
}): Promise<number> {
  const micro = costMicroUsd({
    model: args.proposal.model,
    inputTokens: args.proposal.inputTokens,
    outputTokens: args.proposal.outputTokens,
    cacheReadTokens: args.proposal.cacheReadTokens,
    cacheWriteTokens: args.proposal.cacheWriteTokens,
  });
  await db().insert(aiUsage).values({
    agent: args.agent,
    parentType: args.parentType,
    parentId: args.parentId,
    siteId: args.siteId,
    model: args.proposal.model,
    inputTokens: args.proposal.inputTokens,
    outputTokens: args.proposal.outputTokens,
    cacheReadTokens: args.proposal.cacheReadTokens,
    cacheWriteTokens: args.proposal.cacheWriteTokens,
    costMicroUsd: micro,
    durationMs: args.proposal.durationMs,
  });
  return micro;
}

interface SiteContext {
  siteId: string;
  siteSlug: string;
  siteName: string;
  siteDomain: string;
  siteCity: string | null;
  siteRegion: string | null;
  dryRun: boolean;
  kind: AuditKind;
}

async function runForSite(args: SiteContext): Promise<RunCounters> {
  const counters = emptyCounters();
  console.log(`\n[${args.siteSlug}] starting alt-text scan…`);

  // 1. Create the audit row up-front so findings/proposals can FK to it.
  const [audit] = await db()
    .insert(seoAudits)
    .values({
      siteId: args.siteId,
      kind: "alt_text",
      status: "running",
      trigger: "cron",
      startedAt: new Date(),
    })
    .returning({ id: seoAudits.id });
  if (!audit) {
    console.error(`[${args.siteSlug}] could not create audit row`);
    return counters;
  }

  // 2. Look up policy (lazy-init the row if missing). For Phase 1 we just
  // need the auto/propose/off knob per capability.
  const [policy] = await db().select().from(seoPolicies).where(eq(seoPolicies.siteId, args.siteId)).limit(1);
  if (!policy) {
    await db()
      .insert(seoPolicies)
      .values({ siteId: args.siteId, capabilities: { alt_text: "auto" } })
      .onConflictDoNothing();
  }
  const capabilities = policy?.capabilities;
  const policyMode = isAutoApply(capabilities, "alt_text");
  if (policyMode === "off") {
    console.log(`[${args.siteSlug}] policy = off, skipping`);
    await db()
      .update(seoAudits)
      .set({ status: "completed", finishedAt: new Date() })
      .where(eq(seoAudits.id, audit.id));
    return counters;
  }

  // 3. Crawl pages.
  const urls = await discoverPages(args.siteDomain, { maxPages: 25 });
  console.log(`[${args.siteSlug}] discovered ${urls.length} pages`);
  const pages: CrawledPage[] = [];
  for (const url of urls) {
    const page = await crawlPage(url);
    if (page) {
      pages.push(page);
      counters.pagesCrawled += 1;
    }
  }

  // 4. Filter images: only those with empty alt and a usable nearby context.
  const missing = pages.flatMap((p) =>
    p.images.map((img) => ({ page: p, img })),
  );
  counters.imagesScanned = missing.length;
  const candidates = missing.filter(({ img }) => img.alt.trim().length === 0);
  counters.imagesMissingAlt = candidates.length;
  console.log(
    `[${args.siteSlug}] scanned ${counters.imagesScanned} images · ${candidates.length} missing alt`,
  );

  if (candidates.length === 0) {
    await db()
      .update(seoAudits)
      .set({
        status: "completed",
        finishedAt: new Date(),
        findingsCount: 0,
        proposalsCount: 0,
        autoAppliedCount: 0,
      })
      .where(eq(seoAudits.id, audit.id));
    return counters;
  }

  // 5. Ask the agent for alt text on each candidate.
  let appliedCount = 0;
  for (const { page, img } of candidates) {
    // Insert a finding for *every* missing-alt image, even if the agent
    // ends up skipping — that way the inbox shows the full inventory of
    // gaps not just the auto-fixed ones.
    const [finding] = await db()
      .insert(seoFindings)
      .values({
        auditId: audit.id,
        siteId: args.siteId,
        severity: "low",
        code: "alt-text-missing",
        summary: `Image without alt text on ${new URL(page.url).pathname}`,
        url: page.url,
        targetType: "image",
        targetId: img.src,
        payload: { src: img.src, nearbyText: img.nearbyText, pageTitle: page.title },
      })
      .returning({ id: seoFindings.id });
    if (!finding) continue;

    let proposal: AltTextProposal;
    try {
      proposal = await proposeAltText({
        imageUrl: img.src,
        pageUrl: page.url,
        pageTitle: page.title,
        nearbyText: img.nearbyText,
        existingAlt: img.alt,
      });
    } catch (err) {
      console.error(`[${args.siteSlug}] agent error on ${img.src}:`, err);
      continue;
    }

    const microUsd = await recordUsage({
      agent: "seo_scan",
      parentType: "seo_audit",
      parentId: audit.id,
      siteId: args.siteId,
      proposal,
    });
    counters.costMicroUsd += microUsd;

    if (!proposal.alt) {
      // Agent declined — no proposal row, but the finding remains so the
      // admin can fix it manually if they want.
      continue;
    }

    // V1 validation — drop garbage proposals before they reach the inbox.
    const validation = validateAltText({
      alt: proposal.alt,
      imageUrl: img.src,
      pageTitle: page.title,
      nearbyText: img.nearbyText,
    });
    const okToInsert = await passesValidation({
      siteId: args.siteId,
      kind: "alt_text",
      validator: "format",
      result: validation,
      sample: { alt: proposal.alt, image_url: img.src, page_url: page.url },
    });
    if (!okToInsert) continue;

    // V2 validation — confirm the image URL itself actually resolves.
    // (We don't HEAD the page URL — we already crawled it, it works.)
    const imgUrlVal = await validateUrlsResolve([img.src]);
    const imgUrlOk = await passesValidation({
      siteId: args.siteId,
      kind: "alt_text",
      validator: "url_check",
      result: imgUrlVal,
      sample: { image_url: img.src, page_url: page.url },
    });
    if (!imgUrlOk) continue;

    // V3 critic-LLM pass.
    const critic = await criticPass({
      kind: "alt_text",
      siteName: args.siteSlug,  // siteName isn't on this scope; slug is the cheap fallback
      siteDomain: args.siteDomain,
      proposedAlt: proposal.alt,
      imageUrl: img.src,
      pageUrl: page.url,
      pageTitle: page.title,
      nearbyText: img.nearbyText,
    });
    if (critic.confidence < CRITIC_AUTO_THRESHOLD) {
      await db().insert(seoValidationFailures).values({
        siteId: args.siteId,
        kind: "alt_text",
        validator: "critic:routed-to-inbox",
        errors: [],
        warnings: critic.issues,
        sampleOutput: { alt: proposal.alt, confidence: critic.confidence },
        criticConfidence: critic.confidence,
      });
    }

    // Insert a proposal row.
    // Critic-low → force inbox even if policy says auto.
    const shouldAutoApply =
      policyMode === "auto" && !args.dryRun && critic.confidence >= CRITIC_AUTO_THRESHOLD;
    const [prop] = await db()
      .insert(seoProposals)
      .values({
        findingId: finding.id,
        siteId: args.siteId,
        kind: "alt_text",
        status: "pending",
        autoApply: shouldAutoApply,
        payload: {
          image_url: img.src,
          alt: proposal.alt,
          page_url: page.url,
        },
        rationale: critic.issues.length > 0
          ? `Alt text from page context. Critic notes: ${critic.issues.slice(0, 2).join("; ")}`
          : `Alt text generated from the page title and surrounding paragraph context. Image had no alt attribute.`,
        model: proposal.model,
        inputTokens: proposal.inputTokens,
        outputTokens: proposal.outputTokens,
        cacheReadTokens: proposal.cacheReadTokens,
        criticConfidence: critic.confidence,
        criticIssues: critic.issues,
      })
      .returning({ id: seoProposals.id });
    if (!prop) continue;
    counters.proposalsGenerated += 1;

    if (!shouldAutoApply) continue;

    // 6. Send the apply call to the WP plugin (signed).
    try {
      const resp = await callPlugin<{ ok: boolean; updated?: number; error?: string }>(args.siteId, {
        method: "POST",
        path: "/seo-apply",
        body: {
          kind: "alt_text",
          image_url: img.src,
          alt: proposal.alt,
          page_url: page.url,
        },
      });
      if (resp.ok) {
        const sample = shouldSampleForReview(prop.id);
        await db()
          .update(seoProposals)
          .set({ status: "applied", appliedAt: new Date(), sampleForReview: sample })
          .where(eq(seoProposals.id, prop.id));
        await db().insert(seoActions).values({
          proposalId: prop.id,
          siteId: args.siteId,
          kind: "alt_text",
          appliedVia: "auto",
          pluginResponse: resp,
          snapshotBefore: null,           // alt_text doesn't have a meaningful before (was empty)
          success: true,
        });
        appliedCount += 1;
        counters.proposalsApplied += 1;
      } else {
        await db()
          .update(seoProposals)
          .set({ status: "failed", errorMessage: resp.error ?? "plugin returned ok:false" })
          .where(eq(seoProposals.id, prop.id));
        await db().insert(seoActions).values({
          proposalId: prop.id,
          siteId: args.siteId,
          kind: "alt_text",
          appliedVia: "auto",
          pluginResponse: resp,
          success: false,
          errorMessage: resp.error ?? "plugin returned ok:false",
        });
        counters.proposalsFailed += 1;
      }
    } catch (err) {
      const msg =
        err instanceof WpPluginError
          ? `${err.reason}: ${err.message}`
          : err instanceof WpPluginNotConfiguredError
            ? err.message
            : err instanceof Error
              ? err.message
              : String(err);
      await db()
        .update(seoProposals)
        .set({ status: "failed", errorMessage: msg })
        .where(eq(seoProposals.id, prop.id));
      await db().insert(seoActions).values({
        proposalId: prop.id,
        siteId: args.siteId,
        kind: "alt_text",
        appliedVia: "auto",
        success: false,
        errorMessage: msg,
      });
      counters.proposalsFailed += 1;
    }
  }

  await db()
    .update(seoAudits)
    .set({
      status: "completed",
      finishedAt: new Date(),
      findingsCount: counters.imagesMissingAlt,
      proposalsCount: counters.proposalsGenerated,
      autoAppliedCount: appliedCount,
    })
    .where(eq(seoAudits.id, audit.id));

  console.log(
    `[${args.siteSlug}] done · ${counters.proposalsGenerated} proposed · ${appliedCount} applied · ${counters.proposalsFailed} failed · cost $${(counters.costMicroUsd / 1_000_000).toFixed(4)}`,
  );
  return counters;
}

// ─────────────────────────────────────────────────────────────────────
// Phase 2 — on-page audit (titles, descriptions, schema).
// One audit row per site per run. Each crawled page emits up to three
// findings (title-too-long, desc-missing, schema-gap). Each finding may
// produce one proposal. Title/description rewrites auto-apply when the
// per-site policy allows; schema-inject is always auto-apply because it
// adds, never replaces.
// ─────────────────────────────────────────────────────────────────────
async function runOnPageForSite(args: SiteContext): Promise<RunCounters> {
  const counters = emptyCounters();
  console.log(`\n[${args.siteSlug}] starting on-page scan…`);

  const [audit] = await db()
    .insert(seoAudits)
    .values({
      siteId: args.siteId,
      kind: "on_page",
      status: "running",
      trigger: "cron",
      startedAt: new Date(),
    })
    .returning({ id: seoAudits.id });
  if (!audit) {
    console.error(`[${args.siteSlug}] could not create on-page audit row`);
    return counters;
  }

  // Policy lookup for the three capabilities this audit produces.
  const [policy] = await db().select().from(seoPolicies).where(eq(seoPolicies.siteId, args.siteId)).limit(1);
  const caps = policy?.capabilities ?? {};
  // Defaults: titles + descriptions auto-apply (low risk after the agent's
  // own length check). Schema always auto-applies (adds, doesn't replace).
  const titleMode = (caps.meta_title as "auto" | "propose" | "off" | undefined) ?? "auto";
  const descMode = (caps.meta_description as "auto" | "propose" | "off" | undefined) ?? "auto";
  const schemaMode = (caps.schema_inject as "auto" | "propose" | "off" | undefined) ?? "auto";

  // Crawl.
  const urls = await discoverPages(args.siteDomain, { maxPages: 25 });
  const pages: CrawledPage[] = [];
  for (const url of urls) {
    const p = await crawlPage(url);
    if (p) { pages.push(p); counters.pagesCrawled += 1; }
  }
  console.log(`[${args.siteSlug}] crawled ${pages.length} pages for on-page audit`);

  let appliedCount = 0;
  let findingsCount = 0;

  for (const page of pages) {
    // ── Title check ────────────────────────────────────────────────
    if (titleMode !== "off") {
      const titleLen = page.title.length;
      const tooLong = titleLen > 60;
      const tooShort = titleLen < 30 && titleLen > 0;
      const missing = titleLen === 0;
      if (tooLong || tooShort || missing) {
        findingsCount += 1;
        const [finding] = await db().insert(seoFindings).values({
          auditId: audit.id,
          siteId: args.siteId,
          severity: missing ? "high" : tooLong ? "medium" : "low",
          code: missing ? "title-missing" : tooLong ? "title-too-long" : "title-too-short",
          summary: missing
            ? `Page is missing a <title> tag`
            : `Title is ${titleLen} chars (${tooLong ? "over 60" : "under 30"}): "${page.title.slice(0, 80)}"`,
          url: page.url,
          targetType: "page",
          payload: { current: page.title, length: titleLen },
        }).returning({ id: seoFindings.id });
        if (finding) {
          await runMetaTitleProposal(args, audit.id, finding.id, page, titleMode, counters);
          // updated counters in helper
        }
      }
    }

    // ── Description check ─────────────────────────────────────────
    if (descMode !== "off") {
      const descLen = page.metaDescription.length;
      const missing = descLen === 0;
      const tooShort = descLen > 0 && descLen < 80;
      const tooLong = descLen > 170;
      if (missing || tooShort || tooLong) {
        findingsCount += 1;
        const [finding] = await db().insert(seoFindings).values({
          auditId: audit.id,
          siteId: args.siteId,
          severity: missing ? "high" : "medium",
          code: missing ? "meta-desc-missing" : tooLong ? "meta-desc-too-long" : "meta-desc-too-short",
          summary: missing
            ? `Page has no meta description`
            : `Meta description is ${descLen} chars (${tooLong ? "over 170" : "under 80"})`,
          url: page.url,
          targetType: "page",
          payload: { current: page.metaDescription, length: descLen },
        }).returning({ id: seoFindings.id });
        if (finding) {
          await runMetaDescriptionProposal(args, audit.id, finding.id, page, descMode, counters);
        }
      }
    }

    // ── Schema check ──────────────────────────────────────────────
    if (schemaMode !== "off") {
      const desiredTypes = desiredSchemaTypes(page.pageKind);
      const missingType = desiredTypes.find((t) => !page.schemaTypes.includes(t));
      if (missingType) {
        findingsCount += 1;
        const [finding] = await db().insert(seoFindings).values({
          auditId: audit.id,
          siteId: args.siteId,
          severity: "medium",
          code: "schema-missing",
          summary: `Page is missing ${missingType} schema (page kind: ${page.pageKind})`,
          url: page.url,
          targetType: "page",
          payload: { wanted: missingType, existing: page.schemaTypes, pageKind: page.pageKind },
        }).returning({ id: seoFindings.id });
        if (finding) {
          await runSchemaProposal(args, audit.id, finding.id, page, schemaMode, counters);
        }
      }
    }
  }

  // Approximate appliedCount from counters delta (helpers bumped counters.proposalsApplied).
  appliedCount = counters.proposalsApplied;

  await db()
    .update(seoAudits)
    .set({
      status: "completed",
      finishedAt: new Date(),
      findingsCount,
      proposalsCount: counters.proposalsGenerated,
      autoAppliedCount: appliedCount,
    })
    .where(eq(seoAudits.id, audit.id));

  console.log(
    `[${args.siteSlug}] on-page done · ${findingsCount} findings · ${counters.proposalsGenerated} proposed · ${appliedCount} applied · ${counters.proposalsFailed} failed`,
  );
  return counters;
}

/** Choose what schema types a page of this kind ought to have. */
function desiredSchemaTypes(kind: CrawledPage["pageKind"]): string[] {
  switch (kind) {
    case "home":     return ["LocalBusiness"];
    case "service":  return ["Service"];
    case "city":     return ["LocalBusiness"];
    case "article":  return ["Article"];
    case "faq":      return ["FAQPage"];
    case "contact":  return ["ContactPage"];
    case "about":    return ["AboutPage"];
    default:         return [];
  }
}

async function runMetaTitleProposal(
  args: SiteContext,
  auditId: string,
  findingId: string,
  page: CrawledPage,
  policyMode: "auto" | "propose" | "off",
  counters: RunCounters,
): Promise<void> {
  let proposal: MetaTitleProposal;
  try {
    proposal = await proposeMetaTitle({
      pageUrl: page.url,
      currentTitle: page.title,
      h1: page.h1[0] ?? "",
      metaDescription: page.metaDescription,
      brandName: args.siteName,
    });
  } catch (err) {
    console.error(`[${args.siteSlug}] title agent error:`, err);
    return;
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
    parentType: "seo_audit",
    parentId: auditId,
    siteId: args.siteId,
    model: proposal.model,
    inputTokens: proposal.inputTokens,
    outputTokens: proposal.outputTokens,
    cacheReadTokens: proposal.cacheReadTokens,
    cacheWriteTokens: proposal.cacheWriteTokens,
    costMicroUsd: micro,
    durationMs: proposal.durationMs,
  });
  counters.costMicroUsd += micro;
  if (!proposal.title) return;

  // V1 validation.
  const titleVal = validateMetaTitle({ title: proposal.title, existingTitle: page.title });
  const titleOk = await passesValidation({
    siteId: args.siteId,
    kind: "meta_title",
    validator: "format",
    result: titleVal,
    sample: { before: page.title, after: proposal.title, page_url: page.url },
  });
  if (!titleOk) return;

  // V3 critic.
  const titleCritic = await criticPass({
    kind: "meta_title",
    siteName: args.siteName,
    siteDomain: args.siteDomain,
    before: page.title,
    after: proposal.title,
    pageUrl: page.url,
    h1: page.h1[0] ?? "",
  });
  const shouldAuto =
    policyMode === "auto" && !args.dryRun && titleCritic.confidence >= CRITIC_AUTO_THRESHOLD;
  const [prop] = await db().insert(seoProposals).values({
    findingId,
    siteId: args.siteId,
    kind: "meta_title",
    status: "pending",
    autoApply: shouldAuto,
    payload: { page_url: page.url, before: page.title, after: proposal.title },
    rationale: titleCritic.issues.length > 0
      ? `Title rewrite. Critic notes: ${titleCritic.issues.slice(0, 2).join("; ")}`
      : `Title rewritten to fit Google's 580-pixel SERP width and front-load the primary keyword.`,
    model: proposal.model,
    inputTokens: proposal.inputTokens,
    outputTokens: proposal.outputTokens,
    cacheReadTokens: proposal.cacheReadTokens,
    criticConfidence: titleCritic.confidence,
    criticIssues: titleCritic.issues,
  }).returning({ id: seoProposals.id });
  if (!prop) return;
  counters.proposalsGenerated += 1;
  if (!shouldAuto) return;
  await applyProposalToPlugin(args, prop.id, "meta_title", { page_url: page.url, title: proposal.title }, counters);
}

async function runMetaDescriptionProposal(
  args: SiteContext,
  auditId: string,
  findingId: string,
  page: CrawledPage,
  policyMode: "auto" | "propose" | "off",
  counters: RunCounters,
): Promise<void> {
  let proposal: MetaDescriptionProposal;
  try {
    proposal = await proposeMetaDescription({
      pageUrl: page.url,
      currentDescription: page.metaDescription,
      title: page.title,
      h1: page.h1[0] ?? "",
      bodyExcerpt: page.bodyExcerpt,
    });
  } catch (err) {
    console.error(`[${args.siteSlug}] description agent error:`, err);
    return;
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
    parentType: "seo_audit",
    parentId: auditId,
    siteId: args.siteId,
    model: proposal.model,
    inputTokens: proposal.inputTokens,
    outputTokens: proposal.outputTokens,
    cacheReadTokens: proposal.cacheReadTokens,
    cacheWriteTokens: proposal.cacheWriteTokens,
    costMicroUsd: micro,
    durationMs: proposal.durationMs,
  });
  counters.costMicroUsd += micro;
  if (!proposal.description) return;

  // V1 validation.
  const descVal = validateMetaDescription({ description: proposal.description });
  const descOk = await passesValidation({
    siteId: args.siteId,
    kind: "meta_description",
    validator: "format",
    result: descVal,
    sample: { before: page.metaDescription, after: proposal.description, page_url: page.url },
  });
  if (!descOk) return;

  // V3 critic.
  const descCritic = await criticPass({
    kind: "meta_description",
    siteName: args.siteName,
    siteDomain: args.siteDomain,
    before: page.metaDescription,
    after: proposal.description,
    pageUrl: page.url,
    title: page.title,
  });
  const shouldAuto =
    policyMode === "auto" && !args.dryRun && descCritic.confidence >= CRITIC_AUTO_THRESHOLD;
  const [prop] = await db().insert(seoProposals).values({
    findingId,
    siteId: args.siteId,
    kind: "meta_description",
    status: "pending",
    autoApply: shouldAuto,
    payload: { page_url: page.url, before: page.metaDescription, after: proposal.description },
    rationale: descCritic.issues.length > 0
      ? `Description rewrite. Critic notes: ${descCritic.issues.slice(0, 2).join("; ")}`
      : `Description rewritten to 140-160 chars, lead with customer benefit, end with verb CTA.`,
    model: proposal.model,
    inputTokens: proposal.inputTokens,
    outputTokens: proposal.outputTokens,
    cacheReadTokens: proposal.cacheReadTokens,
    criticConfidence: descCritic.confidence,
    criticIssues: descCritic.issues,
  }).returning({ id: seoProposals.id });
  if (!prop) return;
  counters.proposalsGenerated += 1;
  if (!shouldAuto) return;
  await applyProposalToPlugin(args, prop.id, "meta_description", { page_url: page.url, description: proposal.description }, counters);
}

async function runSchemaProposal(
  args: SiteContext,
  auditId: string,
  findingId: string,
  page: CrawledPage,
  policyMode: "auto" | "propose" | "off",
  counters: RunCounters,
): Promise<void> {
  let proposal: SchemaProposal;
  try {
    proposal = await proposeSchema({
      pageUrl: page.url,
      pageType: page.pageKind,
      title: page.title,
      h1: page.h1[0] ?? "",
      metaDescription: page.metaDescription,
      bodyExcerpt: page.bodyExcerpt,
      existingSchemaTypes: page.schemaTypes,
      site: {
        name: args.siteName,
        domain: args.siteDomain,
        city: args.siteCity,
        region: args.siteRegion,
      },
    });
  } catch (err) {
    console.error(`[${args.siteSlug}] schema agent error:`, err);
    return;
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
    parentType: "seo_audit",
    parentId: auditId,
    siteId: args.siteId,
    model: proposal.model,
    inputTokens: proposal.inputTokens,
    outputTokens: proposal.outputTokens,
    cacheReadTokens: proposal.cacheReadTokens,
    cacheWriteTokens: proposal.cacheWriteTokens,
    costMicroUsd: micro,
    durationMs: proposal.durationMs,
  });
  counters.costMicroUsd += micro;
  if (!proposal.jsonLd || !proposal.schemaType) return;

  // V1 validation — strict JSON-LD shape + type-specific required fields.
  const schemaVal = validateSchema({ schemaType: proposal.schemaType, jsonLd: proposal.jsonLd });
  const schemaOk = await passesValidation({
    siteId: args.siteId,
    kind: "schema_inject",
    validator: "format",
    result: schemaVal,
    sample: { schema_type: proposal.schemaType, json_ld_bytes: proposal.jsonLd.length, page_url: page.url },
  });
  if (!schemaOk) return;

  // V2 validation — HEAD every URL the schema references. Catches schema
  // blocks that point at 404'd images or moved canonical pages.
  const schemaUrlVal = await validateSchemaUrlsResolve(proposal.jsonLd);
  const schemaUrlOk = await passesValidation({
    siteId: args.siteId,
    kind: "schema_inject",
    validator: "url_check",
    result: schemaUrlVal,
    sample: { schema_type: proposal.schemaType, page_url: page.url },
  });
  if (!schemaUrlOk) return;

  const shouldAuto = policyMode === "auto" && !args.dryRun;
  const [prop] = await db().insert(seoProposals).values({
    findingId,
    siteId: args.siteId,
    kind: "schema_inject",
    status: "pending",
    autoApply: shouldAuto,
    payload: { page_url: page.url, schema_type: proposal.schemaType, json_ld: proposal.jsonLd },
    rationale: `Adding ${proposal.schemaType} JSON-LD; doesn't conflict with existing schema on the page.`,
    model: proposal.model,
    inputTokens: proposal.inputTokens,
    outputTokens: proposal.outputTokens,
    cacheReadTokens: proposal.cacheReadTokens,
  }).returning({ id: seoProposals.id });
  if (!prop) return;
  counters.proposalsGenerated += 1;
  if (!shouldAuto) return;
  await applyProposalToPlugin(args, prop.id, "schema_inject", {
    page_url: page.url,
    schema_type: proposal.schemaType,
    json_ld: proposal.jsonLd,
  }, counters);
}

/**
 * Whether this applied proposal should be sampled into the V5 human
 * review queue. 10% rate, deterministic per proposalId so re-runs of
 * the cron don't oscillate the flag.
 */
function shouldSampleForReview(proposalId: string): boolean {
  let h = 0;
  for (let i = 0; i < proposalId.length; i++) h = ((h << 5) - h + proposalId.charCodeAt(i)) | 0;
  return Math.abs(h) % 10 === 0; // ~10%
}

async function applyProposalToPlugin(
  args: SiteContext,
  proposalId: string,
  kind: "meta_title" | "meta_description" | "schema_inject",
  body: Record<string, unknown>,
  counters: RunCounters,
): Promise<void> {
  try {
    const resp = await callPlugin<{ ok: boolean; error?: string; before?: unknown }>(args.siteId, {
      method: "POST",
      path: "/seo-apply",
      body: { kind, ...body },
    });
    if (resp.ok) {
      const sample = shouldSampleForReview(proposalId);
      await db()
        .update(seoProposals)
        .set({ status: "applied", appliedAt: new Date(), sampleForReview: sample })
        .where(eq(seoProposals.id, proposalId));
      // Capture before-state for V6 rollback when the plugin returned it.
      const snapshotBefore =
        typeof resp.before === "object" && resp.before !== null
          ? (resp.before as Record<string, unknown>)
          : null;
      await db().insert(seoActions).values({
        proposalId, siteId: args.siteId, kind, appliedVia: "auto",
        pluginResponse: resp, snapshotBefore, success: true,
      });
      counters.proposalsApplied += 1;
    } else {
      await db().update(seoProposals).set({ status: "failed", errorMessage: resp.error ?? "plugin returned ok:false" }).where(eq(seoProposals.id, proposalId));
      await db().insert(seoActions).values({
        proposalId, siteId: args.siteId, kind, appliedVia: "auto", pluginResponse: resp, success: false,
        errorMessage: resp.error ?? "plugin returned ok:false",
      });
      counters.proposalsFailed += 1;
    }
  } catch (err) {
    const msg =
      err instanceof WpPluginError
        ? `${err.reason}: ${err.message}`
        : err instanceof WpPluginNotConfiguredError
          ? err.message
          : err instanceof Error
            ? err.message
            : String(err);
    await db().update(seoProposals).set({ status: "failed", errorMessage: msg }).where(eq(seoProposals.id, proposalId));
    await db().insert(seoActions).values({
      proposalId, siteId: args.siteId, kind, appliedVia: "auto", success: false, errorMessage: msg,
    });
    counters.proposalsFailed += 1;
  }
}

// ─────────────────────────────────────────────────────────────────────
// Phase 3 — content quality audit (proposal-only, no auto-apply).
// Detects thin pages, stale pages, missing E-E-A-T signals, then asks
// the agent for a concrete rewrite brief. Briefs land in the inbox for
// the admin to action manually (no auto-rewrite — content has voice).
// ─────────────────────────────────────────────────────────────────────
const THIN_THRESHOLDS: Record<CrawledPage["pageKind"], number> = {
  home: 400,
  service: 500,
  city: 600,
  article: 1000,
  faq: 400,
  contact: 200,
  about: 500,
  unknown: 400,
};

async function runContentQualityForSite(args: SiteContext): Promise<RunCounters> {
  const counters = emptyCounters();
  console.log(`\n[${args.siteSlug}] starting content-quality scan…`);

  const [audit] = await db().insert(seoAudits).values({
    siteId: args.siteId,
    kind: "content_quality",
    status: "running",
    trigger: "cron",
    startedAt: new Date(),
  }).returning({ id: seoAudits.id });
  if (!audit) return counters;

  const urls = await discoverPages(args.siteDomain, { maxPages: 25 });
  const pages: CrawledPage[] = [];
  for (const url of urls) {
    const p = await crawlPage(url);
    if (p) { pages.push(p); counters.pagesCrawled += 1; }
  }
  console.log(`[${args.siteSlug}] crawled ${pages.length} pages for content audit`);

  let findingsCount = 0;
  const now = Date.now();
  const TWELVE_MONTHS_MS = 365 * 24 * 3600_000;

  for (const page of pages) {
    const issues: string[] = [];

    // Thin content.
    const threshold = THIN_THRESHOLDS[page.pageKind] ?? 400;
    if (page.wordCount > 0 && page.wordCount < threshold) {
      issues.push(`Thin content — only ${page.wordCount} words (target ≥ ${threshold} for ${page.pageKind} pages)`);
      await db().insert(seoFindings).values({
        auditId: audit.id,
        siteId: args.siteId,
        severity: "medium",
        code: "thin-content",
        summary: `Only ${page.wordCount} words — target ≥ ${threshold} for ${page.pageKind} pages`,
        url: page.url,
        targetType: "page",
        payload: { wordCount: page.wordCount, threshold, pageKind: page.pageKind },
      });
      findingsCount += 1;
    }

    // Stale content.
    const modified = page.lastModified ? new Date(page.lastModified).getTime() : null;
    if (modified && (now - modified) > TWELVE_MONTHS_MS) {
      const monthsOld = Math.floor((now - modified) / (30 * 24 * 3600_000));
      issues.push(`Last updated ${monthsOld} months ago`);
      await db().insert(seoFindings).values({
        auditId: audit.id,
        siteId: args.siteId,
        severity: "low",
        code: "stale-content",
        summary: `Last updated ${monthsOld} months ago — refresh candidate`,
        url: page.url,
        targetType: "page",
        payload: { lastModified: page.lastModified, monthsOld },
      });
      findingsCount += 1;
    }

    // E-E-A-T signals — only meaningful for article-type pages.
    if (page.pageKind === "article") {
      if (!page.author) {
        issues.push("Article has no visible author");
        await db().insert(seoFindings).values({
          auditId: audit.id,
          siteId: args.siteId,
          severity: "medium",
          code: "missing-author",
          summary: "Article has no visible author byline",
          url: page.url,
          targetType: "page",
          payload: {},
        });
        findingsCount += 1;
      }
      if (!page.hasSources) {
        issues.push("Article cites no external sources");
        await db().insert(seoFindings).values({
          auditId: audit.id,
          siteId: args.siteId,
          severity: "low",
          code: "missing-sources",
          summary: "Article has no external citations / outbound links",
          url: page.url,
          targetType: "page",
          payload: {},
        });
        findingsCount += 1;
      }
    }

    // If any issue flagged, get the agent's rewrite brief.
    if (issues.length === 0) continue;
    const rec = await proposeContentRecommendation({
      pageUrl: page.url,
      pageKind: page.pageKind,
      title: page.title,
      h1: page.h1[0] ?? "",
      metaDescription: page.metaDescription,
      bodyExcerpt: page.bodyExcerpt,
      wordCount: page.wordCount,
      lastModified: page.lastModified,
      publishedAt: page.publishedAt,
      author: page.author,
      hasSources: page.hasSources,
      findings: issues,
    }).catch((err) => {
      console.error(`[${args.siteSlug}] content agent error:`, err);
      return null;
    });
    if (!rec) continue;

    const micro = costMicroUsd({
      model: rec.model,
      inputTokens: rec.inputTokens,
      outputTokens: rec.outputTokens,
      cacheReadTokens: rec.cacheReadTokens,
      cacheWriteTokens: rec.cacheWriteTokens,
    });
    await db().insert(aiUsage).values({
      agent: "seo_scan",
      parentType: "seo_audit",
      parentId: audit.id,
      siteId: args.siteId,
      model: rec.model,
      inputTokens: rec.inputTokens,
      outputTokens: rec.outputTokens,
      cacheReadTokens: rec.cacheReadTokens,
      cacheWriteTokens: rec.cacheWriteTokens,
      costMicroUsd: micro,
      durationMs: rec.durationMs,
    });
    counters.costMicroUsd += micro;

    if (!rec.brief) continue;

    // Insert a proposal. Content rewrites are NEVER auto-apply — these go
    // to the inbox and the admin clicks through to edit manually.
    await db().insert(seoProposals).values({
      siteId: args.siteId,
      kind: "content_rewrite",
      status: "pending",
      autoApply: false,
      payload: {
        page_url: page.url,
        issues,
        brief: rec.brief,
        word_count: page.wordCount,
        page_kind: page.pageKind,
      },
      rationale: rec.brief.length > 200 ? rec.brief.slice(0, 197) + "…" : rec.brief,
      model: rec.model,
      inputTokens: rec.inputTokens,
      outputTokens: rec.outputTokens,
      cacheReadTokens: rec.cacheReadTokens,
    });
    counters.proposalsGenerated += 1;
  }

  await db().update(seoAudits).set({
    status: "completed",
    finishedAt: new Date(),
    findingsCount,
    proposalsCount: counters.proposalsGenerated,
    autoAppliedCount: 0,
  }).where(eq(seoAudits.id, audit.id));

  console.log(
    `[${args.siteSlug}] content done · ${findingsCount} findings · ${counters.proposalsGenerated} briefs queued`,
  );
  return counters;
}

// ─────────────────────────────────────────────────────────────────────
// Phase 4 — competitor teardown (read-only, monthly).
// For each competitor listed in seo_policies.competitors (one URL per
// line), crawl their homepage + 1-2 deep pages, then ask the agent to
// compare against the corresponding pages on our site. Results land as
// seo_findings (severity = info) — no proposals, no auto-apply.
// ─────────────────────────────────────────────────────────────────────
async function runCompetitorForSite(args: SiteContext): Promise<RunCounters> {
  const counters = emptyCounters();
  console.log(`\n[${args.siteSlug}] starting competitor teardown…`);

  const [policy] = await db().select().from(seoPolicies).where(eq(seoPolicies.siteId, args.siteId)).limit(1);
  const competitorList = (policy?.competitors ?? "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => /^https?:\/\//.test(s));
  if (competitorList.length === 0) {
    console.log(`[${args.siteSlug}] no competitors configured (seo_policies.competitors empty) — skipping`);
    return counters;
  }

  const [audit] = await db().insert(seoAudits).values({
    siteId: args.siteId,
    kind: "competitor",
    status: "running",
    trigger: "cron",
    startedAt: new Date(),
  }).returning({ id: seoAudits.id });
  if (!audit) return counters;

  // Crawl our homepage as the comparison baseline.
  const ourHome = `https://${args.siteDomain.replace(/^https?:\/\//, "").replace(/\/$/, "")}/`;
  const ours = await crawlPage(ourHome);
  if (!ours) {
    await db().update(seoAudits).set({ status: "failed", finishedAt: new Date(), errorMessage: "could-not-crawl-our-homepage" }).where(eq(seoAudits.id, audit.id));
    return counters;
  }
  counters.pagesCrawled += 1;

  let findingsCount = 0;
  for (const competitorUrl of competitorList.slice(0, 3)) {
    const comp = await crawlPage(competitorUrl);
    if (!comp) {
      console.warn(`[${args.siteSlug}] could not crawl competitor ${competitorUrl}`);
      continue;
    }
    counters.pagesCrawled += 1;

    const teardown = await proposeCompetitorTeardown({
      ours: {
        url: ours.url,
        title: ours.title,
        h1: ours.h1[0] ?? "",
        h2: ours.h2,
        metaDescription: ours.metaDescription,
        bodyExcerpt: ours.bodyExcerpt,
        wordCount: ours.wordCount,
        schemaTypes: ours.schemaTypes,
      },
      competitor: {
        url: comp.url,
        title: comp.title,
        h1: comp.h1[0] ?? "",
        h2: comp.h2,
        metaDescription: comp.metaDescription,
        bodyExcerpt: comp.bodyExcerpt,
        wordCount: comp.wordCount,
        schemaTypes: comp.schemaTypes,
      },
    }).catch((err) => {
      console.error(`[${args.siteSlug}] competitor agent error:`, err);
      return null;
    });
    if (!teardown) continue;

    const micro = costMicroUsd({
      model: teardown.model,
      inputTokens: teardown.inputTokens,
      outputTokens: teardown.outputTokens,
      cacheReadTokens: teardown.cacheReadTokens,
      cacheWriteTokens: teardown.cacheWriteTokens,
    });
    await db().insert(aiUsage).values({
      agent: "seo_scan",
      parentType: "seo_audit",
      parentId: audit.id,
      siteId: args.siteId,
      model: teardown.model,
      inputTokens: teardown.inputTokens,
      outputTokens: teardown.outputTokens,
      cacheReadTokens: teardown.cacheReadTokens,
      cacheWriteTokens: teardown.cacheWriteTokens,
      costMicroUsd: micro,
      durationMs: teardown.durationMs,
    });
    counters.costMicroUsd += micro;

    if (teardown.skipReason || (teardown.theyDoBetter.length === 0 && teardown.adopt.length === 0)) {
      continue;
    }

    // Validation gap C — critic pass on the teardown before it lands in
    // seo_findings. Catches generic SEO advice, lazy comparisons, and
    // observations that contradict our brand voice.
    const teardownCritic = await criticPass({
      kind: "competitor_teardown",
      siteName: args.siteSlug,
      siteDomain: args.siteDomain,
      competitorUrl,
      ourUrl: ours.url,
      theyDoBetter: teardown.theyDoBetter,
      weDoBetter: teardown.weDoBetter,
      adopt: teardown.adopt,
    });

    // Drop the teardown entirely if confidence is below 50 — the agent's
    // output is too generic / unsupported to be useful. Log to validation
    // failures so we can see how often this fires per site.
    if (teardownCritic.confidence < 50) {
      await db().insert(seoValidationFailures).values({
        siteId: args.siteId,
        kind: "competitor",
        validator: "critic:dropped",
        errors: teardownCritic.issues,
        warnings: [],
        sampleOutput: {
          competitor_url: competitorUrl,
          confidence: teardownCritic.confidence,
        },
        criticConfidence: teardownCritic.confidence,
      });
      continue;
    }

    // Otherwise insert the finding. If the critic flagged issues (50-69),
    // force severity to "info" — the operator should see it but it's not
    // task-worthy. >=70 uses the original severity heuristic.
    const baseSeverity = teardown.adopt.some((a) => a.effort === "small") ? "medium" : "info";
    const severity = teardownCritic.confidence < CRITIC_AUTO_THRESHOLD ? "info" : baseSeverity;

    // Store as a single finding per competitor with the full intel payload.
    await db().insert(seoFindings).values({
      auditId: audit.id,
      siteId: args.siteId,
      severity,
      code: "competitor-teardown",
      summary: `Teardown vs ${new URL(competitorUrl).hostname} — ${teardown.adopt.length} adopt suggestion${teardown.adopt.length === 1 ? "" : "s"}${teardownCritic.confidence < CRITIC_AUTO_THRESHOLD ? ` · critic ${teardownCritic.confidence}` : ""}`,
      url: competitorUrl,
      targetType: "site",
      payload: {
        competitor_url: competitorUrl,
        they_do_better: teardown.theyDoBetter,
        we_do_better: teardown.weDoBetter,
        adopt: teardown.adopt,
        critic_confidence: teardownCritic.confidence,
        critic_issues: teardownCritic.issues,
      },
    });
    findingsCount += 1;
  }

  await db().update(seoAudits).set({
    status: "completed",
    finishedAt: new Date(),
    findingsCount,
    proposalsCount: 0,
    autoAppliedCount: 0,
  }).where(eq(seoAudits.id, audit.id));

  console.log(`[${args.siteSlug}] competitor done · ${findingsCount} teardowns`);
  return counters;
}

// ─────────────────────────────────────────────────────────────────────
// Phase 5 — accessibility audit (deterministic rules, no LLM).
// Runs the same crawl as on_page but pipes the raw HTML through
// scanHtmlForA11y(). Each finding is dropped into seo_findings; no
// proposals/auto-apply yet (most a11y fixes need theme/template edits
// that are riskier than a metadata write).
// ─────────────────────────────────────────────────────────────────────
async function runAccessibilityForSite(args: SiteContext): Promise<RunCounters> {
  const counters = emptyCounters();
  console.log(`\n[${args.siteSlug}] starting accessibility scan…`);

  const [audit] = await db().insert(seoAudits).values({
    siteId: args.siteId,
    kind: "accessibility",
    status: "running",
    trigger: "cron",
    startedAt: new Date(),
  }).returning({ id: seoAudits.id });
  if (!audit) return counters;

  const urls = await discoverPages(args.siteDomain, { maxPages: 25 });
  let totalFindings = 0;
  for (const url of urls) {
    const page = await crawlPage(url);
    if (!page) continue;
    counters.pagesCrawled += 1;
    const a11yFindings = scanHtmlForA11y({ html: page.rawHtml, url: page.url });
    for (const f of a11yFindings) {
      await db().insert(seoFindings).values({
        auditId: audit.id,
        siteId: args.siteId,
        severity: f.severity,
        code: f.code,
        summary: f.summary,
        url: page.url,
        targetType: "page",
        payload: f.detail ?? {},
      });
      totalFindings += 1;
    }
  }

  await db().update(seoAudits).set({
    status: "completed",
    finishedAt: new Date(),
    findingsCount: totalFindings,
    proposalsCount: 0,
    autoAppliedCount: 0,
  }).where(eq(seoAudits.id, audit.id));
  console.log(`[${args.siteSlug}] a11y done · ${totalFindings} findings across ${counters.pagesCrawled} pages`);
  return counters;
}

// ─────────────────────────────────────────────────────────────────────
// Phase 6 — Local SEO, Core Web Vitals, Security. All deterministic.
// ─────────────────────────────────────────────────────────────────────

async function runLocalSeoForSite(args: SiteContext): Promise<RunCounters> {
  const counters = emptyCounters();
  const [audit] = await db().insert(seoAudits).values({
    siteId: args.siteId, kind: "local_seo", status: "running", trigger: "cron", startedAt: new Date(),
  }).returning({ id: seoAudits.id });
  if (!audit) return counters;
  const urls = await discoverPages(args.siteDomain, { maxPages: 15 });
  const naps: Array<{ url: string; nap: ReturnType<typeof extractNap> }> = [];
  for (const url of urls) {
    const page = await crawlPage(url);
    if (!page) continue;
    counters.pagesCrawled += 1;
    naps.push({ url: page.url, nap: extractNap(page.rawHtml) });
  }
  const findings = checkNapConsistency(naps);
  for (const f of findings) {
    await db().insert(seoFindings).values({
      auditId: audit.id, siteId: args.siteId, severity: f.severity, code: f.code,
      summary: f.summary, targetType: "site", payload: f.detail ?? {},
    });
  }
  await db().update(seoAudits).set({
    status: "completed", finishedAt: new Date(),
    findingsCount: findings.length, proposalsCount: 0, autoAppliedCount: 0,
  }).where(eq(seoAudits.id, audit.id));
  console.log(`[${args.siteSlug}] local SEO done · ${findings.length} findings`);
  return counters;
}

async function runCwvForSite(args: SiteContext): Promise<RunCounters> {
  const counters = emptyCounters();
  const [audit] = await db().insert(seoAudits).values({
    siteId: args.siteId, kind: "core_web_vitals", status: "running", trigger: "cron", startedAt: new Date(),
  }).returning({ id: seoAudits.id });
  if (!audit) return counters;
  // CWV is rate-limited & slow — sample 5 pages per site, not all 25.
  const urls = (await discoverPages(args.siteDomain, { maxPages: 5 })).slice(0, 5);
  let findingsCount = 0;
  for (const url of urls) {
    const snap = await fetchCwv(url, "mobile", process.env.PSI_API_KEY || undefined);
    const findings = evaluateCwv(snap);
    counters.pagesCrawled += 1;
    for (const f of findings) {
      await db().insert(seoFindings).values({
        auditId: audit.id, siteId: args.siteId, severity: f.severity, code: f.code,
        summary: `${f.summary} (${new URL(url).pathname})`, url, targetType: "page",
        payload: { ...(f.detail ?? {}), snapshot: snap },
      });
      findingsCount += 1;
    }
  }
  await db().update(seoAudits).set({
    status: "completed", finishedAt: new Date(),
    findingsCount, proposalsCount: 0, autoAppliedCount: 0,
  }).where(eq(seoAudits.id, audit.id));
  console.log(`[${args.siteSlug}] CWV done · ${findingsCount} findings`);
  return counters;
}

async function runSecurityForSite(args: SiteContext): Promise<RunCounters> {
  const counters = emptyCounters();
  const [audit] = await db().insert(seoAudits).values({
    siteId: args.siteId, kind: "security", status: "running", trigger: "cron", startedAt: new Date(),
  }).returning({ id: seoAudits.id });
  if (!audit) return counters;
  const findings = await probeSecurity(args.siteDomain);
  for (const f of findings) {
    await db().insert(seoFindings).values({
      auditId: audit.id, siteId: args.siteId, severity: f.severity, code: f.code,
      summary: f.summary, targetType: "site", payload: f.detail ?? {},
    });
  }
  await db().update(seoAudits).set({
    status: "completed", finishedAt: new Date(),
    findingsCount: findings.length, proposalsCount: 0, autoAppliedCount: 0,
  }).where(eq(seoAudits.id, audit.id));
  console.log(`[${args.siteSlug}] security done · ${findings.length} findings`);
  return counters;
}

// ─────────────────────────────────────────────────────────────────────
// Phase 7 — UI/UX + visual design (proposal-only, NEVER auto-applied).
// Vision-quality without a real screenshot — we feed the hero HTML to
// Opus 4.7 and let it reason about hierarchy/CTA/trust signals from
// the structured markup. The findings land as visual_css proposals
// flagged auto_apply=false explicitly so a misconfigured policy can't
// flip the switch.
// ─────────────────────────────────────────────────────────────────────
async function runUiUxForSite(args: SiteContext): Promise<RunCounters> {
  const counters = emptyCounters();
  const [audit] = await db().insert(seoAudits).values({
    siteId: args.siteId, kind: "ui_ux", status: "running", trigger: "cron", startedAt: new Date(),
  }).returning({ id: seoAudits.id });
  if (!audit) return counters;
  // UI/UX audit is expensive — sample only the home + top 2 pages.
  const urls = (await discoverPages(args.siteDomain, { maxPages: 3 })).slice(0, 3);
  let findingsCount = 0;
  let proposalsCount = 0;
  for (const url of urls) {
    const page = await crawlPage(url);
    if (!page) continue;
    counters.pagesCrawled += 1;
    const heroHtml = extractHeroRegion(page.rawHtml);
    const ctaTexts = extractCtaTexts(heroHtml);
    const rec = await proposeUiUxFindings({
      url: page.url,
      pageKind: page.pageKind,
      heroHtml,
      title: page.title,
      h1: page.h1[0] ?? "",
      ctaTexts,
    }).catch((err) => {
      console.error(`[${args.siteSlug}] ui_ux agent error:`, err);
      return null;
    });
    if (!rec) continue;

    const micro = costMicroUsd({
      model: rec.model,
      inputTokens: rec.inputTokens,
      outputTokens: rec.outputTokens,
      cacheReadTokens: rec.cacheReadTokens,
      cacheWriteTokens: rec.cacheWriteTokens,
    });
    await db().insert(aiUsage).values({
      agent: "seo_scan",
      parentType: "seo_audit",
      parentId: audit.id,
      siteId: args.siteId,
      model: rec.model,
      inputTokens: rec.inputTokens,
      outputTokens: rec.outputTokens,
      cacheReadTokens: rec.cacheReadTokens,
      cacheWriteTokens: rec.cacheWriteTokens,
      costMicroUsd: micro,
      durationMs: rec.durationMs,
    });
    counters.costMicroUsd += micro;
    if (rec.skipReason) continue;

    for (const f of rec.findings) {
      const [finding] = await db().insert(seoFindings).values({
        auditId: audit.id, siteId: args.siteId, severity: f.severity,
        code: `ui-${f.category}`,
        summary: f.observation.slice(0, 240),
        url: page.url, targetType: "page",
        payload: { ...f, hero_score: rec.overallScore },
      }).returning({ id: seoFindings.id });
      findingsCount += 1;
      if (!finding) continue;
      // Always proposal — auto_apply: false hard-coded for visual changes.
      await db().insert(seoProposals).values({
        findingId: finding.id,
        siteId: args.siteId,
        kind: "visual_css",
        status: "pending",
        autoApply: false,        // hard-locked
        payload: {
          page_url: page.url,
          category: f.category,
          observation: f.observation,
          suggestion: f.suggestion,
          hero_score: rec.overallScore,
          ctas_present: ctaTexts,
        },
        rationale: f.suggestion.slice(0, 197),
        model: rec.model,
        inputTokens: rec.inputTokens,
        outputTokens: rec.outputTokens,
        cacheReadTokens: rec.cacheReadTokens,
      });
      proposalsCount += 1;
    }
  }
  await db().update(seoAudits).set({
    status: "completed", finishedAt: new Date(),
    findingsCount, proposalsCount, autoAppliedCount: 0,
  }).where(eq(seoAudits.id, audit.id));
  console.log(`[${args.siteSlug}] ui_ux done · ${findingsCount} findings · ${proposalsCount} proposals queued (manual review)`);
  return counters;
}

async function main(): Promise<void> {
  await ensureSchema();
  const args = parseArgs(process.argv);

  if (!(await isLLMConfigured())) {
    console.error("Anthropic API key is not configured. Set it at /admin/settings.");
    process.exit(1);
  }
  // Warm the client (fail fast if creds are bad).
  await getLLMClient();

  const siteRows = await db().select().from(sites).orderBy(sites.slug);
  const targets = args.siteFilterSlug
    ? siteRows.filter((s) => s.slug === args.siteFilterSlug)
    : siteRows;
  if (targets.length === 0) {
    console.error(args.siteFilterSlug ? `No site with slug=${args.siteFilterSlug}` : "No sites configured.");
    process.exit(1);
  }

  function mergeCounters(target: RunCounters, c: RunCounters): void {
    target.pagesCrawled += c.pagesCrawled;
    target.imagesScanned += c.imagesScanned;
    target.imagesMissingAlt += c.imagesMissingAlt;
    target.proposalsGenerated += c.proposalsGenerated;
    target.proposalsApplied += c.proposalsApplied;
    target.proposalsFailed += c.proposalsFailed;
    target.costMicroUsd += c.costMicroUsd;
  }

  const totals = emptyCounters();
  for (const site of targets) {
    const ctx: SiteContext = {
      siteId: site.id,
      siteSlug: site.slug,
      siteName: site.name,
      siteDomain: site.domain,
      siteCity: site.city,
      siteRegion: site.region,
      dryRun: args.dryRun,
      kind: args.kind,
    };
    try {
      if (args.kind === "alt_text" || args.kind === "all") {
        mergeCounters(totals, await runForSite(ctx));
      }
      if (args.kind === "on_page" || args.kind === "all") {
        mergeCounters(totals, await runOnPageForSite(ctx));
      }
      if (args.kind === "content_quality" || args.kind === "all") {
        mergeCounters(totals, await runContentQualityForSite(ctx));
      }
      if (args.kind === "competitor" || args.kind === "all") {
        mergeCounters(totals, await runCompetitorForSite(ctx));
      }
      if (args.kind === "accessibility" || args.kind === "all") {
        mergeCounters(totals, await runAccessibilityForSite(ctx));
      }
      if (args.kind === "local_seo" || args.kind === "all") {
        mergeCounters(totals, await runLocalSeoForSite(ctx));
      }
      if (args.kind === "core_web_vitals" || args.kind === "all") {
        mergeCounters(totals, await runCwvForSite(ctx));
      }
      if (args.kind === "security" || args.kind === "all") {
        mergeCounters(totals, await runSecurityForSite(ctx));
      }
      if (args.kind === "ui_ux" || args.kind === "all") {
        mergeCounters(totals, await runUiUxForSite(ctx));
      }
    } catch (err) {
      console.error(`[${site.slug}] fatal:`, err);
    }
  }

  console.log(
    `\nTotals · ${targets.length} site(s) · ${totals.pagesCrawled} pages · ${totals.imagesMissingAlt} missing alt · ${totals.proposalsApplied} applied · ${totals.proposalsFailed} failed · cost $${(totals.costMicroUsd / 1_000_000).toFixed(4)}`,
  );
}

main().catch((err) => {
  console.error("seo:scan crashed:", err);
  process.exit(1);
});
