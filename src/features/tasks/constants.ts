import { AlertTriangle, Flag } from "lucide-react";
import type { ColumnMeta, Priority, PriorityMeta, Template } from "./types";

export const SEED_TEMPLATES: Template[] = [
  {
    id: "tpl-audit",
    name: "Full-site technical audit",
    title: "Run full-site technical audit",
    desc: "Crawl the site, flag crawl blockers, canonicals, redirects, and CWV regressions. Export exec-ready report.",
    defaultAssignee: "Technical SEO Expert",
    priority: "high",
    builtIn: true,
  },
  {
    id: "tpl-brief",
    name: "Content brief for target keyword",
    title: "Draft content brief for {{keyword}}",
    desc: "Search intent, SERP outline, entities, internal-link targets, and word-count guidance.",
    defaultAssignee: "On-Page Expert",
    priority: "medium",
    builtIn: true,
  },
  {
    id: "tpl-outreach",
    name: "Link outreach campaign",
    title: "Launch outreach batch (25 prospects)",
    desc: "Enrich prospects, generate personalized pitches, queue for approval before send.",
    defaultAssignee: "Off-Page Expert",
    priority: "medium",
    builtIn: true,
  },
  {
    id: "tpl-refresh",
    name: "Refresh declining post",
    title: "Refresh declining post: {{url}}",
    desc: "Update stats, expand FAQ, add 2026 examples, re-run internal links.",
    defaultAssignee: "On-Page Expert",
    priority: "low",
    builtIn: true,
  },
  {
    id: "tpl-review",
    name: "Quarterly QA review",
    title: "QA review — top 20 landing pages",
    desc: "E-E-A-T, accuracy, compliance and schema checks. File issues into the fix queue.",
    defaultAssignee: "Auditor",
    priority: "high",
    builtIn: true,
  },
];

export const COLUMNS: ColumnMeta[] = [
  { id: "todo", title: "To Do", hint: "Queued & ready", accent: "from-slate-500 to-slate-700", dot: "bg-slate-400" },
  { id: "inprogress", title: "In Progress", hint: "Being executed", accent: "from-cyan-400 to-blue-500", dot: "bg-cyan-400" },
  { id: "review", title: "Review", hint: "Awaiting approval", accent: "from-amber-400 to-orange-500", dot: "bg-amber-400" },
  { id: "done", title: "Done", hint: "Shipped", accent: "from-emerald-400 to-teal-500", dot: "bg-emerald-400" },
];

export const PRIORITY_META: Record<Priority, PriorityMeta> = {
  low: { label: "Low", cls: "bg-slate-500/10 text-slate-300 border-slate-500/25", ring: "ring-slate-600/40", icon: Flag },
  medium: { label: "Medium", cls: "bg-sky-400/10 text-sky-200 border-sky-400/25", ring: "ring-sky-500/40", icon: Flag },
  high: { label: "High", cls: "bg-amber-400/10 text-amber-200 border-amber-400/25", ring: "ring-amber-500/40", icon: Flag },
  critical: { label: "Critical", cls: "bg-rose-500/10 text-rose-200 border-rose-500/25", ring: "ring-rose-500/50", icon: AlertTriangle },
};
