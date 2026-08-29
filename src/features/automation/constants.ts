import {
  Bell,
  Bot,
  Building2,
  FileText,
  Gauge,
  Languages,
  Link2,
  Mail,
  MapPin,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
} from "lucide-react";
import type { Cadence, Flow } from "./types";

export const AGENTS = [
  { id: "local", name: "Local SEO Agent", role: "Dubai suburbs & GBP", icon: MapPin },
  { id: "gbp", name: "GBP Publisher", role: "Posts, Q&A, hours", icon: Building2 },
  { id: "review", name: "Review Agent", role: "Requests & replies", icon: Star },
  { id: "content", name: "Content Strategist", role: "Briefs & drafts", icon: FileText },
  { id: "meta", name: "Meta Optimizer", role: "Titles & descriptions", icon: Sparkles },
  { id: "outreach", name: "Outreach Agent", role: "Backlinks & pitches", icon: Mail },
  { id: "technical", name: "Technical Agent", role: "CWV, crawl, indexation", icon: Gauge },
  { id: "auditor", name: "Quality Auditor", role: "Audit, keywords & trends (8 sub-agents)", icon: ShieldCheck },
  { id: "reporting", name: "Reporting Agent", role: "Alerts & reports", icon: Bell },
  { id: "translator", name: "AR/EN Translator", role: "Localization & hreflang", icon: Languages },
];

export const CATEGORIES = [
  { id: "local", label: "Local SEO (Dubai)", icon: MapPin, accent: "from-cyan-400 to-sky-500" },
  { id: "gbp", label: "Google Business Profile", icon: Building2, accent: "from-violet-400 to-fuchsia-500" },
  { id: "reviews", label: "Reviews & Reputation", icon: Star, accent: "from-amber-400 to-orange-500" },
  { id: "onpage", label: "On-Page & Content", icon: FileText, accent: "from-emerald-400 to-teal-500" },
  { id: "offpage", label: "Backlinks & Outreach", icon: Link2, accent: "from-rose-400 to-pink-500" },
  { id: "technical", label: "Technical & CWV", icon: Gauge, accent: "from-indigo-400 to-blue-500" },
  { id: "research", label: "Research & Trends", icon: Search, accent: "from-fuchsia-400 to-purple-500" },
  { id: "reporting", label: "Reporting & Alerts", icon: Bell, accent: "from-slate-300 to-slate-500" },
] as const;

// Starter templates a user picks from when creating a new flow -- these are
// pre-filled FORM DEFAULTS (name/desc/category/cadence text), not live data,
// same category as EXPERTS or BUSINESS_CATEGORIES. Every flow actually
// created still starts with an honest successRate of 0 and "Never run" --
// see use-automation.ts's saveFlow().
export const TEMPLATES: Omit<Flow, "id" | "status" | "lastRun" | "successRate">[] = [
  { name: "New Dubai suburb landing page", desc: "Localized service page for a specific Dubai area.", category: "local", icon: MapPin, accent: "from-cyan-400 to-sky-500", cadence: "weekly" },
  { name: "GBP weekly post", desc: "Publish an offer or update to Google Business Profile.", category: "gbp", icon: Building2, accent: "from-violet-400 to-fuchsia-500", cadence: "weekly" },
  { name: "Post-service review request", desc: "WhatsApp + email review request after job completion.", category: "reviews", icon: Star, accent: "from-amber-400 to-orange-500", cadence: "realtime" },
  { name: "Blog brief factory", desc: "Generate SEO briefs for Dubai-intent queries.", category: "onpage", icon: FileText, accent: "from-emerald-400 to-teal-500", cadence: "weekly" },
  { name: "UAE directory submission", desc: "Submit business to top UAE local directories.", category: "offpage", icon: Link2, accent: "from-rose-400 to-pink-500", cadence: "monthly" },
  { name: "Core Web Vitals monitor", desc: "Alert on LCP / CLS regressions.", category: "technical", icon: Gauge, accent: "from-indigo-400 to-blue-500", cadence: "hourly" },
];

export const CADENCE_LABEL: Record<Cadence, string> = {
  realtime: "Real-time",
  hourly: "Hourly",
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};
