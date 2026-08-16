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
};

export function buildPromptForKind(kind: string, input: Record<string, any>): string {
  const template = TEMPLATES[kind];
  if (template) return template.buildPrompt(input);
  if (input.prompt) return input.prompt;
  return `Process the following task:\nKind: ${kind}\nInput: ${JSON.stringify(input, null, 2)}`;
}
