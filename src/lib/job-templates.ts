export interface JobTemplate {
  kind: string;
  label: string;
  description: string;
  buildPrompt(input: Record<string, any>): string;
}

export const TEMPLATES: Record<string, JobTemplate> = {
  "seo:technical-audit": {
    kind: "seo:technical-audit",
    label: "Technical SEO Audit",
    description: "Full crawl & technical diagnostic report for a target URL",
    buildPrompt(input) {
      return `You are an expert Technical SEO Auditor for high-growth websites.
Perform a comprehensive technical SEO evaluation for the following target:
- Target URL: ${input.url || "https://akscleaning.ae"}
- Audit Scope: ${input.scope || "Full Deep Audit"}

Please provide a detailed, executive-ready Markdown report with:
1. Executive Summary & Health Score (0-100)
2. Crawlability & Indexation Analysis (Robots.txt, Canonical tags, Sitemaps)
3. Core Web Vitals Optimization Checklist (LCP, INP, CLS)
4. Structured Data / JSON-LD Recommendations (LocalBusiness, Service schemas)
5. Prioritized Action Items (Critical vs High vs Medium priority fixes)`;
    },
  },

  "content:blog-post": {
    kind: "content:blog-post",
    label: "SEO Blog Post Generator",
    description: "Long-form localized blog article optimized for target keyword",
    buildPrompt(input) {
      return `You are an elite SEO Content Strategist and Copywriter.
Draft a comprehensive, search-intent-optimized blog article:
- Topic: ${input.topic || "Villa Deep Cleaning in Dubai"}
- Primary Keyword: ${input.keyword || "deep cleaning villa dubai"}
- Target Niche: ${input.niche || "Cleaning Services"}
- Target Location: ${input.city || "Dubai, UAE"}
- Word Count: ${input.wordCount || 1500} words

Requirements:
- Engage readers immediately with a strong Hook & Value Proposition
- Structured H2 & H3 heading hierarchy with natural keyword insertion
- Include localized tips relevant to UAE climate, dust control, and villa maintenance
- Add an FAQ section with schema-ready Q&A pairs
- Conclude with a strong CTA to book professional service`;
    },
  },

  "local:schema-gen": {
    kind: "local:schema-gen",
    label: "Local Schema JSON-LD Generator",
    description: "Generate valid LocalBusiness & Service JSON-LD schema",
    buildPrompt(input) {
      return `Generate comprehensive, valid JSON-LD structured data for a local service business:
- Business Name: ${input.name || "AKS Cleaning Services"}
- Location: ${input.address || "Dubai Marina, Dubai, UAE"}
- Service Areas: ${input.areas || "Dubai Marina, JLT, Downtown Dubai, Business Bay, JVC"}
- Phone / Contact: ${input.phone || "+971 4 000 0000"}

Return the complete, production-ready \`<script type="application/ld+json">\` code block followed by an explanation of where to embed it.`;
    },
  },

  "research:keyword-miner": {
    kind: "research:keyword-miner",
    label: "Keyword Intent Miner",
    description: "Mine high-intent UAE search queries and content clusters",
    buildPrompt(input) {
      return `You are a Senior Keyword Researcher specializing in Middle East & UAE local search.
Analyze and cluster search terms for:
- Core Topic: ${input.topic || "Commercial & Residential Cleaning Dubai"}
- Region: ${input.region || "UAE (Dubai / Abu Dhabi)"}

Provide a structured Markdown breakdown:
1. High-Intent Commercial Keywords (Booking & Quote intent)
2. Informational & FAQ Queries for Blog Strategy
3. Hyper-Local Suburb Keywords (JLT, Downtown, Palm Jumeirah, Business Bay)
4. Seasonality Spikes (Ramadan, Summer, Move-in / Move-out trends)`;
    },
  },

  "assistant:chat": {
    kind: "assistant:chat",
    label: "AKS Assistant Chat Response",
    description: "Generates an intelligent agent response for user query",
    buildPrompt(input) {
      return `You are the Leader Bot of the AKS SEO Agent Fleet.
User query: ${input.message}
History: ${JSON.stringify(input.history || [])}`;
    },
  },

  "knowledge:structure-from-crawl": {
    kind: "knowledge:structure-from-crawl",
    label: "Structure Knowledge Base from Crawled Pages",
    description: "Extracts services, FAQs, contact info, and brand voice from scraped page text into the site's Knowledge Base schema",
    buildPrompt(input) {
      const pages = (input.pages || []) as Array<{ url: string; title: string; text: string }>;
      const pageBlocks = pages
        .map((p) => `--- PAGE: ${p.url} ---\nTITLE: ${p.title}\n${p.text}`)
        .join("\n\n");

      return `You are extracting structured business facts from a website's own pages so an SEO agent fleet can be grounded in accurate, real information.

CRAWLED PAGE CONTENT (source of truth — use ONLY facts present here):
${pageBlocks}

TASK: Return a SINGLE valid JSON object (no markdown fences, no commentary, no explanation — just the raw JSON) matching exactly this shape:

{
  "businessProfile": {
    "businessName": string | omit,
    "niche": string | omit,
    "phone": string | omit,
    "whatsapp": string | omit,
    "address": string | omit,
    "workingHours": string | omit,
    "tradeLicense": string | omit,
    "establishedYear": string | omit
  },
  "services": [
    { "id": string, "name": string, "category": string | omit, "description": string | omit, "priceAed": string | omit, "turnaround": string | omit, "keywords": string[] | omit, "features": string[] | omit }
  ],
  "brandTone": {
    "tone": string | omit,
    "usps": string[] | omit,
    "rulesDos": string[] | omit,
    "rulesDonts": string[] | omit,
    "targetPersonas": string[] | omit
  },
  "faqs": [
    { "id": string, "category": string | omit, "question": string, "answer": string }
  ],
  "policies": [
    { "id": string, "title": string, "description": string }
  ]
}

CRITICAL RULES:
- Only include facts you can actually find in the crawled page content above. Do NOT invent prices, phone numbers, addresses, or services that are not stated in the text.
- If a field genuinely isn't present anywhere in the crawled pages, omit that key entirely rather than guessing or leaving a placeholder.
- Generate short unique "id" values for each services/faqs/policies array item (e.g. "s1", "s2", "f1").
- Prices: only set "priceAed" if an actual price appears in the text; do not convert currencies or estimate.
- Output raw JSON only — the response will be parsed directly with JSON.parse().`;
    },
  },
  "seo:orchestrator-review": {
    kind: "seo:orchestrator-review",
    label: "Head of SEO — Orchestrator Review",
    description: "Reads live GSC + GA4 deltas and the site's Knowledge Base, returns prioritized, approval-gated task recommendations",
    buildPrompt(input) {
      const gsc = input.gscSummary || null;
      const ga = input.gaSummary || null;
      const topQueries = (input.topQueries || []) as Array<{ keys: string[]; clicks: number; impressions: number; ctr: number; position: number }>;
      const categoryHint = input.businessCategoryHint ? `\nBUSINESS VERTICAL GUIDANCE: ${input.businessCategoryHint}` : "";

      const gscBlock = gsc
        ? `Search Console (last ${gsc.daysCount ?? "?"} days): ${gsc.clicks ?? 0} clicks, ${gsc.impressions ?? 0} impressions, ${gsc.ctr ?? 0}% CTR, avg position ${gsc.position ?? "—"}.`
        : "Search Console: not connected for this site — do not fabricate search metrics.";

      const gaBlock = ga
        ? `Google Analytics 4 (same window): ${JSON.stringify(ga)}`
        : "Google Analytics 4: not connected for this site — do not fabricate traffic metrics.";

      const queryBlock = topQueries.length
        ? topQueries.slice(0, 15).map((q) => `- "${q.keys?.[0] || ""}" — ${q.clicks} clicks, ${q.impressions} impressions, pos ${q.position?.toFixed?.(1) ?? q.position}`).join("\n")
        : "No query-level data available.";

      return `You are the Head of SEO for a local-business SEO agency, reviewing this client site's real performance data to decide what work should happen next. You are NOT executing any task yourself — you are triaging and prioritizing work for a human owner and a Head of Department to approve.

SITE: ${input.siteName || input.domain || "Unknown site"} (${input.domain || ""})${categoryHint}

LIVE PERFORMANCE DATA (source of truth — ground every recommendation in this, never invent numbers):
${gscBlock}
${gaBlock}

TOP SEARCH QUERIES:
${queryBlock}

TASK: Based ONLY on the data above and the site's Knowledge Base context (provided separately), identify concrete, actionable SEO tasks this site needs right now. For each task, assess real priority based on potential impact (declining rankings, high-impression/low-CTR queries, missing technical fundamentals, content gaps) — do not pad the list with filler tasks just to have output.

Return a SINGLE valid JSON object (no markdown fences, no commentary before or after — just the raw JSON) matching exactly this shape:

{
  "tasks": [
    {
      "title": string,
      "description": string,
      "category": one of "technical" | "content" | "local" | "schema" | "strategy" | "other",
      "priority": one of "low" | "medium" | "high" | "critical",
      "assignee": string (a plausible SEO specialist role, e.g. "Technical SEO Expert", "Content Strategist", "Local SEO Specialist"),
      "reasoning": string (1-2 sentences citing the specific data point that justifies this task)
    }
  ],
  "summary": string (2-3 sentence executive summary of the site's current state and what this review found)
}

CRITICAL RULES:
- Only recommend tasks justified by the actual data provided. If data is sparse (e.g. not connected), say so in "summary" and recommend fewer, more foundational tasks rather than inventing detail.
- Return 3-10 tasks — quality over quantity.
- Output raw JSON only — the response will be parsed directly with JSON.parse().`;
    },
  },
};

