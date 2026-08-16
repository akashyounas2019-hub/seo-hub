/**
 * Single source of truth for /admin route → human label + section grouping.
 *
 * Both the sidebar (layout.tsx) and the global <Breadcrumbs/> bar import from
 * here so a label is never spelled two different ways. Adding a new page?
 * Drop a row into NAV_SECTIONS (for the sidebar) and/or ROUTE_LABELS (for the
 * breadcrumb trail) — no per-page edits required for wayfinding.
 */

/** A single sidebar link. `icon` is the Icon component's name so this module
 *  stays free of JSX/React imports (it's consumed by a client component too). */
export type NavSectionId = "Scout Team" | "GitHub Cloud SEO" | "System";

export interface NavItem {
  href: string;
  label: string;
  /** Icon component name from "@/components/ui/Icon" (resolved in layout.tsx). */
  icon: string;
  /** Brighter text + accent left-bar in the sidebar. */
  emphasis?: boolean;
  /** Admin-only items are hidden for scoped (worker) users. */
  adminOnly?: boolean;
  /** Numeric badge source key, resolved in layout.tsx ("seo" | "content"). */
  badge?: "seo" | "content";
}

export interface NavSection {
  label: NavSectionId;
  adminOnly?: boolean;
  /** Render the section collapsed by default (click the header to expand).
   *  Used for the rarely-touched "System" group so beginners aren't overwhelmed. */
  defaultCollapsed?: boolean;
  items: NavItem[];
}

/**
 * Pinned top-level items — rendered as fixed links above every section, with
 * no group header and no collapse behavior. Formerly the "Command" section;
 * un-nested per request so these stay always-visible at the top of the sidebar.
 */
export const PINNED_ITEMS: NavItem[] = [
  { href: "/admin/dashboard-overview", label: "Dashboard", icon: "IconHome" },
  { href: "/admin/agency", label: "Agency Health", icon: "IconActivity" },
  { href: "/admin/agent/jobs", label: "Agent Jobs", icon: "IconBolt" },
  { href: "/admin/tasks", label: "Assign Tasks", icon: "IconChecklist" },
  { href: "/admin/automation", label: "Automation", icon: "IconGear" },
  { href: "/admin/suggestions", label: "Suggestions", icon: "IconSparkle" },
  { href: "/admin/analytics", label: "Analytics", icon: "IconChartBar" },
  { href: "/admin/alerts", label: "Alert Manager", icon: "IconBell" },
];

/**
 * The sidebar nav tree. `Inbox` and `My day` are the two "Today" anchors; the
 * root of the dashboard is /admin/inbox (admins) — see DASHBOARD_HREF.
 */
