"use server";

import { desc, eq } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { claudeJobs } from "@/db/schema";
import { requireAdmin } from "@/lib/server-auth";

export type CloudSeoAnalysisType =
  | "full-audit"
  | "page-analysis"
  | "technical"
  | "content"
  | "content-brief"
  | "schema"
  | "local-seo"
  | "images"
  | "competitor"
  | "sitemap"
  | "backlinks"
  | "cluster"
  | "hreflang"
  | "seo-plan"
  | "programmatic"
  | "geo"
  | "sxo"
  | "drift";

const ANALYSIS_TITLES: Record<CloudSeoAnalysisType, string> = {
  "full-audit": "Full SEO Audit",
  "page-analysis": "Single Page Analysis",
  "technical": "Technical SEO Audit",
  "content": "Content & E-E-A-T Analysis",
  "content-brief": "Content Brief Generator",
  "schema": "Schema & Structured Data",
  "local-seo": "Local SEO Analysis",
  "images": "Image SEO Audit",
  "competitor": "Competitor Analysis",
  "sitemap": "Sitemap Analysis",
  "backlinks": "Backlink Profile Analysis",
  "cluster": "Keyword Clustering",
  "hreflang": "Hreflang & International SEO",
  "seo-plan": "SEO Strategy Plan",
  "programmatic": "Programmatic SEO",
  "geo": "AI & GEO Visibility",
  "sxo": "Search Experience (SXO)",
  "drift": "SEO Drift Monitor",
};