import { compileFullKnowledge } from "./ai-knowledge";
import { getSeoTool } from "./seo-tools";

/**
 * Builds the prompt for any of the 17 SEO Suite tools (job kind
 * "seo-suite:<toolId>"). One generic, business-category-aware prompt
 * construction path instead of 17 hand-copied templates -- each tool's own
 * title/description/category from seo-tools.ts keeps the instructions
 * specific, and api.seo-suite.run.ts layers real free-API data (PageSpeed
 * Insights, GSC/GA4, robots.txt/sitemap, Google Business Profile) into
 * `input` for the four deep-build tools before this ever runs.
 */
function buildSeoSuitePrompt(toolId: string, input: Record<string, any>): string {
  const tool = getSeoTool(toolId);
  const toolLabel = input.toolTitle || tool?.title || toolId;
  const inputsBlock = Object.entries(input.inputs || {})
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n") || "(no additional inputs provided by the user)";

  const categoryHint = input.businessCategoryHint ? `\nBUSINESS VERTICAL GUIDANCE: ${input.businessCategoryHint}` : "";
  const siteBlock = input.siteName || input.domain
    ? `SITE: ${input.siteName || ""} ${input.domain ? `(${input.domain})` : ""}`.trim()
    : "SITE: not specified — use the inputs below as the target.";

  const dataBlocks: string[] = [];

  if (input.pageSpeed) {
    const p = input.pageSpeed;
    dataBlocks.push(
      `PAGESPEED INSIGHTS (real, live — mobile):\n` +
        `- Performance: ${p.performanceScore ?? "—"}/100, SEO: ${p.seoScore ?? "—"}/100, Accessibility: ${p.accessibilityScore ?? "—"}/100, Best Practices: ${p.bestPracticesScore ?? "—"}/100\n` +
        `- Core Web Vitals: LCP ${p.lcpMs ?? "—"}ms, CLS ${p.clsScore ?? "—"}, INP ${p.inpMs ?? "—"}ms, FCP ${p.fcpMs ?? "—"}ms, TTFB ${p.ttfbMs ?? "—"}ms`,
    );
  } else if (input.pageSpeedError) {
    dataBlocks.push(`PAGESPEED INSIGHTS: fetch failed (${input.pageSpeedError}) — do not fabricate performance numbers.`);
  }

  if (input.gscSummary) {
    const g = input.gscSummary;
    dataBlocks.push(`SEARCH CONSOLE (real, last 30 days): ${g.clicks} clicks, ${g.impressions} impressions, ${g.ctr}% CTR, avg position ${g.position}.`);
  }
  if (input.gaSummary) {
    dataBlocks.push(`GOOGLE ANALYTICS 4 (real, last 30 days): ${JSON.stringify(input.gaSummary)}`);
  }
  if (input.robotsTxt !== undefined) {
    dataBlocks.push(
      `ROBOTS.TXT (real, live${input.robotsStatus && input.robotsStatus !== 200 ? `, HTTP ${input.robotsStatus}` : ""}):\n${input.robotsTxt ? "```\n" + input.robotsTxt + "\n```" : "Not found / unreachable."}`,
    );
  }
  if (input.sitemapXml !== undefined) {
    dataBlocks.push(
      `SITEMAP.XML (real, live${input.sitemapStatus && input.sitemapStatus !== 200 ? `, HTTP ${input.sitemapStatus}` : ""}):\n${input.sitemapXml ? "```xml\n" + input.sitemapXml + "\n```" : "Not found / unreachable."}`,
    );
  }
  if (input.gbpAccounts || input.gbpLocations) {
    dataBlocks.push(`GOOGLE BUSINESS PROFILE (real, live):\nAccounts: ${JSON.stringify(input.gbpAccounts || [])}\nLocations: ${JSON.stringify(input.gbpLocations || [])}`);
  } else if (input.gbpError) {
    dataBlocks.push(`GOOGLE BUSINESS PROFILE: fetch failed (${input.gbpError}) — do not fabricate GBP data; note it's not connected instead.`);
  }

  const dataSection = dataBlocks.length
    ? `\nLIVE DATA (source of truth — ground your analysis in this, never invent numbers or content that isn't here or in the Knowledge Base):\n${dataBlocks.join("\n\n")}\n`
    : "";

  // Most SEO Suite tools are report-only by design (their output shows in
  // the tool page's report pane and stops there). A tool marked
  // producesTasks: true (currently just Strategy Plan) additionally asks
  // for a trailing JSON task block -- api.jobs.$id.complete.ts extracts it
  // with the same extractJson() the orchestrator uses and runs it through
  // the same approval-rules pipeline into kanban_tasks. This is how a
  // "what should we do next" tool actually reaches Approvals instead of
  // just producing a document nothing downstream ever reads.
  const taskInstruction = tool?.producesTasks
    ? `\n\nAFTER the Markdown report, on a new line, append a fenced block starting with `
      + "\`\`\`tasks"
      + ` containing a SINGLE valid JSON object (no other text inside the fence) matching exactly this shape:

{
  "tasks": [
    {
      "title": string,
      "description": string,
      "category": one of "technical" | "content" | "local" | "schema" | "strategy" | "other",
      "priority": one of "low" | "medium" | "high" | "critical",
      "assignee": string (a plausible SEO specialist role, e.g. "Technical SEO Expert", "Content Strategist"),
      "reasoning": string (1-2 sentences citing the specific plan item that justifies this task)
    }
  ]
}

Only include tasks that are concrete, actionable next steps drawn directly from the report above -- not a restatement of every roadmap bullet. Return 3-10 tasks. If the report genuinely has nothing actionable yet (e.g. data was too sparse), return {"tasks": []} rather than inventing filler.`
    : "";

  return `You are an expert SEO specialist running the "${toolLabel}" tool${tool ? ` (${tool.description})` : ""} for a local-business SEO agency's client.

${siteBlock}${categoryHint}

USER-PROVIDED INPUTS:
${inputsBlock}
${dataSection}
TASK: Produce a thorough, executive-ready Markdown report for this tool. Ground every specific claim in the live data and Knowledge Base context provided above/below — if a data source is missing or not connected, say so explicitly rather than inventing numbers, scores, or findings. Structure the report with clear headings, a prioritized action list (Critical/High/Medium), and concrete next steps a local-business owner could actually act on.${taskInstruction}`;
}

