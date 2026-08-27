import {
  Gauge,
  FileSearch,
  Cpu,
  BookOpen,
  Braces,
  MapPinned,
  Image as ImageIcon,
  Target,
  Map,
  Link2,
  Layers,
  Languages,
  Compass,
  Boxes,
  Sparkles,
  MousePointerClick,
  Activity,
  type LucideIcon,
} from "lucide-react";

export type SeoToolCategory =
  | "audit"
  | "content"
  | "technical"
  | "authority"
  | "local"
  | "intelligence";

export type SeoTool = {
  id: string;
  title: string;
  tagline: string;
  description: string;
  icon: LucideIcon;
  category: SeoToolCategory;
  accent: string; // gradient tailwind classes
  runtime: string; // avg runtime label
  output: string; // output format
  inputs: { label: string; placeholder: string; type?: "url" | "text" | "textarea" }[];
  // When true, this tool's prompt (job-templates.ts) also asks the model for
  // a trailing JSON task list, and api.jobs.$id.complete.ts extracts it and
  // runs it through the same approval-rules pipeline the orchestrator uses
  // (kanban_tasks, status "pending_approval" or auto-approved). Most tools
  // are report-only by design; this is opt-in per tool so a tool built to
  // answer "what should we do next" (Strategy Plan) can actually reach
  // Approvals, without every audit/analysis tool spamming the queue.
  producesTasks?: boolean;
};

export const SEO_CATEGORIES: Record<SeoToolCategory, { label: string; hint: string }> = {
  audit: { label: "Audit & Health", hint: "End-to-end SEO diagnostics" },
  content: { label: "Content & E-E-A-T", hint: "On-page & editorial quality" },
  technical: { label: "Technical", hint: "Crawl, schema & performance" },
  authority: { label: "Authority", hint: "Links, competitors & SERP" },
  local: { label: "Local SEO", hint: "GBP, citations & Dubai geo-signals" },
  intelligence: { label: "AI / GEO", hint: "Generative search & strategy" },
};