const ANALYSIS_PROMPTS: Record<CloudSeoAnalysisType, { system: string; userPrefix: string }> = {
  "full-audit": {
    system: `You are an expert SEO auditor. Perform a comprehensive SEO audit of the given URL covering:
1. Technical SEO (crawlability, indexability, security headers, URL structure, mobile optimization, Core Web Vitals, structured data, JS rendering)
2. Content Quality (E-E-A-T assessment, readability, thin content, duplicate content)
3. On-Page SEO (title tags, meta descriptions, heading structure, internal linking)
4. Schema & Structured Data (current implementation, validation, missing opportunities)
5. Performance (LCP, INP, CLS estimates based on page structure)
6. Images (alt text, sizing, format)
7. AI Search Readiness (citability, structural improvements, authority signals)

Score each category out of 100. Provide an overall SEO Health Score (0-100) using these weights: Technical 22%, Content 23%, On-Page 20%, Schema 10%, Performance 10%, AI Readiness 10%, Images 5%.

Structure your output with: Executive Summary, Category Scores table, Critical Issues, High Priority, Medium Priority, Low Priority, and a phased Action Plan.`,
    userPrefix: "Perform a full SEO audit of this URL:",
  },
  "page-analysis": {
    system: `You are an expert SEO analyst. Analyze the given URL for on-page SEO factors:
- Title tag (length 50-60 chars, keyword placement, uniqueness)
- Meta description (length 150-160 chars, call-to-action, keyword inclusion)
- H1 tag (single H1, keyword inclusion, matches search intent)
- Heading hierarchy (H1→H6 logical nesting)
- Content quality (word count, readability, keyword density, E-E-A-T signals)
- Internal links (count, anchor text relevance, link equity distribution)
- Image optimization (alt text, file names, dimensions, lazy loading)
- URL structure (clean, descriptive, keyword inclusion)
- Schema markup (present types, validation status)

Provide specific, actionable recommendations with priority levels. Include "What's Working Well" and "What Needs Improvement" sections.`,
    userPrefix: "Analyze this page for on-page SEO factors:",
  },
  "technical": {
    system: `You are a technical SEO specialist. Audit the given URL across 9 categories:
1. Crawlability — robots.txt, XML sitemap, noindex tags, crawl depth, JS rendering, AI crawler management
2. Indexability — canonical tags, duplicate content, thin pages, pagination, hreflang, index bloat
3. Security — HTTPS enforcement, SSL validity, mixed content, security headers (CSP, HSTS, X-Frame-Options)
4. URL Structure — clean URLs, hierarchy, redirect chains, URL length, trailing slash consistency
5. Mobile Optimization — viewport meta, responsive CSS, touch targets, font size, no horizontal scroll
6. Core Web Vitals — LCP (<2.5s), INP (<200ms), CLS (<0.1)
7. Structured Data — JSON-LD detection, validation against Google's types
8. JavaScript Rendering — CSR vs SSR, SPA framework issues
9. IndexNow — protocol support for Bing/Yandex/Naver

Score each category. Provide a Technical Score out of 100.`,
    userPrefix: "Perform a technical SEO audit of this URL:",
  },
  "content": {
    system: `You are a content quality and E-E-A-T specialist. Analyze the given URL using Google's "Who / How / Why" test and the full E-E-A-T framework:

**E-E-A-T Framework:**
- Experience: original research, case studies, personal anecdotes, unique data
- Expertise: author credentials, professional background, technical depth
- Authoritativeness: site reputation, backlink profile, industry recognition
- Trustworthiness: factual accuracy, transparency, editorial policy

Also assess: readability, thin content risks, AI citation readiness, content freshness, and topical depth.
Provide scores for each E-E-A-T dimension and specific improvement recommendations.`,
    userPrefix: "Analyze the content quality and E-E-A-T signals of this URL:",
  },
  "content-brief": {
    system: `You are an expert content strategist. Generate a comprehensive content brief including:
- Target keyword and secondary keywords
- Search intent analysis
- Recommended word count range
- Content structure (H1, H2, H3 outline)
- Key topics and subtopics to cover
- Questions to answer (People Also Ask style)
- E-E-A-T requirements
- Internal linking recommendations
- Schema markup recommendations
- Competitor content gaps to exploit
- Unique angle / differentiator suggestions

Make the brief actionable — a writer should be able to produce high-ranking content from this brief alone.`,
    userPrefix: "Generate a content brief for:",
  },
  "schema": {
    system: `You are a structured data specialist. Analyze the given URL for schema markup:

**Detection:** Identify all existing JSON-LD, Microdata, and RDFa markup.
**Validation:** Check each schema type against Google's supported types and requirements.
**Recommendations:** Based on the page type, recommend missing schema types with ready-to-use JSON-LD.

Generate ready-to-use JSON-LD for each recommended type. Validate all generated markup.`,
    userPrefix: "Analyze schema markup and structured data for this URL:",
  },
  "local-seo": {
    system: `You are a local SEO specialist. Analyze the given URL for local search optimization:
- Business Type Detection
- Google Business Profile Signals
- NAP Consistency
- Local Schema completeness
- Review Signals
- Local Content quality
- Citation Health
- Industry-Specific Factors

Score key areas and provide a Local SEO Score out of 100.`,
    userPrefix: "Perform a local SEO analysis of this URL:",
  },
  "images": {
    system: `You are an image SEO specialist. Audit all images on the given URL for:
- Alt Text quality
- File Names (descriptive vs generic)
- File Format (WebP/AVIF/SVG/PNG)
- File Size optimization
- Dimensions and responsive images
- Lazy Loading
- CDN & Caching
Provide a prioritized fix list with estimated performance impact.`,
    userPrefix: "Audit images for SEO optimization on this URL:",
  },
  "competitor": {
    system: `You are an SEO competitive intelligence analyst. Analyze the given competitor URL:
- Content Strategy assessment
- Technical Edge comparison
- Keyword Gaps identification
- Backlink Indicators
- SERP Features presence
- Content Gaps to exploit
- Strengths to Match and Weaknesses to Exploit
Provide an actionable competitive strategy with priority-ranked recommendations.`,
    userPrefix: "Analyze this competitor URL for SEO competitive intelligence:",
  },
  "sitemap": {
    system: `You are a sitemap and site architecture specialist. Analyze:
- Sitemap Detection (robots.txt, /sitemap.xml, common paths)
- Structure Analysis (index sitemaps, URL counts)
- Quality Gates (200 status, no redirects, no noindex, proper lastmod)
- Coverage assessment
Provide structural improvements and segmentation strategy recommendations.`,
    userPrefix: "Analyze the sitemap structure and quality of this URL:",
  },
  "backlinks": {
    system: `You are a backlink analysis specialist. Analyze the given URL's backlink profile:
- Domain Authority Signals
- Referring Domain Analysis
- Anchor Text Distribution
- Link Quality Indicators
- Content That Attracts Links
- Link Building Opportunities (guest posting, resource pages, broken link building, digital PR)
Provide a link building strategy prioritized by impact and effort.`,
    userPrefix: "Analyze the backlink profile and link building opportunities for this URL:",
  },
  "cluster": {
    system: `You are a semantic keyword clustering specialist. Create:
- Topic Clusters (semantic groupings)
- Pillar-Cluster Model (pillar pages + cluster content)
- Search Intent Mapping
- Cannibalization Detection
- Priority Matrix (volume, competition, relevance, effort)
- Implementation Roadmap
Present clusters in a clear hierarchical structure with recommended URL slugs.`,
    userPrefix: "Create keyword clusters and a topical map for:",
  },
  "hreflang": {
    system: `You are an international SEO and hreflang specialist. Audit for:
- Hreflang Detection (HTML head, HTTP headers, XML sitemaps)
- Validation (self-referencing, return tags, ISO codes, x-default)
- Implementation Method assessment
- Common Errors detection
- Content Localization quality
Provide a complete hreflang implementation guide if tags are missing.`,
    userPrefix: "Audit hreflang and international SEO implementation for this URL:",
  },
  "seo-plan": {
    system: `You are an SEO strategist. Create a comprehensive 90-day SEO plan:

**Phase 1 (Days 1-30):** Technical fixes, on-page optimization, schema implementation
**Phase 2 (Days 31-60):** Content creation, link building, local SEO
**Phase 3 (Days 61-90):** Topic clusters, SERP features, AI search optimization

Include KPIs, monthly milestones, priority levels, estimated effort, and expected impact.`,
    userPrefix: "Create a 90-day SEO strategy plan for:",
  },
  "programmatic": {
    system: `You are a programmatic SEO specialist. Analyze for:
- Current Programmatic Pages detection
- Template Quality Assessment
- Opportunity Analysis (data sources, modifier patterns)
- Quality Safeguards (thin content, canonical strategy, indexation control)
Provide implementation recommendations for template structure and data enrichment.`,
    userPrefix: "Analyze programmatic SEO opportunities for:",
  },
  "geo": {
    system: `You are an AI visibility and GEO specialist. Analyze for:
- AI Crawler Access (robots.txt rules for GPTBot, ClaudeBot, etc.)
- Citability Assessment (quotable statements, structured data)
- Brand Mention Signals
- AI Overview Optimization
- GEO Strategy (content types for AI responses, citation links)
Provide a GEO readiness score (0-100) and specific optimization recommendations.`,
    userPrefix: "Analyze AI search visibility and GEO readiness for:",
  },
  "sxo": {
    system: `You are a Search Experience Optimization (SXO) specialist. Analyze for:
- Search-to-Page Alignment
- User Journey Analysis
- Page-Type Alignment
- Engagement Signals
- Persona Scoring (first-time visitor, returning customer, researcher, ready-to-buy)
Provide an SXO score (0-100) and prioritized UX-SEO improvements.`,
    userPrefix: "Analyze search experience optimization (SXO) for:",
  },
  "drift": {
    system: `You are an SEO drift monitoring specialist. Analyze for:
- Content Freshness (last modified, staleness, outdated info, broken links)
- Technical Drift (new issues, plugin/CMS impacts, speed degradation)
- Competitive Drift (landscape shifts, new competitors, SERP changes)
- Content Gap Drift (new topics, emerging trends)
- Monitoring Recommendations (key metrics, alert thresholds, re-audit schedule)
Provide a Drift Risk Score (Low/Medium/High/Critical) with specific evidence.`,
    userPrefix: "Analyze SEO drift and monitoring needs for:",
  },
};