export const NAV_SECTIONS: NavSection[] = [
  // ── Scout Team: every "Scout" area collapses to one landing item here,  ──
  // ── each with its own horizontal sub-tab strip on its landing screen.   ──
  {
    label: "Scout Team",
    adminOnly: true,
    defaultCollapsed: true,
    items: [
      { href: "/admin/scout", label: "Manual Dispatch", icon: "IconBolt" },
      { href: "/admin/keywords", label: "Keyword Scout", icon: "IconChartBar" },
      { href: "/admin/content-studio", label: "Content Scout", icon: "IconSparkle" },
      { href: "/admin/design-research", label: "Designing Scout", icon: "IconImage" },
      { href: "/admin/rubric", label: "GMB Scout", icon: "IconChecklist" },
      { href: "/admin/competitors", label: "Competitor Scout", icon: "IconSearch" },
      { href: "/admin/seo-health", label: "Audit and Reporting Scout", icon: "IconChartBar" },
      { href: "/admin/tech-watchdog", label: "Technical Scout", icon: "IconActivity" },
    ],
  },
  // ── GitHub Cloud SEO: AI-powered SEO analysis suite from claude-seo. ──
  {
    label: "GitHub Cloud SEO",
    adminOnly: true,
    defaultCollapsed: true,
    items: [
      { href: "/admin/cloud-seo", label: "SEO Suite Hub", icon: "IconSearch" },
      { href: "/admin/cloud-seo/audit", label: "Full SEO Audit", icon: "IconSearch" },
      { href: "/admin/cloud-seo/page-analysis", label: "Page Analysis", icon: "IconActivity" },
      { href: "/admin/cloud-seo/technical", label: "Technical SEO", icon: "IconGear" },
      { href: "/admin/cloud-seo/content", label: "Content & E-E-A-T", icon: "IconSparkle" },
      { href: "/admin/cloud-seo/content-brief", label: "Content Brief", icon: "IconChecklist" },
      { href: "/admin/cloud-seo/schema", label: "Schema Markup", icon: "IconBolt" },
      { href: "/admin/cloud-seo/local-seo", label: "Local SEO", icon: "IconGlobe" },
      { href: "/admin/cloud-seo/images", label: "Image SEO", icon: "IconImage" },
      { href: "/admin/cloud-seo/competitor", label: "Competitor Analysis", icon: "IconSearch" },
      { href: "/admin/cloud-seo/sitemap", label: "Sitemap Analysis", icon: "IconChartBar" },
      { href: "/admin/cloud-seo/backlinks", label: "Backlink Analysis", icon: "IconActivity" },
      { href: "/admin/cloud-seo/cluster", label: "Keyword Clustering", icon: "IconChartBar" },
      { href: "/admin/cloud-seo/hreflang", label: "Hreflang Audit", icon: "IconGlobe" },
      { href: "/admin/cloud-seo/seo-plan", label: "SEO Strategy Plan", icon: "IconSparkle" },
      { href: "/admin/cloud-seo/programmatic", label: "Programmatic SEO", icon: "IconBolt" },
      { href: "/admin/cloud-seo/geo", label: "AI & GEO Visibility", icon: "IconGlobe" },
      { href: "/admin/cloud-seo/sxo", label: "Search Experience", icon: "IconActivity" },
      { href: "/admin/cloud-seo/drift", label: "Drift Monitor", icon: "IconChartBar" },
    ],
  },
  // ── Advanced / admin. Collapsed by default so the everyday menu stays calm. ──
  {
    label: "System",
    adminOnly: true,
    defaultCollapsed: true,
    items: [
      { href: "/admin/chat", label: "Assistant", icon: "IconBolt" },
      { href: "/admin/build", label: "Build Agent", icon: "IconSparkle" },
      { href: "/admin/agent/qa", label: "QA Suite", icon: "IconChecklist" },
      { href: "/admin/logs", label: "Logs", icon: "IconActivity" },
      { href: "/admin/settings", label: "Settings", icon: "IconGear" },
    ],
  },
];

/** The dashboard root — first crumb of every trail, and the one page the
 *  breadcrumb bar treats as "home" (no Back / no trail). */
export const DASHBOARD_HREF = "/admin/sites";
export const DASHBOARD_LABEL = "Dashboard";

/**
 * Maps a route SEGMENT (or a full href, for nav items) to a human label.
 *
 * Built once from NAV_SECTIONS plus a handful of segments that only appear as
 * breadcrumb ancestors / leaf pages (settings sub-pages, agent group, etc.).
 * Breadcrumbs.tsx walks the path segment-by-segment and looks each one up;
 * unknown segments fall back to a Title-Cased version of the slug.
 */
