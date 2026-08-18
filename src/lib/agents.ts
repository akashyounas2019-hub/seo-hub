import { FileText, Link2, Settings2, Search, ShieldCheck, Sparkles, Globe } from "lucide-react";

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
  onpage: "SEO copywriting, on-page optimization, schema markup, keyword targeting, content structuring",
  offpage: "Link building, digital PR, outreach, brand mentions, disavow management",
  technical: "Core Web Vitals, crawl budget, log analysis, JS rendering, indexation",
  auditor: "Site auditing, E-E-A-T review, compliance, executive reporting, keyword research, SERP analytics, trend detection, audience profiling",
  geo: "Generative Engine Optimization (GEO), AI Overviews, Perplexity citation engineering, entity grounding",
  international: "Geo-grid heatmaps, Google Business Profile review sentiment automation, hreflang validation, En/Ar localization",
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
  model: "gpt-4o",
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
  const { parentId } = parseAgentId(id);
  const nowIso = new Date().toISOString();
  return {
    skills: DEFAULT_SKILLS[id] ?? "",
    tasks: [],
    settings: { ...DEFAULT_SETTINGS },
    memory: SEED_MEMORY[parentId] ?? "",
    notes: [],
    logs: [
      { id: "seed-1", ts: nowIso, kind: "system", message: "Agent initialized · memory seeded from playbook." },
    ],
  };
}