export interface CloudSeoJobResult {
  ok: true;
  jobId: string;
  status: string;
  title: string;
  markdown: string | null;
  error: string | null;
  createdAt: string;
  durationMs: number | null;
}

export interface CloudSeoError {
  ok: false;
  error: string;
}

/**
 * Enqueue a Cloud SEO analysis for the AKS Mac worker to run.
 *
 * The row lands in `claude_jobs` as `pending` with `preferWorker: "mac"` and
 * a pre-baked prompt in `input.prompt`. The Mac worker polls `/api/claude-jobs/
 * claim` every 30s, claims the row, runs the prompt through Claude Code (the
 * subscription, no per-token API cost), and posts the markdown back via
 * `/api/claude-jobs/:id/complete`. The browser's 5s poller then renders it.
 *
 * We deliberately don't block the queue on a worker liveness check — the
 * previous heuristic (any recently-claimed job) had a chicken-and-egg on
 * fresh installs. If no worker is running the job simply sits in `pending`
 * and the UI can show that state honestly.
 */
export async function queueCloudSeoJob(
  formData: FormData,
): Promise<{ ok: true; jobId: string } | CloudSeoError> {
  await ensureSchema();
  const me = await requireAdmin();

  const url = String(formData.get("url") ?? "").trim();
  const analysisType = String(formData.get("analysisType") ?? "") as CloudSeoAnalysisType;
  const extraContext = String(formData.get("extraContext") ?? "").trim();

  if (!url) return { ok: false, error: "URL is required" };
  if (!ANALYSIS_PROMPTS[analysisType]) return { ok: false, error: "Invalid analysis type" };

  const config = ANALYSIS_PROMPTS[analysisType];
  const title = ANALYSIS_TITLES[analysisType];

  const userMessage = extraContext
    ? `${config.userPrefix} ${url}\n\nAdditional context: ${extraContext}`
    : `${config.userPrefix} ${url}`;

  const prompt = `${config.system}\n\n---\n\n${userMessage}`;

  const [job] = await db()
    .insert(claudeJobs)
    .values({
      kind: `cloud-seo:${analysisType}`,
      title: `Cloud SEO · ${title} · ${url}`,
      // input.prompt is what the claim endpoint will hand to the worker when
      // there is no server-side template for `cloud-seo:*` kinds.
      input: { analysisType, url, extraContext: extraContext || undefined, prompt },
      status: "pending",
      priority: "high",
      preferWorker: "mac",
      triggerSource: "cloud-seo",
      createdBy: me.id,
    })
    .returning({ id: claudeJobs.id });

  return { ok: true, jobId: job.id };
}

