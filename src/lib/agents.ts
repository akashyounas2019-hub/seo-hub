import { FileText, Link2, Settings2, Search, ShieldCheck } from "lucide-react";

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
    id: "research",
    title: "Researcher",
    tag: "Intelligence & Trends",
    icon: Search,
    accent: "from-emerald-400 to-teal-500",
    subs: [
      { name: "Keyword Miner", desc: "Volume, difficulty, intent" },
      { name: "SERP Analyst", desc: "Competitor SERP dissection" },
      { name: "Trend Watcher", desc: "Emerging query patterns" },
      { name: "Audience Profiler", desc: "Persona & intent mapping" },
    ],
  },
  {
    id: "auditor",
    title: "Auditor",
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
];

export const DEFAULT_SKILLS: Record<string, string> = {
  onpage: "SEO copywriting, on-page optimization, schema markup, keyword targeting, content structuring",
  offpage: "Link building, digital PR, outreach, brand mentions, disavow management",
  technical: "Core Web Vitals, crawl budget, log analysis, JS rendering, indexation",
  research: "Keyword research, SERP analysis, competitor intelligence, trend detection",
  auditor: "Site auditing, E-E-A-T review, compliance, executive reporting",
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

export type AgentProfile = {
  skills: string;
  tasks: Task[];
  settings: AgentSettings;
  extraSubs?: Sub[];
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

export function getDefaultProfile(id: string): AgentProfile {
  return {
    skills: DEFAULT_SKILLS[id] ?? "",
    tasks: [],
    settings: { ...DEFAULT_SETTINGS },
  };
}
