/**
 * Per-agent WIRED CAPABILITIES map.
 *
 * The Category-1 personas on the Agent Jobs hero (Research Agent, Website
 * Designer, Content Writer, On-Page Expert, Technical Expert, Off-Page Expert,
 * SEO Leader) are still new UI shells without their own dedicated backend
 * execution loop. Meanwhile Categories 2–5 already have working, tested,
 * cost-tracked workflows (Scout Team pages, Cloud SEO tools, backend LLM
 * agents in src/lib/seo-agent*.ts, and the site-generation pipeline).
 *
 * This map is the merge glue: each persona lists the real, wired Category 2–5
 * entry points it "owns". The Agent Jobs hero renders these under the sub-agent
 * chips so the operator can dispatch a persona to work that actually runs.
 *
 * Rules:
 *   - `href` capabilities open a user-facing tool page (Cloud SEO tool or Scout
 *     Team landing). The operator triggers a real job from there.
 *   - `backend` capabilities name a backend LLM agent module (src/lib/seo-agent*).
 *     They surface as "what runs under the hood" documentation; not directly
 *     clickable from the hero — the enclosing tool page dispatches them.
 *
 * When a new persona is added or a Cloud SEO / Scout tool is added, extend
 * this map — do NOT wire it via new sub-agent chips (those come from
 * skill_instructions parsing).
 */

import type { BuiltInAgentId } from "./agent-roster";

export interface Capability {
  /** Human label — shown as a chip on the Agent Jobs hero and profile page. */
  label: string;
  /** Optional route to a working tool page. Prefer this for anything clickable. */
  href?: string;
  /** Optional backend module reference (documentary; not clickable). */
  backend?: string;
  /** One-line description shown in the tooltip / profile page. */
  hint?: string;
}

