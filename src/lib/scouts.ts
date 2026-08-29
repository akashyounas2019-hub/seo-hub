import {
  Search,
  FileText,
  Palette,
  MapPin,
  Target,
  ClipboardCheck,
  Wrench,
  type LucideIcon,
  BarChart3,
  Layers,
  Network,
  TrendingUp,
  Sparkles,
  FileSearch,
  Gauge,
  Star,
  Globe,
  BookOpen,
  Building2,
  MapPinned,
  Radar,
  GitCompare,
  Link2,
  PieChart,
  ClipboardList,
  AlertTriangle,
  ScrollText,
  ShieldCheck,
  Cpu,
  Bug,
  Braces,
  Route as RouteIcon,
  PenSquare,
  ListOrdered,
} from "lucide-react";

// Static identity/layout metadata only -- title, role, icon, mission, and
// each tab's label/icon/summary copy. No metrics, activity feeds, or status
// strings live here anymore: those were 100% fabricated (fake competitor
// names, fake timestamps, invented numbers) and have been replaced by real
// data fetched per-scout from /api/scouts/$id/data
// (api.scouts.$scoutId.data.ts), rendered by scout-detail-view.tsx.
export type ScoutTab = {
  id: string;
  label: string;
  icon: LucideIcon;
  summary: string;
};

export type Scout = {
  id: string;
  title: string;
  role: string;
  icon: LucideIcon;
  accent: string;
  angle: number;
  mission: string;
  tabs: ScoutTab[];
};