export const SEO_TOOLS: SeoTool[] = [
  {
    id: "full-audit",
    title: "Full SEO Audit",
    tagline: "Comprehensive site scorecard",
    description:
      "End-to-end audit covering technical, on-page, content, and authority signals. Returns a prioritised action plan.",
    icon: Gauge,
    category: "audit",
    accent: "from-cyan-400 to-blue-500",
    runtime: "~90s",
    output: "Markdown report",
    inputs: [{ label: "Site URL", placeholder: "https://example.ae", type: "url" }],
  },
  {
    id: "page-analysis",
    title: "Page Analysis",
    tagline: "Deep-dive on a single URL",
    description:
      "Analyse a specific page for keyword targeting, on-page structure, internal links, and conversion signals.",
    icon: FileSearch,
    category: "audit",
    accent: "from-sky-400 to-indigo-500",
    runtime: "~40s",
    output: "Markdown + fixes",
    inputs: [
      { label: "Page URL", placeholder: "https://example.ae/villa-cleaning", type: "url" },
      { label: "Target keyword", placeholder: "villa deep cleaning dubai" },
    ],
  },
  {
    id: "technical-seo",
    title: "Technical SEO",
    tagline: "Crawl, index & Core Web Vitals",
    description:
      "Crawl health, indexation, canonicalisation, robots, sitemap parity, and Core Web Vitals diagnostics.",
    icon: Cpu,
    category: "technical",
    accent: "from-violet-400 to-fuchsia-500",
    runtime: "~2m",
    output: "Issue list + severity",
    inputs: [{ label: "Site URL", placeholder: "https://example.ae", type: "url" }],
  },
  {
    id: "content-eeat",
    title: "Content & E-E-A-T",
    tagline: "Editorial quality & trust",
    description:
      "Grade Experience, Expertise, Authoritativeness, and Trust signals against Dubai cleaning-services intent.",
    icon: BookOpen,
    category: "content",
    accent: "from-emerald-400 to-teal-500",
    runtime: "~60s",
    output: "Rubric + rewrites",
    inputs: [{ label: "Page URL", placeholder: "https://example.ae/blog/post", type: "url" }],
  },
  {
    id: "schema",
    title: "Schema Generator",
    tagline: "JSON-LD structured data",
    description:
      "Generate LocalBusiness, Service, FAQ, Review, and Breadcrumb JSON-LD tuned for UAE local pack.",
    icon: Braces,
    category: "technical",
    accent: "from-amber-400 to-orange-500",
    runtime: "~15s",
    output: "JSON-LD blocks",
    inputs: [
      { label: "Page URL", placeholder: "https://example.ae/services", type: "url" },
      { label: "Schema types", placeholder: "LocalBusiness, Service, FAQPage" },
    ],
  },
  {
    id: "local-seo",
    title: "Local SEO",
    tagline: "GBP, NAP & Dubai citations",
    description:
      "Audit Google Business Profile, citation consistency, review velocity, and neighbourhood-level ranking.",
    icon: MapPinned,
    category: "local",
    accent: "from-rose-400 to-pink-500",
    runtime: "~50s",
    output: "Signal matrix",
    inputs: [
      { label: "Business name", placeholder: "AKS Cleaning" },
      { label: "City / area", placeholder: "Dubai Marina" },
    ],
  },
  {
    id: "image-seo",
    title: "Image SEO",
    tagline: "Alt text, weight, next-gen",
    description:
      "Audit image weight, formats, dimensions, alt text, and lazy-loading across the target page.",
    icon: ImageIcon,
    category: "technical",
    accent: "from-cyan-400 to-emerald-400",
    runtime: "~25s",
    output: "Image list + suggestions",
    inputs: [{ label: "Page URL", placeholder: "https://example.ae", type: "url" }],
  },
  {
    id: "competitor",
    title: "Competitor Analysis",
    tagline: "SERP rivals & content gaps",
    description:
      "Compare against top-ranking Dubai cleaning brands: content depth, backlinks, on-page, and SERP features.",
    icon: Target,
    category: "authority",
    accent: "from-fuchsia-400 to-pink-500",
    runtime: "~80s",
    output: "Gap report",
    inputs: [
      { label: "Your domain", placeholder: "example.ae", type: "url" },
      { label: "Competitor domains", placeholder: "competitor1.ae, competitor2.ae" },
    ],
  },
  {
    id: "sitemap",
    title: "Sitemap Auditor",
    tagline: "Parity & discoverability",
    description:
      "Compare sitemap.xml against the live crawl graph, spot orphans, redirects, and stale URLs.",
    icon: Map,
    category: "technical",
    accent: "from-blue-400 to-cyan-400",
    runtime: "~45s",
    output: "URL diff",
    inputs: [{ label: "Sitemap URL", placeholder: "https://example.ae/sitemap.xml", type: "url" }],
  },
  {
    id: "backlinks",
    title: "Backlink Explorer",
    tagline: "Referring domains & anchors",
    description:
      "Explore referring domains, anchor distribution, follow/nofollow ratio, and toxicity flags.",
    icon: Link2,
    category: "authority",
    accent: "from-indigo-400 to-blue-500",
    runtime: "~60s",
    output: "Link table",
    inputs: [{ label: "Domain", placeholder: "example.ae", type: "url" }],
  },
  {
    id: "keyword-cluster",
    title: "Keyword Clustering",
    tagline: "Intent-grouped topic maps",
    description:
      "Cluster keywords by SERP overlap and intent to design a coherent topic architecture.",
    icon: Layers,
    category: "content",
    accent: "from-teal-400 to-cyan-500",
    runtime: "~35s",
    output: "Cluster tree",
    inputs: [{ label: "Seed keywords", placeholder: "villa cleaning, deep cleaning…", type: "textarea" }],
  },
  {
    id: "hreflang",
    title: "Hreflang Validator",
    tagline: "EN ↔ AR pairing check",
    description:
      "Validate hreflang pairs across the site, spot orphans, self-references, and mismatched canonicals.",
    icon: Languages,
    category: "technical",
    accent: "from-emerald-400 to-lime-500",
    runtime: "~30s",
    output: "Pair matrix",
    inputs: [{ label: "Site URL", placeholder: "https://example.ae", type: "url" }],
  },
  {
    id: "strategy-plan",
    title: "Strategy Plan",
    tagline: "90-day SEO roadmap",
    description:
      "Generate a prioritised 90-day roadmap: pillars, publishing cadence, technical fixes, and link plays.",
    icon: Compass,
    category: "intelligence",
    accent: "from-cyan-400 to-blue-500",
    runtime: "~70s",
    output: "Roadmap doc",
    inputs: [
      { label: "Domain", placeholder: "example.ae", type: "url" },
      { label: "Primary market", placeholder: "Dubai / UAE" },
    ],
    producesTasks: true,
  },
  {
    id: "programmatic",
    title: "Programmatic SEO",
    tagline: "Template × dataset pages",
    description:
      "Blueprint programmatic page templates using service × neighbourhood matrices for Dubai coverage.",
    icon: Boxes,
    category: "intelligence",
    accent: "from-violet-400 to-indigo-500",
    runtime: "~55s",
    output: "Template plan",
    inputs: [
      { label: "Service dimension", placeholder: "sofa cleaning, carpet cleaning…", type: "textarea" },
      { label: "Location dimension", placeholder: "Marina, JLT, Downtown…", type: "textarea" },
    ],
  },
  {
    id: "ai-geo",
    title: "AI / GEO Visibility",
    tagline: "ChatGPT & Perplexity mentions",
    description:
      "Track brand and page visibility inside generative engines (ChatGPT, Perplexity, Gemini, Claude).",
    icon: Sparkles,
    category: "intelligence",
    accent: "from-pink-400 to-fuchsia-500",
    runtime: "~50s",
    output: "Mention matrix",
    inputs: [
      { label: "Brand or domain", placeholder: "AKS Cleaning" },
      { label: "Prompts to probe", placeholder: "best villa cleaning dubai…", type: "textarea" },
    ],
  },
  {
    id: "sxo",
    title: "SXO Optimiser",
    tagline: "Search × UX alignment",
    description:
      "Score a landing page for search-experience alignment: intent match, above-fold, CTA clarity, trust.",
    icon: MousePointerClick,
    category: "content",
    accent: "from-orange-400 to-rose-500",
    runtime: "~40s",
    output: "UX rubric",
    inputs: [{ label: "Landing page URL", placeholder: "https://example.ae/deep-clean", type: "url" }],
  },
  {
    id: "drift",
    title: "SERP Drift",
    tagline: "Weekly ranking movement",
    description:
      "Detect keyword drift, cannibalisation, and volatility across your tracked keyword universe.",
    icon: Activity,
    category: "audit",
    accent: "from-blue-400 to-violet-500",
    runtime: "~35s",
    output: "Drift chart",
    inputs: [{ label: "Domain", placeholder: "example.ae", type: "url" }],
  },
];

export function getSeoTool(id: string): SeoTool | undefined {
  return SEO_TOOLS.find((t) => t.id === id);
}