export const AGENT_CAPABILITIES: Record<BuiltInAgentId, Capability[]> = {
  leader: [
    { label: "Dashboard",            href: "/admin/dashboard-overview",        hint: "Network-wide health + KPI overview — read before planning." },
    { label: "Suggestions",          href: "/admin/suggestions",               hint: "Live ranked actions across the network with category breakdown." },
    { label: "Agent Jobs queue",     href: "/admin/agent/jobs",                hint: "Live queue of dispatched Claude Code jobs — spot > 15 min stuck jobs." },
    { label: "Assign Tasks",         href: "/admin/tasks",                     hint: "Route tasks across the human + agent team." },
    { label: "Manual Dispatch",      href: "/admin/scout",                     hint: "Send a one-off run to any specialist." },
    { label: "GSC Deep-dive",        href: "/admin/gsc",                       hint: "Query + page snapshots by window — plans reference this." },
    { label: "Patterns Inbox",       href: "/admin/patterns",                  hint: "Open cross-site issues awaiting a plan." },
    { label: "SEO Proposals Inbox",  href: "/admin/seo",                       hint: "Proposals from the agent inbox — approve or dismiss." },
    { label: "Agency Health",        href: "/admin/agency-health",             hint: "Score cards + hygiene metrics across every site." },
    { label: "Weekly Reports",       href: "/admin/reports",                   hint: "Weekly PDF reports the auditor should sign off on." },
    { label: "Alerts Manager",       href: "/admin/alerts",                    hint: "Live alerts — escalate any critical." },
    { label: "SEO Strategy Plan",    href: "/admin/cloud-seo/seo-plan",        hint: "Cloud SEO plan synthesis tool — pair with buildPlanContext output." },
    { label: "SEO Suite Hub",        href: "/admin/cloud-seo",                 hint: "Entry to all 20 Cloud SEO tools." },
  ],
  research: [
    { label: "Keyword Scout",        href: "/admin/keywords",                  hint: "Keyword rank tracking + lists." },
    { label: "Competitor Scout",     href: "/admin/competitors",               hint: "Cold audit + competitor teardown." },
    { label: "Keyword Clustering",   href: "/admin/cloud-seo/cluster",         hint: "Group keywords by intent for content planning." },
    { label: "SEO Strategy Plan",    href: "/admin/cloud-seo/seo-plan",        hint: "Cluster + intent map synthesis." },
    { label: "AI & GEO Visibility",  href: "/admin/cloud-seo/geo",             hint: "Track presence in AI overviews + generative results." },
    { label: "Programmatic SEO",     href: "/admin/cloud-seo/programmatic",    hint: "Bulk landing-page ideation from keyword grids." },
    { label: "Competitor Analysis",  href: "/admin/cloud-seo/competitor",      hint: "Structured teardown of a competitor page." },
    { label: "Competitor teardown",  backend: "seo-agent-competitor",           hint: "Opus-driven honest comparison of ours vs theirs." },
  ],
  techseo: [
    // "Website Designer" role (id kept as `techseo` for schema-compat).
    { label: "Build a new site",     href: "/admin/build/new",                 hint: "Full site-generation pipeline (design → sitemap → gates → deploy)." },
    { label: "Design Scout",         href: "/admin/design-research",           hint: "Playwright + vision-LLM segmentation of reference sites." },
    { label: "Brand refresh",        href: "/admin/design",                    hint: "Per-site brand palette + typography extraction." },
    { label: "UI/UX heuristics",     backend: "seo-agent-uiux",                 hint: "Text-based hero-region UX findings." },
    { label: "Page design blob",     backend: "seo-agent-design",               hint: "Natural language → scoped CSS override." },
    { label: "Widget theming",       backend: "widget-theming-agent",           hint: "Booking-widget theme variants + preview + deploy." },
  ],
  blog: [
    // "Content Writer" role.
    { label: "Content Scout",        href: "/admin/content-studio",            hint: "Long-form draft studio + brief builder." },
    { label: "Content Brief",        href: "/admin/cloud-seo/content-brief",   hint: "Search-intent brief with outline + internal links." },
    { label: "Content & E-E-A-T",    href: "/admin/cloud-seo/content",         hint: "Content-quality audit + rewrite plan." },
    { label: "Content quality LLM",  backend: "seo-agent-content",              hint: "Haiku brief → gap + fix recommendation." },
  ],
  onpage: [
    { label: "Page Analysis",        href: "/admin/cloud-seo/page-analysis",   hint: "Head-tags, headings, word count on any URL." },
    { label: "Schema Markup",        href: "/admin/cloud-seo/schema",          hint: "Generate + validate JSON-LD (HouseCleaning, LocalBusiness, FAQ)." },
    { label: "Image SEO",            href: "/admin/cloud-seo/images",          hint: "Alt-text coverage + rewrites." },
    { label: "Hreflang Audit",       href: "/admin/cloud-seo/hreflang",        hint: "Validate EN/AR pair reciprocity across the site." },
    { label: "Local SEO",            href: "/admin/cloud-seo/local-seo",       hint: "NAP consistency + neighbourhood page coverage." },
    { label: "GMB Scout",            href: "/admin/rubric",                    hint: "Runs the Local SEO Rubric scorecard." },
    { label: "Alt-text agent",       backend: "seo-agent",                      hint: "Haiku per-image alt proposals w/ skip-when-decorative." },
    { label: "On-page proposals",    backend: "seo-agent-onpage",               hint: "Title + meta + schema one-shot proposers." },
  ],
  technical: [
    { label: "Technical Scout",      href: "/admin/tech-watchdog",             hint: "CWV monitor, redirect chains, canonicals." },
    { label: "Technical SEO",        href: "/admin/cloud-seo/technical",       hint: "Full technical audit run." },
    { label: "Full SEO Audit",       href: "/admin/cloud-seo/audit",           hint: "Whole-site snapshot across every SEO surface." },
    { label: "Sitemap Analysis",     href: "/admin/cloud-seo/sitemap",         hint: "XML sitemap validation + coverage gaps." },
    { label: "Drift Monitor",        href: "/admin/cloud-seo/drift",           hint: "Detects unexpected shifts in on-page signals." },
    { label: "Audit & Reporting",    href: "/admin/seo-health",                hint: "Weekly report + site-health sweep." },
  ],
  offpage: [
    { label: "Backlink Analysis",    href: "/admin/cloud-seo/backlinks",       hint: "Referring domains, DR distribution, anchor mix." },
    { label: "Citations",            href: "/admin/citations",                 hint: "UAE directory NAP consistency (dubizzle, Yalla.ae, etc.)." },
  ],
  ranktracker: [
    { label: "Keyword Rank Tracker", href: "/admin/keyword-rank-tracker",       hint: "Per-keyword position history + trend line." },
    { label: "GSC Deep-dive",        href: "/admin/gsc",                        hint: "Query + page GSC snapshots by window." },
    { label: "Ranks Sweep",          href: "/admin/keywords",                   hint: "Kick a fresh full-catalogue rank sweep." },
    { label: "AI & GEO Visibility",  href: "/admin/cloud-seo/geo",              hint: "Track AI-overview + generative-search presence." },
    { label: "Competitor Analysis",  href: "/admin/cloud-seo/competitor",       hint: "Snapshot competitor ranks for money keywords." },
    { label: "Index Tracker",        href: "/admin/index-tracker",              hint: "Which pages Google has indexed vs discovered-not-indexed." },
    { label: "Drift Monitor",        href: "/admin/cloud-seo/drift",            hint: "On-page changes that correlate with rank shifts." },
  ],
};

/**
 * Convenience: count of wired capabilities for an agent. Used server-side to
 * decide whether an agent goes on the main hero (>= 1) or the
 * 'Needs configuration' review table (0).
 */
export function capabilityCount(id: string): number {
  return (AGENT_CAPABILITIES as Record<string, Capability[]>)[id]?.length ?? 0;
}
