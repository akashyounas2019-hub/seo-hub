import {
  Bell,
  Bot,
  Building2,
  Calendar,
  FileText,
  Gauge,
  Globe,
  Languages,
  Link2,
  Mail,
  MapPin,
  MessageSquare,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  TrendingUp,
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

export const TEMPLATES: Omit<Flow, "id" | "status" | "lastRun" | "successRate">[] = [
  { name: "New Dubai suburb landing page", desc: "Localized service page for a specific Dubai area.", category: "local", icon: MapPin, accent: "from-cyan-400 to-sky-500", cadence: "weekly" },
  { name: "GBP weekly post", desc: "Publish an offer or update to Google Business Profile.", category: "gbp", icon: Building2, accent: "from-violet-400 to-fuchsia-500", cadence: "weekly" },
  { name: "Post-service review request", desc: "WhatsApp + email review request after job completion.", category: "reviews", icon: Star, accent: "from-amber-400 to-orange-500", cadence: "realtime" },
  { name: "Blog brief factory", desc: "Generate SEO briefs for Dubai-intent queries.", category: "onpage", icon: FileText, accent: "from-emerald-400 to-teal-500", cadence: "weekly" },
  { name: "UAE directory submission", desc: "Submit business to top UAE local directories.", category: "offpage", icon: Link2, accent: "from-rose-400 to-pink-500", cadence: "monthly" },
  { name: "Core Web Vitals monitor", desc: "Alert on LCP / CLS regressions.", category: "technical", icon: Gauge, accent: "from-indigo-400 to-blue-500", cadence: "hourly" },
];

export const INITIAL_FLOWS: Flow[] = [
  { id: "l1", name: "Dubai suburb landing page generator", desc: "Auto-create localized pages for Marina, JLT, Downtown, Business Bay, Deira, JVC, Al Barsha, Palm Jumeirah, Silicon Oasis.", category: "local", icon: MapPin, accent: "from-cyan-400 to-sky-500", status: "running", cadence: "weekly", lastRun: "2h ago", successRate: 96 },
  { id: "l2", name: "Local schema & NAP sync", desc: "Keep LocalBusiness / CleaningService JSON-LD + NAP consistent across all UAE listings.", category: "local", icon: Globe, accent: "from-cyan-400 to-sky-500", status: "running", cadence: "daily", lastRun: "6h ago", successRate: 99 },
  { id: "l3", name: "Arabic / English localization", desc: "Auto-translate meta, headings and service pages with hreflang ar-AE / en-AE tagging.", category: "local", icon: Languages, accent: "from-cyan-400 to-sky-500", status: "running", cadence: "weekly", lastRun: "1d ago", successRate: 92 },
  { id: "g1", name: "GBP weekly post publisher", desc: "Publish offers, service highlights and photos on Google Business Profile every Monday.", category: "gbp", icon: Building2, accent: "from-violet-400 to-fuchsia-500", status: "running", cadence: "weekly", lastRun: "3d ago", successRate: 100 },
  { id: "g2", name: "GBP Q&A auto-responder", desc: "Detect new questions on GBP and draft responses using service FAQ knowledge base.", category: "gbp", icon: MessageSquare, accent: "from-violet-400 to-fuchsia-500", status: "paused", cadence: "realtime", lastRun: "12h ago", successRate: 88 },
  { id: "g3", name: "Service area & hours sync", desc: "Update service areas across Dubai zones and public UAE holiday hours automatically.", category: "gbp", icon: Calendar, accent: "from-violet-400 to-fuchsia-500", status: "running", cadence: "monthly", lastRun: "12d ago", successRate: 100 },
  { id: "r1", name: "Post-service review request", desc: "Trigger WhatsApp + email review requests 2h after job completion in CRM.", category: "reviews", icon: Star, accent: "from-amber-400 to-orange-500", status: "running", cadence: "realtime", lastRun: "18m ago", successRate: 94 },
  { id: "r2", name: "Review reply drafter", desc: "Draft polite bilingual replies to new Google & Trustpilot reviews; flag < 4★ for human review.", category: "reviews", icon: MessageSquare, accent: "from-amber-400 to-orange-500", status: "running", cadence: "hourly", lastRun: "40m ago", successRate: 97 },
  { id: "r3", name: "Negative-review alert", desc: "Notify manager on Slack + email within 5 min of any 1–3★ review across UAE platforms.", category: "reviews", icon: Bell, accent: "from-amber-400 to-orange-500", status: "running", cadence: "realtime", lastRun: "2h ago", successRate: 100 },
  { id: "c1", name: "Service page meta refresh", desc: "Rewrite outdated meta titles/descriptions for deep-clean, sofa, carpet, move-in/out pages.", category: "onpage", icon: Sparkles, accent: "from-emerald-400 to-teal-500", status: "running", cadence: "weekly", lastRun: "4d ago", successRate: 91 },
  { id: "c2", name: "Blog brief & draft factory", desc: "Generate briefs for Dubai-intent queries (‘maid service DIFC’, ‘villa deep cleaning’) and produce first drafts.", category: "onpage", icon: FileText, accent: "from-emerald-400 to-teal-500", status: "running", cadence: "weekly", lastRun: "1d ago", successRate: 89 },
  { id: "c3", name: "Internal linking bot", desc: "Suggest & apply internal links between service, area and blog pages.", category: "onpage", icon: Link2, accent: "from-emerald-400 to-teal-500", status: "running", cadence: "daily", lastRun: "5h ago", successRate: 95 },
  { id: "b1", name: "UAE directory submission", desc: "Submit business to Yellow Pages UAE, Dubai Chamber, Connect.ae, Yalla, and 20+ local directories.", category: "offpage", icon: Link2, accent: "from-rose-400 to-pink-500", status: "running", cadence: "monthly", lastRun: "9d ago", successRate: 87 },
  { id: "b2", name: "Guest-post outreach", desc: "Prospect UAE lifestyle / real-estate blogs and send personalized pitches.", category: "offpage", icon: Mail, accent: "from-rose-400 to-pink-500", status: "paused", cadence: "weekly", lastRun: "6d ago", successRate: 62 },
  { id: "b3", name: "Broken-link reclamation", desc: "Find UAE sites linking to dead cleaning-service pages and pitch your page as replacement.", category: "offpage", icon: RefreshCw, accent: "from-rose-400 to-pink-500", status: "draft", cadence: "monthly", lastRun: "—", successRate: 0 },
  { id: "t1", name: "Core Web Vitals monitor", desc: "Alert when LCP > 2.5s or CLS > 0.1 on any tracked Dubai service page.", category: "technical", icon: Gauge, accent: "from-indigo-400 to-blue-500", status: "running", cadence: "hourly", lastRun: "22m ago", successRate: 99 },
  { id: "t2", name: "Indexation & crawl audit", desc: "Weekly scan of robots.txt, sitemap, indexation and canonical issues.", category: "technical", icon: ShieldCheck, accent: "from-indigo-400 to-blue-500", status: "running", cadence: "weekly", lastRun: "2d ago", successRate: 98 },
  { id: "t3", name: "Uptime & SSL watcher", desc: "Ping every 5 min from UAE region; alert on downtime or SSL expiry within 30 days.", category: "technical", icon: Bell, accent: "from-indigo-400 to-blue-500", status: "running", cadence: "realtime", lastRun: "3m ago", successRate: 100 },
  { id: "rs1", name: "Dubai keyword miner", desc: "Discover new intent keywords (deep clean, sofa shampoo, holiday-home turnover) with UAE volume.", category: "research", icon: Search, accent: "from-fuchsia-400 to-purple-500", status: "running", cadence: "weekly", lastRun: "3d ago", successRate: 93 },
  { id: "rs2", name: "Competitor SERP tracker", desc: "Track ServiceMarket, Justmop, Matic, Urbanclap positions daily on 200+ UAE queries.", category: "research", icon: TrendingUp, accent: "from-fuchsia-400 to-purple-500", status: "running", cadence: "daily", lastRun: "7h ago", successRate: 100 },
  { id: "rs3", name: "Ramadan / DSF trend watcher", desc: "Surface seasonal query spikes (Ramadan deep clean, DSF villa cleaning) 3 weeks ahead.", category: "research", icon: Sparkles, accent: "from-fuchsia-400 to-purple-500", status: "running", cadence: "weekly", lastRun: "5d ago", successRate: 90 },
  { id: "rp1", name: "Weekly executive report", desc: "Email PDF report every Sunday: rankings, GBP calls, reviews, traffic, top pages.", category: "reporting", icon: Mail, accent: "from-slate-300 to-slate-500", status: "running", cadence: "weekly", lastRun: "6d ago", successRate: 100 },
  { id: "rp2", name: "Rank-drop Slack alert", desc: "Notify #seo channel when tracked keyword drops > 3 positions overnight.", category: "reporting", icon: Bell, accent: "from-slate-300 to-slate-500", status: "running", cadence: "daily", lastRun: "8h ago", successRate: 100 },
];

export const CADENCE_LABEL: Record<Cadence, string> = {
  realtime: "Real-time",
  hourly: "Hourly",
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};