export const SCOUTS: Scout[] = [
  {
    id: "keyword",
    title: "Keyword Scout",
    role: "Query Intelligence",
    icon: Search,
    accent: "from-cyan-400 to-sky-500",
    angle: 0,
    mission: "Uncover high-intent queries, monitor rankings, and shape a keyword universe the whole team can build on.",
    tabs: [
      { id: "researcher", label: "Keyword Researcher", icon: Search, summary: "Discover new query opportunities from real Search Console impressions and positions." },
      { id: "ranker", label: "Keyword Ranker", icon: TrendingUp, summary: "Track real daily positions and click/impression data across tracked queries." },
      { id: "competitor-kw", label: "Competitor Keywords", icon: Radar, summary: "Compare rival keyword footprints and surface the gaps worth chasing." },
      { id: "mapping", label: "Keyword Mapping", icon: Network, summary: "See which real page each top query currently ranks on." },
      { id: "clustering", label: "Keyword Clustering", icon: Layers, summary: "Group semantically related queries into topic hubs and pillar pages." },
    ],
  },
  {
    id: "content",
    title: "Content Scout",
    role: "Editorial Radar",
    icon: FileText,
    accent: "from-violet-400 to-fuchsia-500",
    angle: 51.4,
    mission: "Turn keyword clusters into publishable briefs, calendars, and audited content that ranks.",
    tabs: [
      { id: "studio", label: "Content Studio", icon: Sparkles, summary: "Real content tasks from the Kanban board, filtered to Content Strategist assignments." },
      { id: "writing", label: "Content Writing", icon: PenSquare, summary: "Tasks genuinely awaiting your approval before an agent writes them." },
      { id: "pipeline", label: "Content Pipeline", icon: ListOrdered, summary: "Every real content task's current stage, from the actual Kanban board." },
      { id: "quality", label: "Quality & Audit", icon: ShieldCheck, summary: "Content quality checks." },
      { id: "gmb", label: "GMB Post Writer", icon: MapPin, summary: "See Local Business Scout's GBP tab for real Google Business Profile data." },
    ],
  },
  {
    id: "design",
    title: "Designing Scout",
    role: "Visual Systems",
    icon: Palette,
    accent: "from-indigo-400 to-blue-500",
    angle: 102.8,
    mission: "Translate briefs into on-brand layouts, components, and asset kits ready for build.",
    tabs: [
      { id: "researcher", label: "Design Researcher", icon: Layers, summary: "Competitor design research." },
      { id: "prototypes", label: "Layout Prototypes", icon: Layers, summary: "Design prototyping tool status." },
      { id: "system", label: "Visual System", icon: Palette, summary: "Design token and component governance." },
      { id: "assets", label: "Asset Library", icon: BookOpen, summary: "Illustration, icon, and photography asset management." },
      { id: "variants", label: "A/B Variants", icon: GitCompare, summary: "Visual A/B test results." },
      { id: "a11y", label: "Accessibility", icon: ShieldCheck, summary: "Real accessibility score from a live PageSpeed Insights run against this site's homepage." },
    ],
  },
  {
    id: "local",
    title: "Local Business Scout",
    role: "GBP & Citations",
    icon: MapPin,
    accent: "from-emerald-400 to-teal-500",
    angle: 154.3,
    mission: "Keep the Google Business Profile, citations, and local rankings pristine across every service area.",
    tabs: [
      { id: "gbp", label: "GBP Manager", icon: Building2, summary: "Real Google Business Profile performance metrics for this site's connected location." },
      { id: "citations", label: "Citations", icon: Globe, summary: "Directory listing consistency with the master NAP." },
      { id: "reviews", label: "Reviews", icon: Star, summary: "Real customer reviews from this site's connected Google Business Profile." },
      { id: "local-rank", label: "Local Rankings", icon: MapPinned, summary: "Local pack grid rank tracking." },
      { id: "nap", label: "NAP Audit", icon: ClipboardCheck, summary: "Real Name/Address/Phone from the connected Google Business Profile." },
    ],
  },
  {
    id: "competitor",
    title: "Competitor Scout",
    role: "SERP Surveillance",
    icon: Target,
    accent: "from-amber-400 to-orange-500",
    angle: 205.7,
    mission: "Watch competitors' public sitemaps and surface plays before the market shifts.",
    tabs: [
      { id: "serp", label: "SERP Tracker", icon: Radar, summary: "Daily SERP snapshots and volatility scoring." },
      { id: "sitemap", label: "Sitemap Diff", icon: GitCompare, summary: "Real sitemap.xml crawl of a competitor domain you specify." },
      { id: "backlinks", label: "Backlink Watch", icon: Link2, summary: "Referring domain monitoring." },
      { id: "gap", label: "Content Gap", icon: Layers, summary: "Topics competitors rank for that you don't." },
      { id: "sov", label: "Share of Voice", icon: PieChart, summary: "Impression share vs named competitors." },
    ],
  },
  {
    id: "audit",
    title: "Audit & Reporting Scout",
    role: "Insights Desk",
    icon: ClipboardCheck,
    accent: "from-indigo-400 to-blue-500",
    angle: 257.1,
    mission: "Convert raw signals into audits, dashboards, and exec-ready narratives.",
    tabs: [
      { id: "site-audit", label: "Site Audit", icon: FileSearch, summary: "Real PageSpeed Insights performance/SEO audit for this site's homepage." },
      { id: "weekly", label: "Weekly Report", icon: ScrollText, summary: "Auto-composed weekly narrative." },
      { id: "kpi", label: "KPI Dashboard", icon: BarChart3, summary: "Real job-completion and alert counts from this app's own database." },
      { id: "issues", label: "Issue Tracker", icon: AlertTriangle, summary: "Real open alerts from the Alert Manager." },
      { id: "exec", label: "Exec Summary", icon: ClipboardList, summary: "One-page monthly narrative." },
    ],
  },
  {
    id: "technical",
    title: "Technical Scout",
    role: "Crawl & Performance",
    icon: Wrench,
    accent: "from-rose-400 to-red-500",
    angle: 308.6,
    mission: "Keep the crawl clean, the Core Web Vitals green, and the schema valid on every deployed URL.",
    tabs: [
      { id: "crawl", label: "Crawl Report", icon: Cpu, summary: "Real sitemap.xml crawl results for this site." },
      { id: "cwv", label: "Core Web Vitals", icon: Gauge, summary: "Real field/lab Core Web Vitals from a live PageSpeed Insights run." },
      { id: "schema", label: "Schema Validator", icon: Braces, summary: "Structured data coverage validation." },
      { id: "logs", label: "Log Analyzer", icon: Bug, summary: "Server log crawl-budget analysis." },
      { id: "redirects", label: "Redirects", icon: RouteIcon, summary: "Redirect chain/loop auditing." },
    ],
  },
];

export function getScout(id: string): Scout | undefined {
  return SCOUTS.find((s) => s.id === id);
}
