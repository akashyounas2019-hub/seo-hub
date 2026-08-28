import { FileText, Link2, Settings2, Crown, ShieldCheck, Sparkles, Globe, Target } from "lucide-react";

export type Sub = { name: string; desc: string };
export type Expert = {
  id: string;
  title: string;
  tag: string;
  icon: typeof FileText;
  accent: string;
  subs: Sub[];
};

export const EXPERTS: Expert[] = [
  {
    id: "leader",
    title: "SEO Team Leader",
    tag: "Orchestrator · oversees all 7 experts",
    icon: Crown,
    accent: "from-yellow-400 to-amber-500",
    // The Team Leader doesn't have its own sub-agent roster the way the 6
    // specialist experts do -- its real function is the orchestrator
    // (seo:orchestrator-review job kind, api.orchestrator.run.ts), which
    // reviews live site data and delegates work across the other 6 experts.
    // No fabricated sub-agents here.
    subs: [],
  },
  {
    id: "onpage",
    title: "On-Page Expert",
    tag: "Content & Structure",
    icon: FileText,
    accent: "from-cyan-400 to-sky-500",
    subs: [
      { name: "Meta Optimizer", desc: "Titles, descriptions, OG tags" },
      { name: "Content Strategist", desc: "Topical maps & briefs" },
      { name: "Internal Linker", desc: "Anchor & silo planning" },
      { name: "Schema Writer", desc: "JSON-LD structured data" },
    ],
  },
  {
    id: "offpage",
    title: "Off-Page Expert",
    tag: "Authority & Signals",
    icon: Link2,
    accent: "from-violet-400 to-fuchsia-500",
    subs: [
      { name: "Backlink Prospector", desc: "Link opportunity discovery" },
      { name: "Outreach Agent", desc: "Personalized pitches" },
      { name: "Digital PR", desc: "Brand mentions & citations" },
      { name: "Disavow Manager", desc: "Toxic link cleanup" },
    ],
  },
  {
    id: "technical",
    title: "Technical SEO Expert",
    tag: "Crawl & Performance",
    icon: Settings2,
    accent: "from-amber-400 to-orange-500",
    subs: [
      { name: "Crawl Analyst", desc: "Robots, sitemaps, indexation" },
      { name: "Core Web Vitals", desc: "LCP, INP, CLS tuning" },
      { name: "Rendering Bot", desc: "JS SEO & hydration checks" },
      { name: "Log File Parser", desc: "Bot behavior insights" },
    ],
  },
  {
    id: "auditor",
    title: "Quality Auditor",
    tag: "Quality & Compliance",
    icon: ShieldCheck,
    accent: "from-rose-400 to-pink-500",
    subs: [
      { name: "Site Auditor", desc: "Full-site health scan" },
      { name: "Content QA", desc: "E-E-A-T & accuracy checks" },
      { name: "Compliance Bot", desc: "Guidelines & policy review" },
      { name: "Report Generator", desc: "Exec-ready summaries" },
    ],
  },
  // Split out of the old 8-sub "Quality Auditor" -- keyword/market research
  // has almost nothing to do with quality/compliance auditing, and no other
  // expert in this roster mixes two unrelated skill domains under one
  // title. Same 4 sub-agents that used to live under "auditor", now under
  // their own coherent parent.
  {
    id: "research",
    title: "Research & Intelligence Expert",
    tag: "Keyword & Market Research",
    icon: Target,
    accent: "from-indigo-400 to-purple-500",
    subs: [
      { name: "Keyword Miner", desc: "Volume, difficulty, intent" },
      { name: "SERP Analytics Analyst", desc: "Competitor SERP dissection & analytics" },
      { name: "Trend Breacher", desc: "Emerging query patterns & trend detection" },
      { name: "Audience Profiler", desc: "Persona & intent mapping" },
    ],
  },
  {
    id: "geo",
    title: "GEO / AI Search Expert",
    tag: "AI & Synthesized SERPs",
    icon: Sparkles,
    accent: "from-cyan-400 to-indigo-500",
    subs: [
      { name: "AI Citation Optimizer", desc: "Perplexity, ChatGPT & Gemini AI Overview tuning" },
      { name: "LLM Entity Grounding", desc: "Knowledge graph & entity consistency" },
      { name: "Prompt Presence Tracker", desc: "Brand visibility in generative search prompts" },
    ],
  },
  {
    id: "international",
    title: "International & Local Expert",
    tag: "Geo & Multi-lingual",
    icon: Globe,
    accent: "from-teal-400 to-emerald-500",
    subs: [
      { name: "Review Sentiment Responder", desc: "Automated GBP review responses" },
      { name: "Geo-Grid Map Tracker", desc: "5x5 local ranking heatmap monitoring" },
      { name: "Hreflang Validator", desc: "Cross-border tag & indexation checks" },
      { name: "Regional Localization Bot", desc: "En / Ar dialect & regional optimization" },
    ],
  },
];

