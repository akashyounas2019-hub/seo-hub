import {
  Search,
  Palette,
  PenSquare,
  FileSearch,
  Radar,
  Wrench,
  MapPin,
  BarChart3,
  type LucideIcon,
} from "lucide-react";

export type TeamMember = {
  id: string;
  name: string;
  role: string;
  bio: string;
  icon: LucideIcon;
  accent: string;
  status: "Online" | "Working" | "Reviewing" | "Offline";
  location: string;
  focus: string[];
  metrics: { label: string; value: string }[];
  tasksAccepted: string[];
};

export const TEAM: TeamMember[] = [
  {
    id: "iris-vale",
    name: "Iris Vale",
    role: "Research Agent",
    bio: "Keyword clusters · SERP snapshots · competitor watch · Dubai cleaning trends",
    icon: Search,
    accent: "from-cyan-400 to-sky-500",
    status: "Working",
    location: "Dubai HQ",
    focus: ["Keyword Research", "Content Brief", "Custom Task"],
    metrics: [
      { label: "Runs / wk", value: "48" },
      { label: "Avg. runtime", value: "3m 12s" },
      { label: "Success", value: "98.4%" },
    ],
    tasksAccepted: ["Keyword Research", "Content Brief", "Custom Task"],
  },
  {
    id: "idris-hale",
    name: "Idris Hale",
    role: "Website Designer",
    bio: "Layout · visual systems · imagery · restrained motion",
    icon: Palette,
    accent: "from-pink-400 to-rose-500",
    status: "Reviewing",
    location: "Remote · Berlin",
    focus: ["Custom Task"],
    metrics: [
      { label: "Prototypes", value: "12" },
      { label: "Ship rate", value: "92%" },
      { label: "A/B lift", value: "+7.4%" },
    ],
    tasksAccepted: ["Custom Task"],
  },
  {
    id: "silas-iyer",
    name: "Silas Iyer",
    role: "Content Writer",
    bio: "Long-form editorial · landing copy · EN/AR mirroring · voice",
    icon: PenSquare,
    accent: "from-violet-400 to-fuchsia-500",
    status: "Working",
    location: "Dubai HQ",
    focus: ["Blog Writing", "Content Brief", "Custom Task"],
    metrics: [
      { label: "Drafts / wk", value: "9" },
      { label: "Avg. words", value: "1,640" },
      { label: "Editor score", value: "4.6 / 5" },
    ],
    tasksAccepted: ["Blog Writing", "Content Brief", "Custom Task"],
  },
  {
    id: "kaveh-noor",
    name: "Kaveh Noor",
    role: "On-Page Expert",
    bio: "Dubai cleaning · titles · meta · H1s · schema · neighbourhood pages · EN/AR hreflang",
    icon: FileSearch,
    accent: "from-amber-400 to-orange-500",
    status: "Online",
    location: "Remote · Cairo",
    focus: ["Meta Rewrite", "Schema", "Custom Task"],
    metrics: [
      { label: "Pages / wk", value: "62" },
      { label: "CTR lift", value: "+18%" },
      { label: "Schema pass", value: "100%" },
    ],
    tasksAccepted: ["Meta Rewrite", "Schema Injection", "Custom Task"],
  },
  {
    id: "leila-farsi",
    name: "Leila Farsi",
    role: "Local SEO Specialist",
    bio: "GBP · citations · UAE directories · Arabic map pack",
    icon: MapPin,
    accent: "from-emerald-400 to-teal-500",
    status: "Working",
    location: "Dubai HQ",
    focus: ["GBP Post", "Citation Cleanup", "Custom Task"],
    metrics: [
      { label: "Profiles", value: "4" },
      { label: "Reviews / wk", value: "38" },
      { label: "Top-3 share", value: "62%" },
    ],
    tasksAccepted: ["GBP Post", "Citation Cleanup", "Custom Task"],
  },
  {
    id: "omar-rashid",
    name: "Omar Rashid",
    role: "Technical Auditor",
    bio: "Crawl budget · Core Web Vitals · schema linting · Lighthouse runs",
    icon: Wrench,
    accent: "from-rose-400 to-red-500",
    status: "Online",
    location: "Remote · Amman",
    focus: ["Site Audit", "Speed Fix", "Custom Task"],
    metrics: [
      { label: "Audits / mo", value: "18" },
      { label: "LCP median", value: "2.1s" },
      { label: "Fix rate", value: "88%" },
    ],
    tasksAccepted: ["Site Audit", "Speed Fix", "Custom Task"],
  },
  {
    id: "nadia-hakim",
    name: "Nadia Hakim",
    role: "SERP Watcher",
    bio: "Rank tracking · SERP feature diffs · volatility · alerts",
    icon: Radar,
    accent: "from-indigo-400 to-blue-500",
    status: "Online",
    location: "Dubai HQ",
    focus: ["Rank Snapshot", "SERP Diff", "Custom Task"],
    metrics: [
      { label: "KWs watched", value: "612" },
      { label: "Alerts / wk", value: "24" },
      { label: "Volatility", value: "3.2" },
    ],
    tasksAccepted: ["Rank Snapshot", "SERP Diff", "Custom Task"],
  },
  {
    id: "yara-mahdavi",
    name: "Yara Mahdavi",
    role: "Reporting Analyst",
    bio: "Executive reports · client dashboards · attribution · KPI narratives",
    icon: BarChart3,
    accent: "from-slate-300 to-slate-500",
    status: "Reviewing",
    location: "Remote · Beirut",
    focus: ["Weekly Report", "Client Deck", "Custom Task"],
    metrics: [
      { label: "Reports / mo", value: "22" },
      { label: "On-time", value: "100%" },
      { label: "NPS", value: "72" },
    ],
    tasksAccepted: ["Weekly Report", "Client Deck", "Custom Task"],
  },
];

export const teamStats = () => {
  const total = TEAM.length;
  const working = TEAM.filter((t) => t.status === "Working").length;
  const reviewing = TEAM.filter((t) => t.status === "Reviewing").length;
  const offline = TEAM.filter((t) => t.status === "Offline").length;
  return { total, working, reviewing, offline };
};