export async function getCloudSeoJob(
  jobId: string,
): Promise<CloudSeoJobResult | CloudSeoError> {
  await ensureSchema();
  await requireAdmin();

  const [row] = await db()
    .select({
      id: claudeJobs.id,
      status: claudeJobs.status,
      title: claudeJobs.title,
      outputMarkdown: claudeJobs.outputMarkdown,
      error: claudeJobs.error,
      createdAt: claudeJobs.createdAt,
      durationMs: claudeJobs.durationMs,
    })
    .from(claudeJobs)
    .where(eq(claudeJobs.id, jobId))
    .limit(1);

  if (!row) return { ok: false, error: "Job not found" };

  return {
    ok: true,
    jobId: row.id,
    status: row.status,
    title: row.title,
    markdown: row.outputMarkdown,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
    durationMs: row.durationMs,
  };
}

export async function getLatestCloudSeoJob(
  analysisType: CloudSeoAnalysisType,
): Promise<CloudSeoJobResult | null> {
  await ensureSchema();
  await requireAdmin();

  const kind = `cloud-seo:${analysisType}`;
  const [row] = await db()
    .select({
      id: claudeJobs.id,
      status: claudeJobs.status,
      title: claudeJobs.title,
      outputMarkdown: claudeJobs.outputMarkdown,
      error: claudeJobs.error,
      createdAt: claudeJobs.createdAt,
      durationMs: claudeJobs.durationMs,
    })
    .from(claudeJobs)
    .where(eq(claudeJobs.kind, kind))
    .orderBy(desc(claudeJobs.createdAt))
    .limit(1);

  if (!row) return null;

  return {
    ok: true,
    jobId: row.id,
    status: row.status,
    title: row.title,
    markdown: row.outputMarkdown,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
    durationMs: row.durationMs,
  };
}