export const DEFAULT_SKILLS: Record<string, string> = {
  leader: "Live GSC/GA4 + Knowledge Base review, task prioritization, delegation across the 7 specialist experts, approval-gated recommendations",
  onpage: "SEO copywriting & meta optimization, topical content structuring, internal linking architecture, JSON-LD schema authoring",
  offpage: "Link building, digital PR, outreach, brand mentions, disavow management",
  technical: "Core Web Vitals, crawl budget, log analysis, JS rendering, indexation",
  auditor: "Site auditing, E-E-A-T review, compliance review, executive reporting",
  research: "Keyword research, SERP analytics, trend detection, audience profiling",
  geo: "Generative Engine Optimization (GEO), AI Overviews, Perplexity citation engineering, entity grounding",
  international: "Geo-grid heatmaps, Google Business Profile review sentiment automation, hreflang validation, En/Ar localization",
};

// Real, per-sub-agent skill strings -- keyed by the full sub-agent id
// (buildSubAgentId(parentId, subName), e.g. "onpage__meta-optimizer").
// Previously every sub-agent had NO skill string of its own: getDefaultProfile()
// looked up DEFAULT_SKILLS[id] using the full sub-agent id, which never
// matched any key (DEFAULT_SKILLS only has parent ids) and fell through to
// "" -- every one of the 27 sub-agent profile pages showed a genuinely
// blank skill set, not an inherited one. Each entry below is specific to
// what that one sub-agent's name/desc actually describes, not a copy of
// its siblings'.
export const SUB_AGENT_SKILLS: Record<string, string> = {
  // On-Page Expert
  "onpage__meta-optimizer": "Title tag & meta description writing, Open Graph / Twitter Card tags, SERP snippet CTR optimization",
  "onpage__content-strategist": "Topical map planning, content brief authoring, search-intent alignment, content gap analysis",
  "onpage__internal-linker": "Anchor text planning, topic silo architecture, orphan page discovery, link equity distribution",
  "onpage__schema-writer": "JSON-LD authoring (LocalBusiness, Service, FAQPage, Product), rich-result eligibility validation",

  // Off-Page Expert
  "offpage__backlink-prospector": "Referring-domain discovery, competitor backlink gap analysis, link opportunity qualification",
  "offpage__outreach-agent": "Personalized pitch drafting, outreach sequencing, response tracking",
  "offpage__digital-pr": "Brand mention monitoring, unlinked-mention reclamation, press/citation building",
  "offpage__disavow-manager": "Toxic link identification, disavow file management, link-risk scoring",

  // Technical SEO Expert
  "technical__crawl-analyst": "Robots.txt auditing, XML sitemap validation, crawl-budget analysis, indexation status tracking",
  "technical__core-web-vitals": "LCP/INP/CLS diagnostics, PageSpeed Insights interpretation, render-blocking resource identification",
  "technical__rendering-bot": "JS-rendered content SEO, hydration timing checks, client vs. server rendering diffs",
  "technical__log-file-parser": "Server log analysis, bot crawl-pattern detection, crawl-frequency anomaly flagging",

  // Quality Auditor
  "auditor__site-auditor": "Full-site technical + content health scans, prioritized issue lists",
  "auditor__content-qa": "E-E-A-T verification, factual accuracy checks, author-bio and citation validation",
  "auditor__compliance-bot": "Search engine guideline adherence, YMYL/regulatory compliance review",
  "auditor__report-generator": "Executive-ready report synthesis, findings summarization, stakeholder-facing formatting",

  // Research & Intelligence Expert
  "research__keyword-miner": "Search volume/difficulty analysis, keyword clustering, intent classification",
  "research__serp-analytics-analyst": "SERP feature dissection, competitor ranking analysis, SERP volatility tracking",
  "research__trend-breacher": "Emerging query pattern detection, seasonal demand forecasting, trend-to-content mapping",
  "research__audience-profiler": "Persona construction, search-intent segmentation, audience-need mapping",

  // GEO / AI Search Expert
  "geo__ai-citation-optimizer": "ChatGPT/Perplexity/Gemini AI Overview citation tuning, source-authority signaling for LLM retrieval",
  "geo__llm-entity-grounding": "Knowledge-graph entity consistency, sameAs linking, structured entity disambiguation",
  "geo__prompt-presence-tracker": "Brand visibility tracking across generative-search prompts, share-of-voice measurement",

  // International & Local Expert
  "international__review-sentiment-responder": "Automated Google Business Profile review response drafting, sentiment-aware tone matching",
  "international__geo-grid-map-tracker": "5x5 local ranking heatmap generation, geo-grid rank-tracking analysis",
  "international__hreflang-validator": "Hreflang tag validation, cross-border canonical/indexation conflict detection",
  "international__regional-localization-bot": "En/Ar dialect adaptation, regional terminology and cultural localization",
};

