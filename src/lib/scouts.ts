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
  Calendar,
  Sparkles,
  FileSearch,
  Gauge,
  Star,
  Globe,
  BookOpen,
  Building2,
  MessageSquare,
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

export type ScoutTab = {
  id: string;
  label: string;
  icon: LucideIcon;
  summary: string;
  metrics: { label: string; value: string; delta?: string }[];
  activity: { time: string; text: string }[];
};

export type Scout = {
  id: string;
  title: string;
  role: string;
  icon: LucideIcon;
  accent: string;
  activity: string;
  status: string;
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
    activity: "Mining 428 long-tail queries",
    status: "Engaged",
    angle: 0,
    mission:
      "Uncover high-intent queries, monitor rankings, and shape a keyword universe the whole team can build on.",
    tabs: [
      {
        id: "researcher",
        label: "Keyword Researcher",
        icon: Search,
        summary:
          "Discover new query opportunities scored by volume, intent, and difficulty.",
        metrics: [
          { label: "Seeds mined", value: "1,284", delta: "+62 today" },
          { label: "Winnable KDs", value: "312", delta: "KD < 40" },
          { label: "Intent split", value: "58% info · 42% txn" },
        ],
        activity: [
          { time: "2m", text: "Expanded seed “movers dubai marina” → 84 variants" },
          { time: "18m", text: "Filtered 41 zero-volume terms from batch #204" },
          { time: "1h", text: "Sync’d curated list to Content Scout" },
        ],
      },
      {
        id: "ranker",
        label: "Keyword Ranker",
        icon: TrendingUp,
        summary:
          "Track daily positions, SERP features, and movement across tracked keywords.",
        metrics: [
          { label: "Tracked", value: "428" },
          { label: "In top 10", value: "112", delta: "+9 wk" },
          { label: "Avg. position", value: "18.4", delta: "▲ 2.1" },
        ],
        activity: [
          { time: "just now", text: "“office relocation dubai” moved 14 → 6" },
          { time: "40m", text: "Featured snippet won on 3 how-to queries" },
          { time: "3h", text: "Local pack impressions up 22% w/w" },
        ],
      },
      {
        id: "competitor-kw",
        label: "Competitor Keywords",
        icon: Radar,
        summary:
          "Compare rival keyword footprints and surface the gaps worth chasing.",
        metrics: [
          { label: "Rivals watched", value: "6" },
          { label: "Gap keywords", value: "247" },
          { label: "Overlap score", value: "0.38" },
        ],
        activity: [
          { time: "9m", text: "movers.ae added 12 new terms in packing niche" },
          { time: "1h", text: "Shared 24 gap opportunities with Content Scout" },
          { time: "yday", text: "Detected 3 rivals bidding on brand terms" },
        ],
      },
      {
        id: "mapping",
        label: "Keyword Mapping",
        icon: Network,
        summary:
          "Assign every priority keyword to the right URL — no cannibalisation.",
        metrics: [
          { label: "URLs mapped", value: "184" },
          { label: "Unassigned", value: "22" },
          { label: "Conflicts", value: "3", delta: "needs review" },
        ],
        activity: [
          { time: "12m", text: "Mapped /services/villa-move → 14 queries" },
          { time: "2h", text: "Flagged /blog vs /guide conflict on ‘packing tips’" },
          { time: "yday", text: "Auto-generated brief for 8 orphan queries" },
        ],
      },
      {
        id: "clustering",
        label: "Keyword Clustering",
        icon: Layers,
        summary:
          "Group semantically related queries into topic hubs and pillar pages.",
        metrics: [
          { label: "Clusters", value: "48" },
          { label: "Pillars ready", value: "12" },
          { label: "Avg. cluster size", value: "9.3" },
        ],
        activity: [
          { time: "26m", text: "New pillar: ‘office movers in dubai’ (32 terms)" },
          { time: "1h", text: "Merged 2 near-duplicate clusters" },
          { time: "3h", text: "Handed 4 clusters to Designing Scout for LP" },
        ],
      },
    ],
  },
  {
    id: "content",
    title: "Content Scout",
    role: "Editorial Radar",
    icon: FileText,
    accent: "from-violet-400 to-fuchsia-500",
    activity: "Drafting brief · move-in checklist",
    status: "Writing",
    angle: 51.4,
    mission:
      "Turn keyword clusters into publishable briefs, calendars, and audited content that ranks.",
    tabs: [
      {
        id: "studio",
        label: "Content Studio",
        icon: Sparkles,
        summary: "Full AI content pipeline — from keyword to published page. Auto-write SEO-optimized service pages with NLP entity targeting.",
        metrics: [
          { label: "Jobs today", value: "14" },
          { label: "Published", value: "6" },
          { label: "Avg. score", value: "92" },
        ],
        activity: [
          { time: "3m", text: "Generated ‘villa deep cleaning Palm Jumeirah’ draft" },
          { time: "1h", text: "Queued 4 service-page rewrites for Marina" },
          { time: "yday", text: "Auto-published ‘office cleaning JLT’ · score 94" },
        ],
      },
      {
        id: "writing",
        label: "Content Writing",
        icon: PenSquare,
        summary: "Propose a grounded, AI-Overview-ready brief, review + edit it, then hand it to the writer. The draft still passes the quality gate before publish.",
        metrics: [
          { label: "Briefs open", value: "7" },
          { label: "Awaiting review", value: "3" },
          { label: "Avg. brief time", value: "4m 10s" },
        ],
        activity: [
          { time: "8m", text: "Brief proposed: villa deep cleaning Palm Jumeirah" },
          { time: "45m", text: "Writer accepted ‘office cleaning JLT’" },
          { time: "yday", text: "3 briefs handed off to Safaeewala site" },
        ],
      },
      {
        id: "pipeline",
        label: "Content Pipeline",
        icon: ListOrdered,
        summary: "Every piece of content, live view — from keyword pick to publish. Move cards through stages, or let the agent advance them automatically.",
        metrics: [
          { label: "In pipeline", value: "23" },
          { label: "Blocked", value: "2" },
          { label: "Ready to publish", value: "5" },
        ],
        activity: [
          { time: "12m", text: "‘maid service Downtown Dubai’ advanced to QA" },
          { time: "1h", text: "2 cards blocked — awaiting GBP facts" },
          { time: "3h", text: "Auto-advanced 4 drafts past outline stage" },
        ],
      },
      {
        id: "quality",
        label: "Quality & Audit",
        icon: ShieldCheck,
        summary: "One quality gate for new drafts and existing URLs — freshness, E-E-A-T, entity coverage, decay signals and thin-content flags in one place.",
        metrics: [
          { label: "URLs audited", value: "312" },
          { label: "Refresh queue", value: "28" },
          { label: "Fails last 24h", value: "4" },
        ],
        activity: [
          { time: "30m", text: "Flagged 6 pages with thin content < 400 words" },
          { time: "2h", text: "Detected keyword decay on /blog/packing" },
          { time: "yday", text: "Refresh plan sent to editorial" },
        ],
      },
      {
        id: "gmb",
        label: "GMB Post Writer",
        icon: MapPin,
        summary: "Pick a keyword, choose a template, generate a Google Business Profile post under 1,500 characters. Assign to an agent or push to GoHighLevel.",
        metrics: [
          { label: "Posts this week", value: "18" },
          { label: "Sent to GHL", value: "12" },
          { label: "Avg. length", value: "1,180" },
        ],
        activity: [
          { time: "6m", text: "Draft ‘Ramadan deep-clean offer’ · 1,240 chars" },
          { time: "1h", text: "Pushed 3 posts to GoHighLevel campaign" },
          { time: "yday", text: "Assigned 4 posts to Editorial agent" },
        ],
      },
    ],
  },
  {
    id: "design",
    title: "Designing Scout",
    role: "Visual Systems",
    icon: Palette,
    accent: "from-pink-400 to-rose-500",
    activity: "Prototyping hero layout",
    status: "Sketching",
    angle: 102.8,
    mission:
      "Translate briefs into on-brand layouts, components, and asset kits ready for build.",
    tabs: [
      {
        id: "researcher",
        label: "Design Researcher",
        icon: Layers,
        summary: "Scout ~10 high-performing sites in your market, capture every section, and mix-and-match the best layouts.",
        metrics: [
          { label: "Runs (7d)", value: "0" },
          { label: "Sections captured", value: "0" },
          { label: "Selected", value: "0" },
        ],
        activity: [
          { time: "—", text: "No research runs yet. Start one to scout ~10 reference sites." },
        ],
      },
      {
        id: "prototypes",
        label: "Layout Prototypes",
        icon: Layers,
        summary: "Iterating hero, PDP, and landing layouts against the design system.",
        metrics: [
          { label: "Active protos", value: "6" },
          { label: "In review", value: "2" },
          { label: "Approved", value: "11" },
        ],
        activity: [
          { time: "8m", text: "Hero v3 posted for stakeholder review" },
          { time: "1h", text: "Simplified 3-step booking flow" },
          { time: "yday", text: "Merged prototype library with tokens v2" },
        ],
      },

      {
        id: "system",
        label: "Visual System",
        icon: Palette,
        summary: "Tokens, typography, and component variants governance.",
        metrics: [
          { label: "Tokens", value: "142" },
          { label: "Components", value: "48" },
          { label: "Drift", value: "3", delta: "needs sync" },
        ],
        activity: [
          { time: "22m", text: "Rolled radius tokens across Buttons + Cards" },
          { time: "2h", text: "Deprecated legacy shadow-lg utility" },
          { time: "yday", text: "Published semantic color palette v1.4" },
        ],
      },
      {
        id: "assets",
        label: "Asset Library",
        icon: BookOpen,
        summary: "Illustrations, icons, and photography curated by use-case.",
        metrics: [
          { label: "Assets", value: "312" },
          { label: "Approved", value: "268" },
          { label: "Awaiting alt-text", value: "14" },
        ],
        activity: [
          { time: "15m", text: "Uploaded 12 truck illustrations" },
          { time: "1h", text: "Requested alt-text pass from Audit Scout" },
          { time: "yday", text: "Retired 8 stock photos" },
        ],
      },
      {
        id: "variants",
        label: "A/B Variants",
        icon: GitCompare,
        summary: "Ship visual variants and hand results back to CRO.",
        metrics: [
          { label: "Live tests", value: "3" },
          { label: "Winners", value: "5" },
          { label: "Avg. lift", value: "+7.4%" },
        ],
        activity: [
          { time: "30m", text: "CTA colour test reached 95% confidence" },
          { time: "2h", text: "Queued hero copy variant B" },
          { time: "yday", text: "Rolled winning nav layout to prod" },
        ],
      },
      {
        id: "a11y",
        label: "Accessibility",
        icon: ShieldCheck,
        summary: "Contrast, focus states, and semantics on every shipped screen.",
        metrics: [
          { label: "A11y score", value: "96", delta: "▲ 2" },
          { label: "Blockers", value: "0" },
          { label: "Contrast fails", value: "4" },
        ],
        activity: [
          { time: "10m", text: "Fixed focus ring on secondary buttons" },
          { time: "1h", text: "Audited pricing page — 0 blockers" },
          { time: "yday", text: "Shared a11y checklist with Content Scout" },
        ],
      },
    ],
  },
  {
    id: "local",
    title: "Local Business Scout",
    role: "GBP & Citations",
    icon: MapPin,
    accent: "from-emerald-400 to-teal-500",
    activity: "Sweeping 42 UAE directories",
    status: "Scanning",
    angle: 154.3,
    mission:
      "Keep the Google Business Profile, citations, and local rankings pristine across every UAE emirate.",
    tabs: [
      {
        id: "gbp",
        label: "GBP Manager",
        icon: Building2,
        summary: "Posts, Q&A, offers, and hours across all business locations.",
        metrics: [
          { label: "Profiles", value: "4" },
          { label: "Posts this wk", value: "9" },
          { label: "Direction requests", value: "612" },
        ],
        activity: [
          { time: "6m", text: "Published summer-offer post to 4 profiles" },
          { time: "1h", text: "Answered 3 pending Q&As" },
          { time: "yday", text: "Updated Eid holiday hours" },
        ],
      },
      {
        id: "citations",
        label: "Citations",
        icon: Globe,
        summary: "Directory listings kept consistent with the master NAP.",
        metrics: [
          { label: "Live citations", value: "142" },
          { label: "Pending", value: "6" },
          { label: "Inconsistencies", value: "2" },
        ],
        activity: [
          { time: "18m", text: "Yellow Pages listing verified" },
          { time: "2h", text: "Fixed suite number on 2 directories" },
          { time: "yday", text: "Submitted to 5 UAE-only directories" },
        ],
      },
      {
        id: "reviews",
        label: "Reviews",
        icon: Star,
        summary: "Ratings velocity, response SLA, and sentiment across platforms.",
        metrics: [
          { label: "Avg rating", value: "4.8" },
          { label: "This month", value: "38", delta: "+12" },
          { label: "Response SLA", value: "1.4h" },
        ],
        activity: [
          { time: "4m", text: "Responded to 5★ review from Al Barsha" },
          { time: "1h", text: "Escalated 2★ review to ops manager" },
          { time: "yday", text: "Requested reviews from 24 completed jobs" },
        ],
      },
      {
        id: "local-rank",
        label: "Local Rankings",
        icon: MapPinned,
        summary: "Grid rankings across 7 UAE service areas.",
        metrics: [
          { label: "Grid cells", value: "225" },
          { label: "Avg. rank", value: "3.1", delta: "▲ 0.6" },
          { label: "Top-3 share", value: "62%" },
        ],
        activity: [
          { time: "20m", text: "Marina grid up 0.9 avg positions" },
          { time: "2h", text: "Detected drop in JLT — investigating" },
          { time: "yday", text: "Refreshed 4 service-area pages" },
        ],
      },
      {
        id: "nap",
        label: "NAP Audit",
        icon: ClipboardCheck,
        summary: "Continuous audit of Name, Address, Phone across the web.",
        metrics: [
          { label: "Records", value: "168" },
          { label: "Consistent", value: "98.8%" },
          { label: "Duplicates", value: "1" },
        ],
        activity: [
          { time: "35m", text: "Merged 1 duplicate GBP listing" },
          { time: "3h", text: "Updated schema NAP on 4 pages" },
          { time: "yday", text: "Shared audit with Technical Scout" },
        ],
      },
    ],
  },
  {
    id: "competitor",
    title: "Competitor Scout",
    role: "SERP Surveillance",
    icon: Target,
    accent: "from-amber-400 to-orange-500",
    activity: "Diffing 6 rival sitemaps",
    status: "Tracking",
    angle: 205.7,
    mission:
      "Watch competitors 24/7 — SERPs, sitemaps, backlinks — and surface plays before the market shifts.",
    tabs: [
      {
        id: "serp",
        label: "SERP Tracker",
        icon: Radar,
        summary: "Daily SERP snapshots and volatility scoring across the keyword universe.",
        metrics: [
          { label: "Keywords watched", value: "612" },
          { label: "Volatility", value: "3.2", delta: "calm" },
          { label: "Feature changes", value: "18" },
        ],
        activity: [
          { time: "7m", text: "PAA added for ‘office movers dubai’" },
          { time: "45m", text: "New local pack player detected" },
          { time: "yday", text: "AI overview rolled out on 3 queries" },
        ],
      },
      {
        id: "sitemap",
        label: "Sitemap Diff",
        icon: GitCompare,
        summary: "Track every new URL your rivals publish.",
        metrics: [
          { label: "Domains", value: "6" },
          { label: "New URLs (7d)", value: "42" },
          { label: "Removed", value: "9" },
        ],
        activity: [
          { time: "12m", text: "movers.ae added 4 emirate landing pages" },
          { time: "2h", text: "Rival dropped their ‘storage’ hub" },
          { time: "yday", text: "Sent digest to Content Scout" },
        ],
      },
      {
        id: "backlinks",
        label: "Backlink Watch",
        icon: Link2,
        summary: "New referring domains competitors earn and lose.",
        metrics: [
          { label: "New rd (7d)", value: "126" },
          { label: "Lost", value: "34" },
          { label: "Toxic flagged", value: "5" },
        ],
        activity: [
          { time: "20m", text: "Rival earned link from gulfnews.com" },
          { time: "3h", text: "PR opportunity: khaleejtimes list" },
          { time: "yday", text: "Notified outreach team of 6 targets" },
        ],
      },
      {
        id: "gap",
        label: "Content Gap",
        icon: Layers,
        summary: "Topics competitors rank for that you don’t — sized by opportunity.",
        metrics: [
          { label: "Gap topics", value: "58" },
          { label: "Quick wins", value: "12" },
          { label: "Est. traffic", value: "9.4k/mo" },
        ],
        activity: [
          { time: "18m", text: "Quick-win found: ‘office relocation checklist’" },
          { time: "1h", text: "Handed 4 gaps to Content Scout" },
          { time: "yday", text: "Retired 3 already-won gaps" },
        ],
      },
      {
        id: "sov",
        label: "Share of Voice",
        icon: PieChart,
        summary: "Your slice of impressions vs each named competitor.",
        metrics: [
          { label: "Your SoV", value: "26.4%", delta: "▲ 1.8" },
          { label: "Rank", value: "#2" },
          { label: "Gap to #1", value: "8.1 pts" },
        ],
        activity: [
          { time: "25m", text: "Gained SoV in ‘villa movers’ cluster" },
          { time: "2h", text: "Lost 0.4 pts on brand-adjacent queries" },
          { time: "yday", text: "Monthly SoV report shipped" },
        ],
      },
    ],
  },
  {
    id: "audit",
    title: "Audit & Reporting Scout",
    role: "Insights Desk",
    icon: ClipboardCheck,
    accent: "from-indigo-400 to-blue-500",
    activity: "Compiling weekly exec report",
    status: "Reporting",
    angle: 257.1,
    mission:
      "Convert raw signals into audits, dashboards, and exec-ready narratives on a repeatable cadence.",
    tabs: [
      {
        id: "site-audit",
        label: "Site Audit",
        icon: FileSearch,
        summary: "Full-site crawl scored on 120+ SEO health checks.",
        metrics: [
          { label: "Health", value: "92", delta: "▲ 3" },
          { label: "Errors", value: "14" },
          { label: "Warnings", value: "68" },
        ],
        activity: [
          { time: "10m", text: "Fixed 6 broken internal links" },
          { time: "1h", text: "Detected 2 duplicate title tags" },
          { time: "yday", text: "Full audit ran on 342 URLs" },
        ],
      },
      {
        id: "weekly",
        label: "Weekly Report",
        icon: ScrollText,
        summary: "Auto-composed weekly narrative for stakeholders.",
        metrics: [
          { label: "Reports sent", value: "48" },
          { label: "Open rate", value: "94%" },
          { label: "Next drop", value: "Mon 09:00" },
        ],
        activity: [
          { time: "30m", text: "W28 report drafted — awaiting review" },
          { time: "2h", text: "Added CTA to book ops sync" },
          { time: "yday", text: "Exec highlighted local wins section" },
        ],
      },
      {
        id: "kpi",
        label: "KPI Dashboard",
        icon: BarChart3,
        summary: "One canvas for traffic, conversions, and pipeline attribution.",
        metrics: [
          { label: "Traffic", value: "62.1k", delta: "▲ 9%" },
          { label: "Leads", value: "412", delta: "▲ 14%" },
          { label: "MQL rate", value: "18.2%" },
        ],
        activity: [
          { time: "15m", text: "Pinned ‘Local leads’ tile to top row" },
          { time: "1h", text: "Fixed GA4 event mapping" },
          { time: "yday", text: "Added SoV widget from Competitor Scout" },
        ],
      },
      {
        id: "issues",
        label: "Issue Tracker",
        icon: AlertTriangle,
        summary: "Prioritised backlog of SEO issues with owners and SLAs.",
        metrics: [
          { label: "Open", value: "22" },
          { label: "P1", value: "3" },
          { label: "Avg. TTR", value: "1.8d" },
        ],
        activity: [
          { time: "12m", text: "Closed P2 · schema on /pricing" },
          { time: "1h", text: "Opened P1 · 5xx spike on /blog" },
          { time: "yday", text: "Merged 4 duplicate issues" },
        ],
      },
      {
        id: "exec",
        label: "Exec Summary",
        icon: ClipboardList,
        summary: "One-page monthly narrative with wins, risks, and asks.",
        metrics: [
          { label: "Wins", value: "7" },
          { label: "Risks", value: "2" },
          { label: "Asks", value: "1" },
        ],
        activity: [
          { time: "40m", text: "Draft July summary saved" },
          { time: "3h", text: "Pulled 3 wins from Local Scout" },
          { time: "yday", text: "Exec asked to expand CRO section" },
        ],
      },
    ],
  },
  {
    id: "technical",
    title: "Technical Scout",
    role: "Crawl & Performance",
    icon: Wrench,
    accent: "from-rose-400 to-red-500",
    activity: "Running Lighthouse on 32 pages",
    status: "Auditing",
    angle: 308.6,
    mission:
      "Keep the crawl clean, the Core Web Vitals green, and the schema valid on every deployed URL.",
    tabs: [
      {
        id: "crawl",
        label: "Crawl Report",
        icon: Cpu,
        summary: "Latest full crawl with status codes, depth, and orphan URLs.",
        metrics: [
          { label: "URLs crawled", value: "1,842" },
          { label: "4xx", value: "9" },
          { label: "5xx", value: "0" },
        ],
        activity: [
          { time: "8m", text: "Crawl finished in 4m 12s" },
          { time: "1h", text: "Discovered 3 new orphan pages" },
          { time: "yday", text: "Reduced avg. depth from 4.2 → 3.8" },
        ],
      },
      {
        id: "cwv",
        label: "Core Web Vitals",
        icon: Gauge,
        summary: "Field + lab CWV across templates.",
        metrics: [
          { label: "LCP p75", value: "2.1s", delta: "good" },
          { label: "CLS p75", value: "0.04" },
          { label: "INP p75", value: "168ms" },
        ],
        activity: [
          { time: "20m", text: "Preloaded hero image on /home" },
          { time: "2h", text: "INP regression on /pricing fixed" },
          { time: "yday", text: "Removed 42kb of unused JS" },
        ],
      },
      {
        id: "schema",
        label: "Schema Validator",
        icon: Braces,
        summary: "Structured data coverage and validation across templates.",
        metrics: [
          { label: "Templates", value: "14" },
          { label: "Errors", value: "0" },
          { label: "Warnings", value: "3" },
        ],
        activity: [
          { time: "14m", text: "Added FAQ schema to 6 service pages" },
          { time: "1h", text: "Fixed missing priceRange on LocalBusiness" },
          { time: "yday", text: "Enabled review snippet on /reviews" },
        ],
      },
      {
        id: "logs",
        label: "Log Analyzer",
        icon: Bug,
        summary: "How Googlebot actually spends its time on the site.",
        metrics: [
          { label: "Bot hits / day", value: "38.2k" },
          { label: "Wasted crawl", value: "6.4%" },
          { label: "Fresh coverage", value: "94%" },
        ],
        activity: [
          { time: "22m", text: "Blocked bot from /filter?* URLs" },
          { time: "1h", text: "Detected re-crawl of stale sitemap" },
          { time: "yday", text: "Server log ingest back online" },
        ],
      },
      {
        id: "redirects",
        label: "Redirects",
        icon: RouteIcon,
        summary: "Redirect graph — no chains, loops, or orphans.",
        metrics: [
          { label: "Rules", value: "184" },
          { label: "Chains", value: "0" },
          { label: "Loops", value: "0" },
        ],
        activity: [
          { time: "18m", text: "Flattened 4 legacy chains" },
          { time: "2h", text: "Added 12 redirects from Q2 URL migration" },
          { time: "yday", text: "Reviewed 302 → 301 candidates" },
        ],
      },
    ],
  },
];

export function getScout(id: string): Scout | undefined {
  return SCOUTS.find((s) => s.id === id);
}