const SEGMENT_LABELS: Record<string, string> = {
  // Section parents / group routes that aren't their own nav item.
  admin: DASHBOARD_LABEL,
  agent: "Agent",
  me: "Overview",
  reports: "Reports",
  sites: "Sites",
  keywords: "Keyword Scout",
  "keyword-lists": "Keyword Lists",
  gmb: "GMB",
  "post-generator": "Post Generator",
  "image-generator": "GMB Image Generator",
  content: "Content",
  brief: "Content Writing",
  "site-audit": "Site Audit",
  "design-research": "Design Researcher",
  design: "Page Designer",
  rubric: "Local SEO Rubric",
  local: "Local SEO & GBP",
  "seo-health": "SEO Health",
  seo: "SEO Inbox",
  cwv: "Core Web Vitals",
  "fix-queue": "Fix Queue",
  indexing: "Indexing",
  "dashboard-overview": "Dashboard",
  "keyword-rank-tracker": "Keyword Rank Tracker",
  // New merged screens from SEO OS.
  agency: "Agency Health",
  suggestions: "Suggestions",
  "cold-audit": "Cold Audit",
  "keyword-tracker": "Arabic Keyword Tracker",
  heatmaps: "Local Heatmaps",
  competitors: "Competitor Spy",
  "ai-visibility": "AI Visibility",
  "content-studio": "Content Studio",
  "quality-checker": "Quality Checker",
  citations: "Citation Gaps",
  roi: "ROI & Leads",
  "schema-architect": "Schema Architect",
  "tech-watchdog": "Tech Watchdog",
  "index-tracker": "Index Tracker",
  todo: "To-do List",
  "cloud-seo": "GitHub Cloud SEO",
  "page-analysis": "Page Analysis",
  technical: "Technical SEO",
  "content-brief": "Content Brief",
  "local-seo": "Local SEO",
  images: "Image SEO",
  competitor: "Competitor Analysis",
  backlinks: "Backlink Analysis",
  cluster: "Keyword Clustering",
  hreflang: "Hreflang Audit",
  "seo-plan": "SEO Strategy Plan",
  programmatic: "Programmatic SEO",
  geo: "AI & GEO Visibility",
  sxo: "Search Experience",
  drift: "Drift Monitor",
  analytics: "Analytics",
  "google-analytics": "Google Analytics",
  "search-console": "Search Console",
  "business-profile": "Business Profile",
  // Leaf/utility segments that show up in deeper trails.
  settings: "Settings",
  connect: "Connect a site",
  weekly: "Weekly brief",
  secret: "Worker secret",
  pages: "Pages",
  scores: "Scores",
  qa: "QA run",
  audit: "Audit",
  notifications: "Notifications",
  health: "Network health",
  cohorts: "Cohorts",
  patterns: "Patterns",
  photos: "Photos",
  screenshots: "Screenshots",
  "ranks-ext": "Rank tracking",
};

/** Derive the segment→label map by folding in every nav item's last segment. */
function lastSegment(href: string): string {
  const parts = href.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

const NAV_SEGMENT_LABELS: Record<string, string> = {};
for (const item of PINNED_ITEMS) {
  NAV_SEGMENT_LABELS[lastSegment(item.href)] = item.label;
}
for (const section of NAV_SECTIONS) {
  for (const item of section.items) {
    NAV_SEGMENT_LABELS[lastSegment(item.href)] = item.label;
  }
}

/** Final segment→label lookup. Explicit SEGMENT_LABELS win over nav-derived. */
export const ROUTE_LABELS: Record<string, string> = {
  ...NAV_SEGMENT_LABELS,
  ...SEGMENT_LABELS,
};

/** Section label for a given href, used to insert the section crumb. */
export function sectionForHref(href: string): NavSectionId | null {
  for (const section of NAV_SECTIONS) {
    if (section.items.some((i) => href === i.href || href.startsWith(i.href + "/"))) {
      return section.label;
    }
  }
  return null;
}

/** Title-case a raw slug as the last-resort breadcrumb label. */
export function humanizeSegment(seg: string): string {
  return seg
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** True when a segment looks like a dynamic id/slug (uuid, number, long slug). */
export function looksLikeId(seg: string): boolean {
  if (/^\d+$/.test(seg)) return true; // numeric id
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(seg)) return true; // uuid
  if (/^[0-9a-f]{16,}$/i.test(seg)) return true; // long hex id
  return false;
}