export type Task = {
  id: string;
  title: string;
  assignee: string;
  due: string;
  status: "pending" | "done";
  priority?: "low" | "medium" | "high";
};

export type AgentSettings = {
  status: "active" | "paused";
  priority: "low" | "medium" | "high";
  model: string;
  notifyOnComplete: boolean;
  autonomy: number; // 0-100
  notes: string;
};

export const DEFAULT_SETTINGS: AgentSettings = {
  status: "active",
  priority: "medium",
  model: "aks-worker",
  notifyOnComplete: true,
  autonomy: 60,
  notes: "",
};

export type LogEntry = {
  id: string;
  ts: string; // ISO
  kind: "task" | "system" | "memory" | "assignment";
  message: string;
};

export type MemoryNote = {
  id: string;
  ts: string;
  text: string;
  pinned?: boolean;
  tag?: "guideline" | "preference" | "constraint" | "context" | "fact";
};

export type AgentProfile = {
  skills: string;
  tasks: Task[];
  settings: AgentSettings;
  extraSubs?: Sub[];
  memory: string;
  notes: MemoryNote[];
  memories?: MemoryNote[];
  logs: LogEntry[];
};

export function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function parseAgentId(id: string): { parentId: string; subSlug?: string } {
  const [parentId, subSlug] = id.split("__");
  return { parentId, subSlug };
}

export function buildSubAgentId(parentId: string, subName: string) {
  return `${parentId}__${slugify(subName)}`;
}

export function resolveAgent(id: string):
  | { kind: "expert"; expert: Expert; subs: Sub[] }
  | { kind: "sub"; expert: Expert; sub: Sub; subs: Sub[] }
  | null {
  const { parentId, subSlug } = parseAgentId(id);
  const expert = EXPERTS.find((e) => e.id === parentId);
  if (!expert) return null;
  const profiles = loadProfiles();
  const extras = profiles[parentId]?.extraSubs ?? [];
  const subs = [...expert.subs, ...extras];
  if (!subSlug) return { kind: "expert", expert, subs };
  const sub = subs.find((s) => slugify(s.name) === subSlug);
  if (!sub) return null;
  return { kind: "sub", expert, sub, subs };
}

export type ProfileState = Record<string, AgentProfile>;

export const STORAGE_KEY = "aks-agent-profiles-v1";

export function loadProfiles(): ProfileState {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

export function saveProfiles(profiles: ProfileState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
  } catch {}
}

const SEED_MEMORY: Record<string, string> = {
  onpage: "Prefer entity-first briefs. Client tone: pragmatic, Dubai-market. Cluster around service + area.",
  offpage: "Only pursue UAE-relevant DR40+ referrers. Never buy links. Ramadan blackout: Mar 1–10.",
  technical: "LCP budget = 2.0s. Origin behind Cloudflare. Log parsing runs nightly at 02:00 GST.",
  research: "Track Arabic + English variants. Persona focus: property managers, HR admins.",
  auditor: "E-E-A-T = author bios + sameAs + real-world case studies. Zero tolerance for AI-only pages.",
  geo: "Optimize for Gemini AI Overviews & Perplexity citations. Maintain verified Wikidata & Schema grounding.",
  international: "Ensure 100% hreflang symmetry across En / Ar landing pages. Sweep 5x5 geo-grids weekly.",
};

export function getDefaultProfile(id: string): AgentProfile {
  const { parentId, subSlug } = parseAgentId(id);
  const nowIso = new Date().toISOString();
  // Sub-agents get their own real skill string (SUB_AGENT_SKILLS); parent
  // agents (and the id === parentId case, i.e. no subSlug) use DEFAULT_SKILLS.
  // A custom sub-agent added via "Add sub-agent" (not in the static roster)
  // has no entry in either map -- falls through to "" honestly rather than
  // inventing placeholder skills for a role nobody has described yet.
  const skills = subSlug ? (SUB_AGENT_SKILLS[id] ?? "") : (DEFAULT_SKILLS[id] ?? "");
  return {
    skills,
    tasks: [],
    settings: { ...DEFAULT_SETTINGS },
    memory: SEED_MEMORY[parentId] ?? "",
    notes: [],
    logs: [
      { id: "seed-1", ts: nowIso, kind: "system", message: "Agent initialized · memory seeded from playbook." },
    ],
  };
}