export function buildPromptForKind(kind: string, input: Record<string, any>): string {
  let basePrompt = "";
  const template = TEMPLATES[kind];
  if (template) {
    basePrompt = template.buildPrompt(input);
  } else if (kind.startsWith("seo-suite:")) {
    basePrompt = buildSeoSuitePrompt(kind.slice("seo-suite:".length), input);
  } else if (input.prompt) {
    basePrompt = input.prompt;
  } else {
    basePrompt = `Process the following task:\nKind: ${kind}\nInput: ${JSON.stringify(input, null, 2)}`;
  }

  // Prepend rich website project Knowledge Base context if available
  let kbSection = "";
  if (input.knowledgeContext) {
    kbSection = input.knowledgeContext;
  } else if (input.siteKb || input.structuredKb || input.plainTextKb) {
    kbSection = compileFullKnowledge({
      siteName: input.siteName || input.domain || "Target Website",
      city: input.city || input.location,
      plainTextKb: input.plainTextKb || input.siteKb,
      structuredKb: input.structuredKb,
    });
  }

  if (kbSection) {
    return `================================================================================
WEBSITE KNOWLEDGE BASE & GROUNDING SPECIFICATIONS:
================================================================================
${kbSection}

================================================================================
AGENT TASK INSTRUCTIONS:
================================================================================
${basePrompt}`;
  }

  return basePrompt;
}

