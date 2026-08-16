import type Anthropic from "@anthropic-ai/sdk";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  buildResearchScreenshots,
  claudeJobs,
  notifications,
  siteBuildPages,
  siteBuildProjects,
  sites,
  siteUsers,
  taskComments,
  tasks,
  taskAudits,
  users,
} from "@/db/schema";
import { suggestAiOverviewImprovements } from "./ai-overview-pass";
import { evaluatePhaseGate } from "./build-gates";
import {
  captureProjectScreenshots,
  enqueueCapturesForProject,
  extractCompetitorUrls,
  publicUrlFor,
} from "./build-screenshot-capture";
import { getLLMClient } from "./llm";
import { getVisibility } from "./permissions";
import { recordAdminAction } from "./audit-log";
import {
  authenticityScore,
  checkEeatSignals,
  pageSkeleton,
  runPublishGauntlet,
  type GauntletReport,
} from "./publish-gauntlet";
import {
  cancelScheduledPublish,
  listProjectSchedule,
  MAX_PUBLISHES_PER_WINDOW,
  nextAllowedSlot,
  schedulePagePublish,
  WINDOW_DAYS,
} from "./publish-scheduler";
import { validateJsonLdString, validateJsonLd } from "./schema-validator";
import {
  captureUrlAtViewports,
  checkUrlAccessibility,
  previewPublicUrl,
  type Viewport,
} from "./url-preview-capture";
import { buildPagePerformanceSnapshots, publishSchedule, siteThemes } from "@/db/schema";
import { extractTheme, type ExtractedTheme } from "./brand-extractor";
import {
  applyThemeToPlugin,
  auditWidgetBrandMatch,
  captureVariantPreview,
  proposeThemeVariants,
  saveThemeRow,
  setPageScopedWidgetTheme,
  type ThemeVariant,
} from "./widget-theming-agent";
import {
  SITE_SECTIONS_BLUEPRINT,
  SECTION_CATEGORY_ORDER,
  SECTION_CATEGORY_LABEL,
  type SectionCategory,
} from "./site-sections-blueprint";
import { notifyTaskCommented, notifyTaskStatusChanged } from "./task-notifications";
import type { User } from "@/db/schema";

const TASK_STATUSES = ["todo", "in_progress", "blocked", "in_review", "done", "cancelled"] as const;
type TaskStatus = (typeof TASK_STATUSES)[number];

/**
 * Read-only tools exposed to the chat assistant. Each one is scoped to the
 * caller's visibility — an admin sees the whole network, a manager sees only
 * the sites they're assigned to. NEVER add mutation tools here without the
 * confirm-then-execute pattern from `shared/agent-design.md`.
 */

async function visibleSiteIds(user: User): Promise<string[] | "all"> {
  const v = await getVisibility(user);
  return v.kind === "all" ? "all" : v.siteIds;
}

export const AI_TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: "list_sites",
    description:
      "List the sites the current user can see, with their slug, name, city, and lead/task counts. Use when the user asks about which sites exist or wants to compare site activity.",
    input_schema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "list_my_tasks",
    description:
      "List tasks visible to the user. Filter by status, priority, assignee, or 'mine' to scope to tasks assigned to the current user.",
    input_schema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["todo", "in_progress", "blocked", "in_review", "done", "cancelled"],
          description: "Optional — restrict to tasks in this status.",
        },
        mine_only: {
          type: "boolean",
          description: "If true, only tasks where the current user is the assignee.",
        },
        limit: {
          type: "integer",
          description: "Max rows. Default 25.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_team_activity",
    description:
      "Summarize who logged in today vs. who didn't, and which users have open tasks. Use when the user asks about presence, absence, or team workload.",
    input_schema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "get_overdue_tasks",
    description:
      "List tasks past their due date that aren't done/cancelled, with assignee and days overdue.",
    input_schema: {
      type: "object",
      properties: {
        min_hours_overdue: {
          type: "integer",
          description: "Only include tasks overdue by at least this many hours. Default 0.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_recent_audits",
    description:
      "Get the most recent AI audit verdicts on tasks (done / partial / not_started / no_show / ambiguous). Useful for 'how is the team doing this week' questions.",
    input_schema: {
      type: "object",
      properties: {
        days: { type: "integer", description: "Look back this many days. Default 7." },
        verdict: {
          type: "string",
          enum: ["done", "partial", "not_started", "no_show", "ambiguous"],
          description: "Optional verdict filter.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "notify_admin",
    description:
      "Drop a flag in the admin's notifications when you've spotted something they should look at (e.g. 'student X has 4 tasks overdue', 'site Y had zero leads this week'). Use sparingly — only when there's a concrete pattern worth surfacing.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short title, 80 chars max." },
        body: { type: "string", description: "1-3 sentence explanation." },
        link: { type: "string", description: "Optional /admin/... path to the relevant page." },
      },
      required: ["title", "body"],
      additionalProperties: false,
    },
  },
  {
    name: "update_task_status",
    description:
      "Move a task to a new status (todo / in_progress / blocked / in_review / done / cancelled). MUTATION TOOL: you MUST call this twice — first with confirm:false (or omitted) to get a preview the user can review, then with confirm:true to actually apply the change. Only allowed for admin, the manager of the site the task is on, or the worker the task is assigned to.",
    input_schema: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "UUID of the task." },
        status: {
          type: "string",
          enum: ["todo", "in_progress", "blocked", "in_review", "done", "cancelled"],
        },
        confirm: { type: "boolean", description: "Set true to execute. Otherwise returns a preview only." },
      },
      required: ["task_id", "status"],
      additionalProperties: false,
    },
  },
  {
    name: "add_task_comment",
    description:
      "Post a comment on a task on behalf of the current user. MUTATION TOOL: call twice (preview, then confirm:true). Only admins, managers of the task's site, and the assigned worker can comment.",
    input_schema: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "UUID of the task." },
        body: { type: "string", description: "Comment text." },
        confirm: { type: "boolean", description: "Set true to execute. Otherwise returns a preview only." },
      },
      required: ["task_id", "body"],
      additionalProperties: false,
    },
  },
  // ─────────── Build-flow tools (chat-driven build agent) ───────────
  {
    name: "list_build_projects",
    description:
      "List active site-build projects (the 'Build a site' workspace). Returns id, business name, domain, current phase, last update. Use when the user mentions a build, asks 'how's that site going', or wants to see all builds in flight.",
    input_schema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "get_build_status",
    description:
      "Get full status of one build project: current phase, all jobs (research + DNA variants + sitemap + pages), their states, and a phase-by-phase progress summary. Use when the user asks about a specific build, wants to know what phase it's at, or asks 'is research done?' / 'are the design variants ready?'.",
    input_schema: {
      type: "object",
      properties: {
        project_id: { type: "string", description: "UUID of the build project." },
      },
      required: ["project_id"],
      additionalProperties: false,
    },
  },
  {
    name: "list_dna_variants",
    description:
      "Return all completed Design DNA variants for a build project. Returns structured signals per variant: extracted palette hex codes, font family, positioning excerpt, hero treatment excerpt, plus markdown_head (first 1500 chars). When the user asks to see or compare designs, you MUST render the actual content from each variant — show the palette hex codes (formatted as visual swatches in your response, e.g. `#1a1a1a` (warm-black) / `#d8a84f` (champagne)), positioning excerpt, font choice, and hero treatment. Do NOT just list variant labels and ask them to pick blind. Each variant has 5000+ chars of real content — extract the meaningful comparison signals and present them in a way that lets the user decide based on actual design direction, not just names.",
    input_schema: {
      type: "object",
      properties: {
        project_id: { type: "string", description: "UUID of the build project." },
      },
      required: ["project_id"],
      additionalProperties: false,
    },
  },
  {
    name: "pick_dna_variant",
    description:
      "Set a specific DNA variant as the chosen design for a build project — writes it to project.design_dna so the next phase (sitemap) uses it. MUTATION TOOL: call twice (preview, then confirm:true).",
    input_schema: {
      type: "object",
      properties: {
        project_id: { type: "string", description: "UUID of the build project." },
        job_id: { type: "string", description: "UUID of the DNA job whose output should become the chosen design." },
        confirm: { type: "boolean", description: "Set true to execute. Otherwise returns a preview." },
      },
      required: ["project_id", "job_id"],
      additionalProperties: false,
    },
  },
  {
    name: "advance_build_phase",
    description:
      "Approve the current phase and advance the build to the next one. Re-runs the phase quality gate first — if it fails AND force is not set, returns the blocking issues so the user can decide. MUTATION TOOL: call twice (preview, then confirm:true).",
    input_schema: {
      type: "object",
      properties: {
        project_id: { type: "string", description: "UUID of the build project." },
        force: { type: "boolean", description: "Force-advance even if gate fails. Override is audit-logged. Default false." },
        confirm: { type: "boolean", description: "Set true to execute. Otherwise returns the gate check + preview of next phase." },
      },
      required: ["project_id"],
      additionalProperties: false,
    },
  },
  {
    name: "view_research",
    description:
      "Return the full research markdown for a build project (the output of the global_research phase). Use when the user wants to read the agent's competitor analysis + market intelligence before approving research.",
    input_schema: {
      type: "object",
      properties: {
        project_id: { type: "string", description: "UUID of the build project." },
      },
      required: ["project_id"],
      additionalProperties: false,
    },
  },
  {
    name: "list_research_competitors",
    description:
      "Extract the actual competitor URLs the research surfaced for a build project, plus a short positioning note per URL. Returns clickable links the user can visit AND a `screenshot_url` per competitor if we've captured one already. Use whenever the user asks 'which sites did you research', 'show me the competitors', 'what market did you analyze', etc. When `screenshot_url` is populated, render it as a Markdown image (`![hostname](screenshot_url)`) so the user sees a real visual preview inline in the chat. If screenshots are missing (`screenshot_status: 'pending'` or 'none'), suggest calling `capture_research_screenshots` to grab them.",
    input_schema: {
      type: "object",
      properties: {
        project_id: { type: "string", description: "UUID of the build project." },
      },
      required: ["project_id"],
      additionalProperties: false,
    },
  },
  {
    name: "capture_research_screenshots",
    description:
      "Fire up headless Chromium and capture screenshots of every competitor URL the research surfaced for a build project. Stores PNGs on disk under the platform's screenshot storage path, served via /api/build/screenshots/[projectId]/[hostname]. Takes 30-90 seconds depending on how many competitors there are (sites are captured sequentially). Returns the count captured + failed + a list of `{hostname, screenshot_url, status}` you can render inline. Call this once per project — subsequent calls only re-capture failed/pending rows unless `force:true`. MUTATION TOOL but the side effect is purely additive (writing files + DB rows), so no preview-then-confirm pattern is required.",
    input_schema: {
      type: "object",
      properties: {
        project_id: { type: "string", description: "UUID of the build project." },
        force: { type: "boolean", description: "Re-capture even hosts already captured. Default false." },
      },
      required: ["project_id"],
      additionalProperties: false,
    },
  },
  {
    name: "list_section_blueprint",
    description:
      "Return the canonical catalog of sections a premium Dubai cleaning-services website should consider — sections grouped by category (hero, quote flow, trust signals, services offered, service areas / Dubai neighborhoods, social proof, info, conversion, footer). Each section has: name, what-to-include checklist, links to live competitor sites that do it well, and common mistakes to avoid. Use when the user asks 'what sections should my site have', 'show me the necessary sections', 'help me plan the site structure'. After showing, ask the user which sections they want — then call pick_sections_for_build with confirm to record their choices.",
    input_schema: {
      type: "object",
      properties: {
        category: {
          type: "string",
          description: "Optional — filter to one category: hero, booking, trust, services, fleet, areas, social_proof, info, conversion, footer. Omit to return all sections.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "pick_sections_for_build",
    description:
      "Record the user's chosen sections for their build project. Stores the list in project.meta.chosen_sections so the sitemap + page generation phases use them. MUTATION TOOL: call twice (preview, then confirm:true).",
    input_schema: {
      type: "object",
      properties: {
        project_id: { type: "string", description: "UUID of the build project." },
        section_keys: {
          type: "array",
          items: { type: "string" },
          description: "Array of section keys the user picked (e.g. ['hero','instant_booking_widget','services_grid',...]).",
        },
        confirm: { type: "boolean", description: "Set true to execute. Otherwise returns a preview of what would be saved." },
      },
      required: ["project_id", "section_keys"],
      additionalProperties: false,
    },
  },
  {
    name: "validate_schema",
    description:
      "Validate a JSON-LD schema block for required fields, type correctness, and Google rich-results eligibility. Covers LocalBusiness, Service, FAQPage, Article, BreadcrumbList, AggregateRating, Review. Returns ok:true|false plus a list of {path, code, message} for each error and warning. Pass the schema as either `jsonld_string` (raw JSON) or `page_id` (we'll pull the schema_ld field from siteBuildPages). Use whenever you generate or review a JSON-LD block, before pushing it live.",
    input_schema: {
      type: "object",
      properties: {
        jsonld_string: {
          type: "string",
          description: "Raw JSON-LD as a string. Either this or page_id is required.",
        },
        page_id: {
          type: "string",
          description: "UUID of a siteBuildPages row — we'll pull `schema_ld` from meta and validate. Either this or jsonld_string is required.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "suggest_ai_overview_improvements",
    description:
      "Audit a generated build page for AI Overview / Perplexity / ChatGPT-browse citability. Returns passages_to_bold (exact substrings to bold for stronger extraction signal), factoids_to_add (citable numbers to insert), missing_faqs (questions the page should answer), rewrite_suggestions (with original + suggested + why), schema_recommendations, overall_grade (weak|fair|strong|exceptional), and one_line_verdict. NEVER auto-applies — show the user the suggestions and let them choose. Use after `build:page_generate` finishes a page or whenever the user asks 'how do we make this page win the AI Overview'.",
    input_schema: {
      type: "object",
      properties: {
        page_id: { type: "string", description: "UUID of the siteBuildPages row to audit." },
      },
      required: ["page_id"],
      additionalProperties: false,
    },
  },
  {
    name: "capture_url_at_viewports",
    description:
      "Capture screenshots of any URL at desktop (1440×900), tablet (768×1024), and/or mobile (375×812) viewports. Uses Playwright headless Chromium. Files stored under SCREENSHOT_STORAGE_PATH/url-previews/<hash>/<viewport>.png and served at /api/preview/url/<hash>/<viewport>.png. Returns a `markdown_image` per viewport — render them inline so the user sees how the page looks across devices. Idempotent — re-running without force returns the cached files. Takes ~5s per viewport. Use for: previewing a deployed build page across devices, checking how a competitor's site renders on mobile, comparing two design variants side-by-side.",
    input_schema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Full URL to capture (must start with http:// or https://)." },
        viewports: {
          type: "array",
          items: { type: "string", enum: ["desktop", "tablet", "mobile"] },
          description: "Which viewports to capture. Defaults to ['desktop','tablet','mobile'] (all three).",
        },
        force: { type: "boolean", description: "Re-capture even if a screenshot exists. Default false." },
      },
      required: ["url"],
      additionalProperties: false,
    },
  },
  {
    name: "check_accessibility",
    description:
      "Run axe-core (the WCAG 2.1 AA validator) against a URL and return the violations list grouped by impact (critical → serious → moderate → minor). Each violation includes: rule id, description, help text, a link to the axe docs, count of affected DOM nodes, sample selector, and sample HTML. Use when reviewing a generated build page before deploy, when a user asks about accessibility, or as part of the quality gate. Takes ~10-15s. Returns worst_impact summary so you can quickly say 'page is clean / has 2 serious issues / has 1 critical'.",
    input_schema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Full URL to check." },
        viewport: {
          type: "string",
          enum: ["desktop", "tablet", "mobile"],
          description: "Viewport to test at. Default 'desktop'. (axe rules are mostly viewport-agnostic but mobile catches a few extra touch-target / contrast issues.)",
        },
      },
      required: ["url"],
      additionalProperties: false,
    },
  },
  // ────────── A — Pre-publish quality gauntlet ──────────
  {
    name: "qualify_page_for_publish",
    description:
      "Run the full pre-publish quality gauntlet on a page: schema validator + EEAT signals + authenticity score + structural variance + AI Overview citability + accessibility + originality (vs top SERP results). Returns verdict ('pass' | 'pass_with_warnings' | 'block'), per-check results, and the top 3 fixes ranked by impact. This is the canonical check that should run before any page is scheduled for publish. Takes ~30-60s because of the external Claude + Playwright + web_search calls. Pass skip_external:true to run just the 4 deterministic checks for fast feedback (~1s). The gauntlet REPORT this returns is stored on the schedule entry when you later call schedule_publish, so the publish-time re-check can compare against it.",
    input_schema: {
      type: "object",
      properties: {
        page_id: { type: "string", description: "UUID of the siteBuildPages row." },
        skip_external: {
          type: "boolean",
          description: "If true, skip the external checks (AI Overview, accessibility, originality) for fast feedback. Default false.",
        },
        live_url: {
          type: "string",
          description: "Optional live URL for the accessibility check (if the page is already deployed somewhere). If unset, accessibility is skipped.",
        },
      },
      required: ["page_id"],
      additionalProperties: false,
    },
  },
  // ────────── B — Staged publish queue ──────────
  {
    name: "schedule_publish",
    description:
      "Schedule a build page to publish at a specific time. Enforces a cadence cap (max 8 publishes per 7-day rolling window per project) to avoid Google's 'scaled content abuse' classifier — the #1 reason new AI-built sites get penalized. If your desired time violates the cap, the tool returns the earliest allowed slot. The cron worker (runs every minute) picks up due rows, re-runs the deterministic gauntlet checks, and pushes to WordPress. MUTATION TOOL — call once to preview cadence verdict, then again with confirm:true to actually schedule.",
    input_schema: {
      type: "object",
      properties: {
        page_id: { type: "string", description: "UUID of the page to schedule." },
        publish_at: {
          type: "string",
          description: "ISO 8601 timestamp when the page should publish (UTC). e.g. '2026-06-01T14:00:00Z'.",
        },
        confirm: { type: "boolean", description: "Set true to actually schedule. Otherwise returns a preview." },
        force: {
          type: "boolean",
          description: "Override the cadence cap. STRONGLY DISCOURAGED — only use when the operator explicitly asks. Default false.",
        },
      },
      required: ["page_id", "publish_at"],
      additionalProperties: false,
    },
  },
  {
    name: "list_publish_schedule",
    description:
      "Show the full publish schedule for a build project — scheduled, publishing, published, failed, cancelled rows in chronological order. Use when the user asks 'what's queued', 'when is X publishing', 'show me the publish timeline'. Include the cadence headroom (how many slots are left in the current 7-day window).",
    input_schema: {
      type: "object",
      properties: {
        project_id: { type: "string", description: "UUID of the build project." },
      },
      required: ["project_id"],
      additionalProperties: false,
    },
  },
  {
    name: "cancel_scheduled_publish",
    description:
      "Cancel a scheduled (not-yet-published) publish entry for a page. MUTATION TOOL — call once to preview, then with confirm:true to execute. Cannot cancel rows that are already 'publishing' (worker is mid-execution) or 'published'.",
    input_schema: {
      type: "object",
      properties: {
        page_id: { type: "string", description: "UUID of the page whose schedule entry to cancel." },
        confirm: { type: "boolean", description: "Set true to execute." },
      },
      required: ["page_id"],
      additionalProperties: false,
    },
  },
  // ────────── C — Post-publish monitoring ──────────
  {
    name: "get_page_performance",
    description:
      "Read all available GSC performance snapshots for a published page (taken at 14, 30, 60, and 90 days post-publish). Returns impressions, clicks, avg position, and verdict ('ok' | 'underperforming' | 'rolled_back' | 'gsc_not_connected') per milestone. Use when the user asks 'how is X doing in search', 'did the new pages rank', 'why did this page get rolled back'. If snapshots are missing (page is < 14d old or GSC isn't connected), report that explicitly.",
    input_schema: {
      type: "object",
      properties: {
        page_id: { type: "string", description: "UUID of the page." },
      },
      required: ["page_id"],
      additionalProperties: false,
    },
  },
  // ────────── D — EEAT signal checker (callable standalone) ──────────
  {
    name: "check_eeat_signals",
    description:
      "Inspect a build page for Experience-Expertise-Authoritativeness-Trustworthiness signals (Google's E-E-A-T framework). Checks: link to About page, author byline, LocalBusiness/Organization JSON-LD schema, structured contact info, industry citation (BBB/GMB/license body). Returns a 0-5 score + the list of missing signals. Pages with score < 4 are blocked by the publish gauntlet — this tool lets you preview EEAT health without running the full gauntlet.",
    input_schema: {
      type: "object",
      properties: {
        page_id: { type: "string", description: "UUID of the page." },
      },
      required: ["page_id"],
      additionalProperties: false,
    },
  },
  // ────────── E — Business facts ──────────
  {
    name: "get_business_facts",
    description:
      "Read the real-world business facts the operator pasted for a project (hourly rates, fleet inventory, real driver names, service-area pickup times, licenses, contact info, aggregate rating, etc.). These get baked into every page-generation prompt. Use to: (1) show the user what's currently stored, (2) identify gaps before bulk page generation, (3) cite specific values in chat answers.",
    input_schema: {
      type: "object",
      properties: {
        project_id: { type: "string", description: "UUID of the build project." },
      },
      required: ["project_id"],
      additionalProperties: false,
    },
  },
  // ────────── New static-site build kickoff ──────────
  {
    name: "start_new_site_kickoff",
    description:
      "Initiate a NEW static-HTML website build for a service business (cleaning services, HVAC, plumbing, contractor, etc.) using the locked 6-phase playbook. Distinct from the WordPress build pipeline (which is for the operator's existing WP portfolio). Returns: the Phase 0 question checklist + pre-filled values from any args the operator supplied + an explicit reminder NOT to write code until Phase 0 is locked. Use whenever the operator says 'build me a new website', 'start a new site for X', 'I want to launch a site for X business', or similar. ALWAYS run this BEFORE doing any of: research, code generation, image generation, hosting setup.",
    input_schema: {
      type: "object",
      properties: {
        business_name: { type: "string", description: "Brand or legal name if the operator already provided it." },
        industry: { type: "string", description: "Business industry: cleaning_services, hvac, plumber, dentist, etc. Default for this platform is cleaning_services (Dubai homes / apartments / villas / offices)." },
        city: { type: "string", description: "Primary service city." },
        domain: { type: "string", description: "Domain if already registered." },
      },
      additionalProperties: false,
    },
  },
  // ────────── Booking widget theming ──────────
  {
    name: "audit_widget_brand_match",
    description:
      "Compare the booking widget (rendered with the current platform theme) against the host site's homepage. Captures both as screenshots, sends to Claude vision to judge whether the widget reads as the same brand or a foreign component. Returns: match_score (0-100), verdict ('match'|'close'|'off'|'mismatch'), one-line descriptions of each, and a recommendation. Use whenever the user asks 'does the booking form match this site' or 'why does the widget look off'.",
    input_schema: {
      type: "object",
      properties: {
        site_slug: { type: "string", description: "Slug of the connected site (from list_sites)." },
      },
      required: ["site_slug"],
      additionalProperties: false,
    },
  },
  {
    name: "extract_and_propose_themes",
    description:
      "Run the brand extractor against the site's live homepage + generate 3 variants (Exact match, Premium serif, Dark luxury). For each variant, render the booking widget mockup with that theme + capture a screenshot. Returns 3 variant objects each with: label, display_name, rationale, theme (palette+fonts+radius), and a markdown_image (Markdown image syntax pointing at the screenshot). Render each markdown_image inline in the chat reply so the operator can visually compare. Then ask which variant they want — call apply_widget_theme with their pick.",
    input_schema: {
      type: "object",
      properties: {
        site_slug: { type: "string", description: "Slug of the connected site." },
      },
      required: ["site_slug"],
      additionalProperties: false,
    },
  },
  {
    name: "apply_widget_theme",
    description:
      "Push a chosen theme to the live WordPress plugin via the signed /seo-apply endpoint. Updates the site_themes row, captures a verification screenshot of how the widget will render with this theme, and stamps applied_at. MUTATION TOOL — call once to preview, then again with confirm:true. Pass EITHER `variant_label` ('exact'|'premium'|'dark_luxury' — uses the most recent extract_and_propose_themes output) OR a full `theme` object you've constructed manually.",
    input_schema: {
      type: "object",
      properties: {
        site_slug: { type: "string", description: "Slug of the connected site." },
        variant_label: {
          type: "string",
          enum: ["exact", "premium", "dark_luxury"],
          description: "Re-extract + pick this variant. Convenient — saves the operator from pasting a full theme JSON.",
        },
        theme: {
          type: "object",
          description: "A full ExtractedTheme object (primary, primary_text, surface, surface_text, accent, border, font_family_body, font_family_heading, border_radius_px, mode). Use when you've manually tweaked a variant.",
          additionalProperties: true,
        },
        confirm: { type: "boolean", description: "Set true to actually push to the plugin." },
      },
      required: ["site_slug"],
      additionalProperties: false,
    },
  },
  {
    name: "set_widget_theme_per_page",
    description:
      "Override widget CSS variables for a single page on a connected site (via the PDO infrastructure — selectors get scoped under body.page-id-<N>). Use when the operator wants the widget to look different on, e.g., the villa-deep-clean page vs the office-cleaning page on the SAME site. The `vars` object maps gyl-* variable names to values, e.g. { '--gyl-accent': '#B08D57', '--gyl-bg': '#0A0A0A' }. MUTATION TOOL — preview, then confirm:true.",
    input_schema: {
      type: "object",
      properties: {
        site_slug: { type: "string", description: "Slug of the connected site." },
        page_id: { type: "integer", description: "WordPress post/page ID on that site (from list_pages / get_seo_inventory)." },
        vars: {
          type: "object",
          description: "Map of CSS variable name → value. Keys should start with --gyl-. Example: { '--gyl-accent': '#D4AF37', '--gyl-radius': '0px' }.",
          additionalProperties: { type: "string" },
        },
        confirm: { type: "boolean", description: "Set true to push to plugin." },
      },
      required: ["site_slug", "page_id", "vars"],
      additionalProperties: false,
    },
  },
  {
    name: "set_business_facts",
    description:
      "Persist real-world business facts onto a build project. These get injected into every build:page_generate prompt so pages cite REAL AED prices, team leads, Dubai neighborhoods, and specific services offered instead of generic cleaning-service prose — the single highest-leverage move against Google flagging AI content as scaled/derivative. Accepts partial updates — only the keys you pass get changed. MUTATION TOOL — preview first, then confirm:true. Schema: { hourly_rates_aed, minimum_hours, services_offered[], team_size, service_areas[], trade_licence, languages_supported[], associations[], aggregate_rating, real_photos[], about_url, contact_phone, contact_email, address }.",
    input_schema: {
      type: "object",
      properties: {
        project_id: { type: "string", description: "UUID of the build project." },
        facts: {
          type: "object",
          description: "Partial update — any subset of the business_facts shape. Pass only the keys you want to change.",
          additionalProperties: true,
        },
        confirm: { type: "boolean", description: "Set true to actually save." },
      },
      required: ["project_id", "facts"],
      additionalProperties: false,
    },
  },
];

async function canActOnTask(user: User, task: { siteId: string; assigneeId: string | null }): Promise<boolean> {
  if (user.role === "admin") return true;
  if (user.role === "manager") {
    const v = await getVisibility(user);
    return v.kind === "all" || v.siteIds.includes(task.siteId);
  }
  // student / worker: must be the assignee
  return task.assigneeId === user.id;
}

export async function runTool(
  user: User,
  name: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  const d = db();
  const scope = await visibleSiteIds(user);

  switch (name) {
    case "list_sites": {
      const rows = await d
        .select({
          slug: sites.slug,
          name: sites.name,
          city: sites.city,
          openTaskCount: sql<number>`(select count(*)::int from tasks where tasks.site_id = sites.id and tasks.status not in ('done','cancelled'))`,
        })
        .from(sites)
        .where(scope === "all" ? undefined : inArray(sites.id, scope))
        .orderBy(sites.slug);
      return { sites: rows };
    }

    case "list_my_tasks": {
      const status = typeof input.status === "string" ? input.status : null;
      const mineOnly = input.mine_only === true;
      const limit = typeof input.limit === "number" ? Math.min(input.limit, 100) : 25;

      const filters = [];
      if (scope !== "all") filters.push(inArray(tasks.siteId, scope));
      if (status) filters.push(eq(tasks.status, status as "todo"));
      if (mineOnly) filters.push(eq(tasks.assigneeId, user.id));

      const rows = await d
        .select({
          id: tasks.id,
          title: tasks.title,
          status: tasks.status,
          priority: tasks.priority,
          dueAt: tasks.dueAt,
          siteSlug: sites.slug,
          assigneeEmail: sql<string | null>`(select email from users where users.id = tasks.assignee_id)`,
        })
        .from(tasks)
        .innerJoin(sites, eq(sites.id, tasks.siteId))
        .where(filters.length ? and(...filters) : undefined)
        .orderBy(desc(tasks.createdAt))
        .limit(limit);
      return { tasks: rows };
    }

    case "get_team_activity": {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      // Users in scope: if scoped, only users assigned to any of those sites; if all, every user.
      let userRows;
      if (scope === "all") {
        userRows = await d
          .select({
            id: users.id,
            email: users.email,
            name: users.name,
            role: users.role,
            lastLoginAt: users.lastLoginAt,
            openTaskCount: sql<number>`(select count(*)::int from tasks where tasks.assignee_id = users.id and tasks.status not in ('done','cancelled'))`,
            overdueCount: sql<number>`(select count(*)::int from tasks where tasks.assignee_id = users.id and tasks.status not in ('done','cancelled') and tasks.due_at < now())`,
          })
          .from(users);
      } else {
        userRows = await d
          .selectDistinct({
            id: users.id,
            email: users.email,
            name: users.name,
            role: users.role,
            lastLoginAt: users.lastLoginAt,
            openTaskCount: sql<number>`(select count(*)::int from tasks where tasks.assignee_id = users.id and tasks.status not in ('done','cancelled'))`,
            overdueCount: sql<number>`(select count(*)::int from tasks where tasks.assignee_id = users.id and tasks.status not in ('done','cancelled') and tasks.due_at < now())`,
          })
          .from(users)
          .innerJoin(siteUsers, eq(siteUsers.userId, users.id))
          .where(inArray(siteUsers.siteId, scope));
      }

      const present = userRows.filter((u) => u.lastLoginAt && u.lastLoginAt >= todayStart);
      const absent = userRows.filter((u) => !u.lastLoginAt || u.lastLoginAt < todayStart);
      return {
        today: todayStart.toISOString().slice(0, 10),
        present_today: present.map((u) => ({
          email: u.email,
          role: u.role,
          open_tasks: u.openTaskCount,
          overdue_tasks: u.overdueCount,
        })),
        absent_today: absent.map((u) => ({
          email: u.email,
          role: u.role,
          last_login: u.lastLoginAt?.toISOString() ?? null,
          open_tasks: u.openTaskCount,
          overdue_tasks: u.overdueCount,
        })),
      };
    }

    case "get_overdue_tasks": {
      const minHours = typeof input.min_hours_overdue === "number" ? input.min_hours_overdue : 0;
      const cutoff = new Date(Date.now() - minHours * 60 * 60 * 1000);

      const filters = [
        sql`${tasks.dueAt} < ${cutoff.toISOString()}::timestamptz`,
        sql`${tasks.status} not in ('done','cancelled')`,
      ];
      if (scope !== "all") filters.push(inArray(tasks.siteId, scope));

      const rows = await d
        .select({
          id: tasks.id,
          title: tasks.title,
          status: tasks.status,
          priority: tasks.priority,
          dueAt: tasks.dueAt,
          siteSlug: sites.slug,
          assigneeEmail: sql<string | null>`(select email from users where users.id = tasks.assignee_id)`,
          hoursOverdue: sql<number>`floor(extract(epoch from (now() - tasks.due_at)) / 3600)::int`,
        })
        .from(tasks)
        .innerJoin(sites, eq(sites.id, tasks.siteId))
        .where(and(...filters))
        .orderBy(desc(sql`extract(epoch from (now() - tasks.due_at))`));
      return { tasks: rows };
    }

    case "get_recent_audits": {
      const days = typeof input.days === "number" ? input.days : 7;
      const verdict = typeof input.verdict === "string" ? input.verdict : null;
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const filters = [gte(taskAudits.runAt, since)];
      if (verdict) filters.push(eq(taskAudits.verdict, verdict as "done"));
      if (scope !== "all") filters.push(inArray(tasks.siteId, scope));

      const rows = await d
        .select({
          id: taskAudits.id,
          taskTitle: tasks.title,
          siteSlug: sites.slug,
          verdict: taskAudits.verdict,
          summary: taskAudits.summary,
          runAt: taskAudits.runAt,
        })
        .from(taskAudits)
        .innerJoin(tasks, eq(tasks.id, taskAudits.taskId))
        .innerJoin(sites, eq(sites.id, tasks.siteId))
        .where(and(...filters))
        .orderBy(desc(taskAudits.runAt))
        .limit(50);
      return { audits: rows };
    }

    case "notify_admin": {
      const title = typeof input.title === "string" ? input.title.slice(0, 200) : "";
      const body = typeof input.body === "string" ? input.body.slice(0, 2000) : "";
      const link = typeof input.link === "string" ? input.link.slice(0, 500) : null;
      if (!title || !body) return { ok: false, reason: "title and body are required" };

      // Notify every admin user in the system.
      const admins = await d.select({ id: users.id }).from(users).where(eq(users.role, "admin"));
      if (admins.length === 0) return { ok: false, reason: "no admin users exist" };
      await d.insert(notifications).values(
        admins.map((a) => ({
          recipientId: a.id,
          kind: "ai_flag",
          title,
          body: body + `\n\n— flagged by the chat assistant on behalf of ${user.email}`,
          link,
        })),
      );
      return { ok: true, notified_admins: admins.length };
    }

    case "update_task_status": {
      const taskId = typeof input.task_id === "string" ? input.task_id : "";
      const status = typeof input.status === "string" ? (input.status as TaskStatus) : ("" as TaskStatus);
      const confirm = input.confirm === true;
      if (!taskId || !TASK_STATUSES.includes(status)) {
        return { ok: false, reason: "invalid task_id or status" };
      }
      const [task] = await d.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
      if (!task) return { ok: false, reason: "task not found" };
      if (!(await canActOnTask(user, task))) {
        return { ok: false, reason: "not authorized to act on this task" };
      }
      // Preview pass: return what would change without mutating. The assistant
      // must echo this back to the human, then call again with confirm:true.
      if (!confirm) {
        return {
          ok: true,
          preview: true,
          requires_confirm: true,
          task: { id: task.id, title: task.title, current_status: task.status },
          proposed: { status },
          message:
            "PREVIEW — no changes made. Show the user what will happen and ask 'shall I apply this?' before calling again with confirm:true.",
        };
      }
      const prevStatus = task.status;
      const completedAt =
        status === "done" || status === "cancelled" ? task.completedAt ?? new Date() : null;
      await d
        .update(tasks)
        .set({ status, completedAt, updatedAt: new Date() })
        .where(eq(tasks.id, taskId));

      if (status !== prevStatus) {
        await notifyTaskStatusChanged({
          taskId,
          taskTitle: task.title,
          newStatus: status,
          actorId: user.id,
        });
      }

      await recordAdminAction({
        actor: user,
        kind: "task.status_change",
        targetType: "task",
        targetId: taskId,
        summary: `Status: ${prevStatus} → ${status} (via assistant)`,
        before: { status: prevStatus },
        after: { status },
      });
      return { ok: true, applied: true, task_id: taskId, previous: prevStatus, status };
    }

    case "add_task_comment": {
      const taskId = typeof input.task_id === "string" ? input.task_id : "";
      const body = typeof input.body === "string" ? input.body.trim() : "";
      const confirm = input.confirm === true;
      if (!taskId || !body) return { ok: false, reason: "task_id and body required" };
      const [task] = await d.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
      if (!task) return { ok: false, reason: "task not found" };
      if (!(await canActOnTask(user, task))) {
        return { ok: false, reason: "not authorized to comment on this task" };
      }
      if (!confirm) {
        return {
          ok: true,
          preview: true,
          requires_confirm: true,
          task: { id: task.id, title: task.title },
          proposed: { body: body.slice(0, 500) },
          message:
            "PREVIEW — no comment posted. Show the proposed comment to the user verbatim, then call again with confirm:true to post.",
        };
      }
      const [inserted] = await d
        .insert(taskComments)
        .values({ taskId, authorId: user.id, body })
        .returning({ id: taskComments.id });

      await notifyTaskCommented({
        taskId,
        taskTitle: task.title,
        commentSnippet: body,
        authorId: user.id,
      });

      await recordAdminAction({
        actor: user,
        kind: "task.comment",
        targetType: "task",
        targetId: taskId,
        summary: `Commented (via assistant): ${body.slice(0, 100)}`,
        after: { commentId: inserted?.id, body: body.slice(0, 500) },
      });
      return { ok: true, applied: true, comment_id: inserted?.id };
    }

    // ─────────── Build-flow tools ───────────

    case "list_build_projects": {
      if (user.role !== "admin") return { error: "Admin-only tool" };
      const rows = await d
        .select({
          id: siteBuildProjects.id,
          slug: siteBuildProjects.slug,
          businessName: siteBuildProjects.businessName,
          domain: siteBuildProjects.domain,
          city: siteBuildProjects.city,
          phase: siteBuildProjects.phase,
          updatedAt: siteBuildProjects.updatedAt,
          createdAt: siteBuildProjects.createdAt,
        })
        .from(siteBuildProjects)
        .orderBy(desc(siteBuildProjects.updatedAt))
        .limit(40);
      return { projects: rows };
    }

    case "get_build_status": {
      if (user.role !== "admin") return { error: "Admin-only tool" };
      const projectId = typeof input.project_id === "string" ? input.project_id : null;
      if (!projectId) return { error: "project_id required" };
      const [project] = await d.select().from(siteBuildProjects).where(eq(siteBuildProjects.id, projectId)).limit(1);
      if (!project) return { error: "Project not found" };

      // All jobs for this project
      const jobs = await d
        .select({
          id: claudeJobs.id,
          kind: claudeJobs.kind,
          title: claudeJobs.title,
          status: claudeJobs.status,
          input: claudeJobs.input,
          createdAt: claudeJobs.createdAt,
          startedAt: claudeJobs.startedAt,
          finishedAt: claudeJobs.finishedAt,
          durationMs: claudeJobs.durationMs,
          error: claudeJobs.error,
        })
        .from(claudeJobs)
        .where(sql`${claudeJobs.input}->>'projectId' = ${projectId}`)
        .orderBy(desc(claudeJobs.createdAt));

      const pages = await d
        .select({
          id: siteBuildPages.id,
          pageSlug: siteBuildPages.pageSlug,
          pageType: siteBuildPages.pageType,
          title: siteBuildPages.title,
          status: siteBuildPages.status,
          seoScore: siteBuildPages.seoScore,
          aiOverviewScore: siteBuildPages.aiOverviewScore,
        })
        .from(siteBuildPages)
        .where(eq(siteBuildPages.projectId, projectId))
        .orderBy(siteBuildPages.sortOrder);

      // Group jobs by kind for a clean summary
      const byKind = new Map<string, typeof jobs>();
      for (const j of jobs) {
        const list = byKind.get(j.kind) ?? [];
        list.push(j);
        byKind.set(j.kind, list);
      }

      // Phase gate evaluation
      const lastJob = jobs[0];
      const gate = evaluatePhaseGate(
        project.phase as Parameters<typeof evaluatePhaseGate>[0],
        project,
        lastJob ? {
          ...lastJob,
          siteId: null,
          input: lastJob.input ?? {},
          status: lastJob.status,
          priority: "normal" as const,
          output: null,
          outputMarkdown: null,
          artifacts: [],
          workerId: null,
          workerInfo: null,
          preferWorker: "any" as const,
          triggerSource: "system" as const,
          tokensInput: null,
          tokensOutput: null,
          durationMs: lastJob.durationMs,
          error: lastJob.error,
          createdBy: null,
          claimedAt: null,
          startedAt: lastJob.startedAt,
          finishedAt: lastJob.finishedAt,
          createdAt: lastJob.createdAt,
        } as Parameters<typeof evaluatePhaseGate>[2] : undefined,
        pages as Parameters<typeof evaluatePhaseGate>[3],
      );

      return {
        project: {
          id: project.id,
          businessName: project.businessName,
          domain: project.domain,
          city: project.city,
          phase: project.phase,
          updatedAt: project.updatedAt,
        },
        jobs_by_phase: Object.fromEntries(
          [...byKind.entries()].map(([k, v]) => [
            k,
            v.map((j) => ({ id: j.id, title: j.title, status: j.status, finishedAt: j.finishedAt, error: j.error })),
          ]),
        ),
        pages_count: pages.length,
        pages_status_breakdown: pages.reduce<Record<string, number>>((acc, p) => {
          acc[p.status] = (acc[p.status] ?? 0) + 1;
          return acc;
        }, {}),
        current_phase_gate: gate,
      };
    }

    case "list_dna_variants": {
      if (user.role !== "admin") return { error: "Admin-only tool" };
      const projectId = typeof input.project_id === "string" ? input.project_id : null;
      if (!projectId) return { error: "project_id required" };
      const variants = await d
        .select({
          id: claudeJobs.id,
          title: claudeJobs.title,
          status: claudeJobs.status,
          input: claudeJobs.input,
          outputMarkdown: claudeJobs.outputMarkdown,
          finishedAt: claudeJobs.finishedAt,
          error: claudeJobs.error,
        })
        .from(claudeJobs)
        .where(
          and(
            eq(claudeJobs.kind, "build:design_dna"),
            sql`${claudeJobs.input}->>'projectId' = ${projectId}`,
          ),
        )
        .orderBy(claudeJobs.createdAt);

      return {
        variants: variants.map((v) => {
          const inp = (v.input ?? {}) as Record<string, unknown>;
          const md = v.outputMarkdown ?? "";

          // Try to extract structured signals from the DNA markdown so the
          // chat agent can present them comparably without dumping 5000 chars
          // per variant. We look for `#rrggbb` hex codes and font-family hints.
          const hexMatches = md.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
          const uniqHex = Array.from(new Set(hexMatches.map((h) => h.toLowerCase()))).slice(0, 10);
          const fontMatch =
            md.match(/font[- ]?family[:\s]+([A-Za-z][A-Za-z0-9 ,'"\-]+)/i) ??
            md.match(/typeface[:\s]+([A-Za-z][A-Za-z0-9 ,'"\-]+)/i);
          const positioningMatch = md.match(/##?\s*positioning[\s\S]*?\n\n([\s\S]*?)(?:\n##|\n#|$)/i);
          const heroMatch = md.match(/##?\s*hero[\s\S]*?\n\n([\s\S]*?)(?:\n##|\n#|$)/i);

          return {
            id: v.id,
            label: typeof inp.variantLabel === "string" ? inp.variantLabel : v.title,
            variant_key: typeof inp.variant === "string" ? inp.variant : null,
            status: v.status,
            finished_at: v.finishedAt,
            error: v.error,
            // Structured extracts so the agent can present compactly + comparably
            palette_hex: uniqHex,
            font_family: fontMatch ? fontMatch[1].trim().slice(0, 80) : null,
            positioning_excerpt: positioningMatch ? positioningMatch[1].trim().slice(0, 300) : null,
            hero_excerpt: heroMatch ? heroMatch[1].trim().slice(0, 300) : null,
            // Full markdown chunked: head + tail so agent has context but isn't drowning
            markdown_head: md.slice(0, 1500),
            markdown_tail: md.length > 1500 ? md.slice(-1500) : "",
            markdown_full_length: md.length,
          };
        }),
      };
    }

    case "pick_dna_variant": {
      if (user.role !== "admin") return { error: "Admin-only tool" };
      const projectId = typeof input.project_id === "string" ? input.project_id : null;
      const jobId = typeof input.job_id === "string" ? input.job_id : null;
      const confirm = input.confirm === true;
      if (!projectId || !jobId) return { error: "project_id and job_id required" };

      const [job] = await d.select().from(claudeJobs).where(eq(claudeJobs.id, jobId)).limit(1);
      if (!job) return { error: "Job not found" };
      if (job.status !== "done") return { error: `Job is ${job.status}, not done — can't pick yet` };
      if (!job.outputMarkdown) return { error: "Job has no markdown output" };

      if (!confirm) {
        return {
          preview: true,
          project_id: projectId,
          job_id: jobId,
          would_set: {
            design_dna: { markdown: job.outputMarkdown, source_job: jobId, variant_label: ((job.input ?? {}) as Record<string, unknown>).variantLabel },
          },
          note: "Call again with confirm:true to commit. This sets project.design_dna so the next phase (sitemap) uses this DNA.",
        };
      }

      await d
        .update(siteBuildProjects)
        .set({
          designDna: {
            markdown: job.outputMarkdown,
            source_job_id: jobId,
            variant_label: ((job.input ?? {}) as Record<string, unknown>).variantLabel ?? null,
          } as Record<string, unknown>,
          updatedAt: new Date(),
        })
        .where(eq(siteBuildProjects.id, projectId));

      await recordAdminAction({
        actor: user,
        kind: "build.dna_picked",
        targetType: "other",
        targetId: projectId,
        summary: `Picked DNA variant via chat: ${((job.input ?? {}) as Record<string, unknown>).variantLabel ?? jobId}`,
        after: { dna_job_id: jobId },
      });
      return { ok: true, applied: true, project_id: projectId, picked_job_id: jobId };
    }

    case "advance_build_phase": {
      if (user.role !== "admin") return { error: "Admin-only tool" };
      const projectId = typeof input.project_id === "string" ? input.project_id : null;
      const force = input.force === true;
      const confirm = input.confirm === true;
      if (!projectId) return { error: "project_id required" };

      const [project] = await d.select().from(siteBuildProjects).where(eq(siteBuildProjects.id, projectId)).limit(1);
      if (!project) return { error: "Project not found" };

      const PHASES = ["brief", "research", "dna", "sitemap", "pages", "review", "deploy", "live"];
      const idx = PHASES.indexOf(project.phase);
      if (idx < 0 || idx >= PHASES.length - 1) return { error: `Project is at terminal phase: ${project.phase}` };
      const nextPhase = PHASES[idx + 1];

      // Get the most recent relevant job for the current phase
      const phaseKindMap: Record<string, string | null> = {
        brief: null,
        research: "build:global_research",
        dna: "build:design_dna",
        sitemap: "build:sitemap_plan",
        pages: "build:page_generate",
        review: "build:quality_review",
      };
      const kind = phaseKindMap[project.phase];
      const [lastJob] = kind
        ? await d
            .select()
            .from(claudeJobs)
            .where(
              and(
                eq(claudeJobs.kind, kind),
                sql`${claudeJobs.input}->>'projectId' = ${projectId}`,
                eq(claudeJobs.status, "done"),
              ),
            )
            .orderBy(desc(claudeJobs.createdAt))
            .limit(1)
        : [undefined];
      const pages = await d
        .select()
        .from(siteBuildPages)
        .where(eq(siteBuildPages.projectId, projectId))
        .orderBy(siteBuildPages.sortOrder);

      const gate = evaluatePhaseGate(
        project.phase as Parameters<typeof evaluatePhaseGate>[0],
        project,
        lastJob,
        pages,
      );

      if (!confirm) {
        return {
          preview: true,
          project_id: projectId,
          current_phase: project.phase,
          next_phase: nextPhase,
          gate,
          would_force: force && !gate.ok,
          note: gate.ok
            ? `Gate passes (${gate.score}/100). Call with confirm:true to advance to ${nextPhase}.`
            : `Gate fails: ${gate.blocking.join("; ")}. Call with force:true and confirm:true to override (audit-logged).`,
        };
      }

      if (!gate.ok && !force) {
        return { error: `Gate fails (score ${gate.score}/100): ${gate.blocking.join("; ")}. Use force:true to override.` };
      }

      await d
        .update(siteBuildProjects)
        .set({ phase: nextPhase, updatedAt: new Date() })
        .where(eq(siteBuildProjects.id, projectId));

      await recordAdminAction({
        actor: user,
        kind: gate.ok ? "build.advance_chat" : "build.advance_force_chat",
        targetType: "other",
        targetId: projectId,
        summary: `Advanced via chat: ${project.phase} → ${nextPhase}${force ? " (forced)" : ""}`,
        after: { gate_score: gate.score, gate_ok: gate.ok, forced: force },
      });

      return {
        ok: true,
        applied: true,
        project_id: projectId,
        from_phase: project.phase,
        to_phase: nextPhase,
        gate_score: gate.score,
        forced: force && !gate.ok,
      };
    }

    case "view_research": {
      if (user.role !== "admin") return { error: "Admin-only tool" };
      const projectId = typeof input.project_id === "string" ? input.project_id : null;
      if (!projectId) return { error: "project_id required" };
      const [project] = await d.select().from(siteBuildProjects).where(eq(siteBuildProjects.id, projectId)).limit(1);
      if (!project) return { error: "Project not found" };
      // Project.research stores the structured output
      const research = project.research as Record<string, unknown> | null;
      if (!research || !research.markdown) {
        // Try job output as fallback
        const [job] = await d
          .select()
          .from(claudeJobs)
          .where(
            and(
              eq(claudeJobs.kind, "build:global_research"),
              sql`${claudeJobs.input}->>'projectId' = ${projectId}`,
              eq(claudeJobs.status, "done"),
            ),
          )
          .orderBy(desc(claudeJobs.createdAt))
          .limit(1);
        if (!job?.outputMarkdown) return { error: "Research not finished yet — check `get_build_status` first." };
        return { markdown: job.outputMarkdown, length: job.outputMarkdown.length, source: "job" };
      }
      return { markdown: research.markdown, length: String(research.markdown).length, source: "project" };
    }

    case "list_research_competitors": {
      if (user.role !== "admin") return { error: "Admin-only tool" };
      const projectId = typeof input.project_id === "string" ? input.project_id : null;
      if (!projectId) return { error: "project_id required" };
      const [project] = await d.select().from(siteBuildProjects).where(eq(siteBuildProjects.id, projectId)).limit(1);
      if (!project) return { error: "Project not found" };

      // Source the research markdown — try project.research first, fall back to job output
      const research = (project.research ?? {}) as Record<string, unknown>;
      let md = typeof research.markdown === "string" ? research.markdown : "";
      if (!md) {
        const [job] = await d
          .select()
          .from(claudeJobs)
          .where(
            and(
              eq(claudeJobs.kind, "build:global_research"),
              sql`${claudeJobs.input}->>'projectId' = ${projectId}`,
              eq(claudeJobs.status, "done"),
            ),
          )
          .orderBy(desc(claudeJobs.createdAt))
          .limit(1);
        md = job?.outputMarkdown ?? "";
      }
      if (!md) return { error: "Research output not available yet" };

      // Extract every external competitor mention (full URLs OR bare hostnames)
      // using the shared helper so chat + CLI capture see the same competitor set.
      const extracted = extractCompetitorUrls(md, { max: 12 });
      const rawCompetitors = extracted.map((c) => {
        // Pull the surrounding paragraph for context (snip ~140 chars around either
        // the bare host or the URL, whichever appears first in the markdown).
        const probe = md.indexOf(c.hostname);
        const fallback = md.indexOf(c.url);
        const idx = probe >= 0 ? probe : fallback >= 0 ? fallback : 0;
        const snippetStart = Math.max(0, idx - 80);
        const snippetEnd = Math.min(md.length, idx + 160);
        const snippet = md.slice(snippetStart, snippetEnd).replace(/\s+/g, " ").trim();
        return { url: c.url, hostname: c.hostname, context: snippet };
      });

      // JOIN with screenshot rows so each competitor includes screenshot_url + status
      const shotRows = rawCompetitors.length
        ? await d
            .select({
              hostname: buildResearchScreenshots.hostname,
              status: buildResearchScreenshots.status,
              bytes: buildResearchScreenshots.bytes,
              error: buildResearchScreenshots.error,
              capturedAt: buildResearchScreenshots.capturedAt,
            })
            .from(buildResearchScreenshots)
            .where(
              and(
                eq(buildResearchScreenshots.projectId, projectId),
                inArray(
                  buildResearchScreenshots.hostname,
                  rawCompetitors.map((c) => c.hostname),
                ),
              ),
            )
        : [];
      const shotByHost = new Map(shotRows.map((r) => [r.hostname, r]));

      const competitors = rawCompetitors.map((c) => {
        const shot = shotByHost.get(c.hostname);
        return {
          url: c.url,
          hostname: c.hostname,
          context: c.context,
          screenshot_status: shot?.status ?? "none",
          screenshot_url: shot?.status === "captured" ? publicUrlFor(projectId, c.hostname) : null,
          screenshot_bytes: shot?.bytes ?? null,
          screenshot_error: shot?.error ?? null,
          screenshot_captured_at: shot?.capturedAt ?? null,
        };
      });

      const capturedCount = competitors.filter((c) => c.screenshot_status === "captured").length;
      const pendingCount = competitors.filter(
        (c) => c.screenshot_status === "pending" || c.screenshot_status === "none",
      ).length;

      return {
        project_id: projectId,
        business_name: project.businessName,
        target_city: project.city,
        competitors_count: competitors.length,
        screenshots_captured: capturedCount,
        screenshots_pending: pendingCount,
        competitors,
        markdown_length: md.length,
        note:
          competitors.length === 0
            ? "Research output exists but no external URLs were extracted — the agent may have summarized findings without naming specific sites."
            : capturedCount === competitors.length
              ? `All ${capturedCount} competitor screenshots are captured. Render each one as a Markdown image (\`![hostname](screenshot_url)\`) followed by the hostname as a clickable link and the positioning context. The user wants to SEE the competitor sites, not just read names.`
              : pendingCount > 0
                ? `${capturedCount}/${competitors.length} screenshots captured. The remaining ${pendingCount} are missing — call \`capture_research_screenshots\` with project_id=${projectId} to grab them. While waiting, you can still show the captured ones inline.`
                : "Show each competitor with its hostname as a clickable link and the positioning context. Where `screenshot_url` is present, render it as a Markdown image inline.",
      };
    }

    case "capture_research_screenshots": {
      if (user.role !== "admin") return { error: "Admin-only tool" };
      const projectId = typeof input.project_id === "string" ? input.project_id : null;
      if (!projectId) return { error: "project_id required" };
      const force = input.force === true;

      const [project] = await d
        .select()
        .from(siteBuildProjects)
        .where(eq(siteBuildProjects.id, projectId))
        .limit(1);
      if (!project) return { error: "Project not found" };

      // 1. Read research markdown + insert pending rows for any new hostnames
      const enq = await enqueueCapturesForProject(projectId);
      if (enq.competitors.length === 0) {
        return {
          error: "No competitor URLs in research output yet. Make sure the global_research phase has finished — call `view_research` to confirm.",
        };
      }

      // 2. Fire Playwright (sequential, ~5s per competitor)
      const result = await captureProjectScreenshots(projectId, { force });

      if (result.total === 0 && enq.enqueued === 0 && enq.alreadyKnown > 0 && !force) {
        // All hosts already captured — re-read the existing rows so we can still return URLs
        const existing = await d
          .select({
            hostname: buildResearchScreenshots.hostname,
            url: buildResearchScreenshots.url,
            status: buildResearchScreenshots.status,
            bytes: buildResearchScreenshots.bytes,
          })
          .from(buildResearchScreenshots)
          .where(eq(buildResearchScreenshots.projectId, projectId));

        await recordAdminAction({
          actor: user,
          kind: "build.screenshots_no_op",
          targetType: "other",
          targetId: projectId,
          summary: `Screenshot capture requested for ${project.businessName} — all ${existing.length} hosts already captured`,
        });

        return {
          ok: true,
          no_op: true,
          message: `All ${existing.length} competitor screenshots already captured. Pass force:true to re-capture.`,
          competitors: existing.map((r) => ({
            hostname: r.hostname,
            url: r.url,
            status: r.status,
            screenshot_url: r.status === "captured" ? publicUrlFor(projectId, r.hostname) : null,
            screenshot_bytes: r.bytes ?? null,
            markdown_image:
              r.status === "captured"
                ? `![${r.hostname}](${publicUrlFor(projectId, r.hostname)})`
                : null,
          })),
        };
      }

      // 3. Build the structured response — each row gets a ready-to-render markdown image
      const captureResults = result.results.map((r) => ({
        hostname: r.hostname,
        url: r.url,
        status: r.status,
        bytes: r.bytes ?? null,
        error: r.error ?? null,
        screenshot_url:
          r.status === "captured" || r.status === "skipped" ? publicUrlFor(projectId, r.hostname) : null,
        markdown_image:
          r.status === "captured" || r.status === "skipped"
            ? `![${r.hostname}](${publicUrlFor(projectId, r.hostname)})`
            : null,
      }));

      await recordAdminAction({
        actor: user,
        kind: "build.screenshots_captured",
        targetType: "other",
        targetId: projectId,
        summary: `Captured ${result.captured}/${result.total} competitor screenshots for ${project.businessName} (${result.failed} failed, ${result.skipped} skipped)`,
        after: {
          total: result.total,
          captured: result.captured,
          failed: result.failed,
          skipped: result.skipped,
          forced: force,
        },
      });

      return {
        ok: true,
        project_id: projectId,
        business_name: project.businessName,
        enqueued_new: enq.enqueued,
        already_known: enq.alreadyKnown,
        total: result.total,
        captured: result.captured,
        failed: result.failed,
        skipped: result.skipped,
        competitors: captureResults,
        note:
          result.captured === 0
            ? `No screenshots were captured. ${result.failed} failed — likely Playwright is not installed on the server or hosts are unreachable. Show the user the failure reasons from the \`error\` field per row.`
            : `Captured ${result.captured} screenshots. Render each one inline as a Markdown image using the \`markdown_image\` field (one per host), followed by the hostname as a clickable link. The user explicitly asked to SEE the competitor sites — show the actual PNGs inline, do not just list hostnames.`,
      };
    }

    case "list_section_blueprint": {
      if (user.role !== "admin") return { error: "Admin-only tool" };
      const filterCat = typeof input.category === "string" ? (input.category as SectionCategory) : null;
      const filtered = filterCat
        ? SITE_SECTIONS_BLUEPRINT.filter((s) => s.category === filterCat)
        : SITE_SECTIONS_BLUEPRINT;
      // Group by category for cleaner agent presentation
      const groups = SECTION_CATEGORY_ORDER.map((cat) => ({
        category: cat,
        category_label: SECTION_CATEGORY_LABEL[cat],
        sections: filtered.filter((s) => s.category === cat),
      })).filter((g) => g.sections.length > 0);
      return {
        total_sections: filtered.length,
        priority_1_count: filtered.filter((s) => s.priority === 1).length,
        priority_2_count: filtered.filter((s) => s.priority === 2).length,
        priority_3_count: filtered.filter((s) => s.priority === 3).length,
        groups,
        note:
          "When showing this to the user, render each section as: name (priority badge), description, key 'must include' bullets (top 3-4), and the reference URLs as clickable Markdown links so they can visit live examples. Group by category. After showing, ASK the user which sections they want — then call `pick_sections_for_build` with the chosen keys.",
      };
    }

    case "pick_sections_for_build": {
      if (user.role !== "admin") return { error: "Admin-only tool" };
      const projectId = typeof input.project_id === "string" ? input.project_id : null;
      const sectionKeys = Array.isArray(input.section_keys)
        ? (input.section_keys.filter((k) => typeof k === "string") as string[])
        : null;
      const confirm = input.confirm === true;
      if (!projectId) return { error: "project_id required" };
      if (!sectionKeys || sectionKeys.length === 0) return { error: "section_keys must be a non-empty array" };

      // Validate every key exists in the catalog
      const validKeys = new Set(SITE_SECTIONS_BLUEPRINT.map((s) => s.key));
      const unknown = sectionKeys.filter((k) => !validKeys.has(k));
      if (unknown.length > 0) {
        return {
          error: `Unknown section keys: ${unknown.join(", ")}. Valid keys: ${[...validKeys].join(", ")}`,
        };
      }

      const [project] = await d.select().from(siteBuildProjects).where(eq(siteBuildProjects.id, projectId)).limit(1);
      if (!project) return { error: "Project not found" };

      if (!confirm) {
        return {
          preview: true,
          project_id: projectId,
          would_save: {
            chosen_sections: sectionKeys,
            count: sectionKeys.length,
          },
          note: "Call again with confirm:true to commit. These section keys are persisted on project.meta and used by the sitemap + page-generation phases.",
        };
      }

      // Merge into project.meta (jsonb field).
      const meta = ((project as unknown as Record<string, unknown>).meta as Record<string, unknown> | null) ?? {};
      const newMeta = { ...meta, chosen_sections: sectionKeys, chosen_sections_at: new Date().toISOString() };
      await d
        .update(siteBuildProjects)
        .set({
          // The `meta` field may not exist on this table — we write to `research`
          // as a fallback since it's a jsonb the schema definitely has. We use
          // a dedicated key so we don't clobber the research markdown.
          research: {
            ...((project.research ?? {}) as Record<string, unknown>),
            chosen_sections: sectionKeys,
            chosen_sections_at: new Date().toISOString(),
          },
          updatedAt: new Date(),
        })
        .where(eq(siteBuildProjects.id, projectId));

      await recordAdminAction({
        actor: user,
        kind: "build.sections_picked",
        targetType: "other",
        targetId: projectId,
        summary: `Picked ${sectionKeys.length} site sections via chat`,
        after: { sections: sectionKeys },
      });

      void newMeta;
      return { ok: true, applied: true, project_id: projectId, chosen_sections: sectionKeys };
    }

    case "validate_schema": {
      if (user.role !== "admin") return { error: "Admin-only tool" };
      const jsonldString = typeof input.jsonld_string === "string" ? input.jsonld_string : null;
      const pageId = typeof input.page_id === "string" ? input.page_id : null;

      if (jsonldString) {
        const result = validateJsonLdString(jsonldString);
        return {
          source: "string" as const,
          type: result.type,
          ok: result.ok,
          error_count: result.ok ? 0 : result.errors.length,
          warning_count: result.warnings.length,
          errors: result.ok ? [] : result.errors,
          warnings: result.warnings,
          note: result.ok
            ? result.warnings.length > 0
              ? `Schema is structurally valid but has ${result.warnings.length} warning(s) — surface them so the user can decide whether to fix.`
              : "Schema is clean. Safe to ship."
            : `Schema has ${result.errors.length} structural error(s). Present each {path, message} to the user — these block rich-results eligibility.`,
        };
      }

      if (pageId) {
        const [page] = await d.select().from(siteBuildPages).where(eq(siteBuildPages.id, pageId)).limit(1);
        if (!page) return { error: "Page not found" };
        // schemaJson is an array of @type blocks (LocalBusiness, FAQPage, etc.)
        const blocks = Array.isArray(page.schemaJson) ? page.schemaJson : [];
        if (blocks.length === 0) {
          return {
            error: "Page has no schemaJson — generation may have skipped schema. Re-run page generation or add schema manually.",
          };
        }
        const blockResults = blocks.map((b, i) => {
          const res = validateJsonLd(b);
          return { index: i, ...res };
        });
        const totalErrors = blockResults.reduce((n, r) => n + (r.ok ? 0 : r.errors.length), 0);
        const totalWarnings = blockResults.reduce((n, r) => n + r.warnings.length, 0);
        const ok = totalErrors === 0;
        return {
          source: "page" as const,
          page_id: pageId,
          page_title: page.title,
          schema_block_count: blocks.length,
          types: blockResults.map((r) => r.type),
          ok,
          error_count: totalErrors,
          warning_count: totalWarnings,
          per_block: blockResults,
          note: ok
            ? totalWarnings > 0
              ? `All ${blocks.length} schema blocks valid, ${totalWarnings} warning(s). List the warnings so the user can decide whether to fix.`
              : `All ${blocks.length} schema blocks clean. Safe to ship.`
            : `${totalErrors} structural error(s) across ${blocks.length} schema block(s). Surface each error grouped by block index + @type.`,
        };
      }

      return { error: "Either jsonld_string or page_id is required" };
    }

    case "suggest_ai_overview_improvements": {
      if (user.role !== "admin") return { error: "Admin-only tool" };
      const pageId = typeof input.page_id === "string" ? input.page_id : null;
      if (!pageId) return { error: "page_id required" };

      const [page] = await d.select().from(siteBuildPages).where(eq(siteBuildPages.id, pageId)).limit(1);
      if (!page) return { error: "Page not found" };
      const body = typeof page.bodyMarkdown === "string" ? page.bodyMarkdown : "";
      if (!body) return { error: "Page has no bodyMarkdown — generate it first" };

      const [project] = await d
        .select()
        .from(siteBuildProjects)
        .where(eq(siteBuildProjects.id, page.projectId))
        .limit(1);
      if (!project) return { error: "Parent build project not found" };

      // Pull the generating job to recover targetKeyword + aiOverviewAngle
      // (these were inputs to build:page_generate, not stored on the page row).
      let targetKeyword = page.title;
      let aiOverviewAngle = "";
      if (page.jobId) {
        const [job] = await d.select().from(claudeJobs).where(eq(claudeJobs.id, page.jobId)).limit(1);
        const jobInput = (job?.input ?? {}) as Record<string, unknown>;
        if (typeof jobInput.targetKeyword === "string") targetKeyword = jobInput.targetKeyword;
        if (typeof jobInput.aiOverviewAngle === "string") aiOverviewAngle = jobInput.aiOverviewAngle;
      }

      const { client, model } = await getLLMClient({ tier: "heavy" });
      const suggestions = await suggestAiOverviewImprovements(client, {
        pageBodyMarkdown: body,
        metaTitle: page.metaTitle ?? page.title,
        metaDescription: page.metaDescription ?? "",
        targetKeyword: targetKeyword || page.title,
        aiOverviewAngle,
        businessName: project.businessName,
        targetCity: project.city ?? "",
        model,
      });

      await recordAdminAction({
        actor: user,
        kind: "build.ai_overview_pass",
        targetType: "other",
        targetId: pageId,
        summary: `AI Overview citability pass on "${page.title ?? pageId}" — grade ${suggestions.overall_grade}`,
        after: {
          grade: suggestions.overall_grade,
          passages: suggestions.passages_to_bold.length,
          factoids: suggestions.factoids_to_add.length,
          faqs: suggestions.missing_faqs.length,
          rewrites: suggestions.rewrite_suggestions.length,
        },
      });

      return {
        ok: true,
        page_id: pageId,
        page_title: page.title,
        ...suggestions,
        note: `Render each section as: (1) Bold-these passages — show snippet + rationale; (2) Add these factoids — show fact + placement; (3) Missing FAQs — present as a checklist the user can pick from; (4) Rewrite suggestions — show original vs suggested side by side; (5) Schema recs as bullets. NEVER auto-apply.`,
      };
    }

    case "capture_url_at_viewports": {
      if (user.role !== "admin") return { error: "Admin-only tool" };
      const url = typeof input.url === "string" ? input.url : null;
      if (!url || !/^https?:\/\//.test(url)) return { error: "url required (must start with http:// or https://)" };
      const allowedVps: Viewport[] = ["desktop", "tablet", "mobile"];
      const vps: Viewport[] = Array.isArray(input.viewports)
        ? (input.viewports.filter((v): v is Viewport => typeof v === "string" && allowedVps.includes(v as Viewport)))
        : ["desktop", "tablet", "mobile"];
      const force = input.force === true;
      if (vps.length === 0) return { error: "viewports must include at least one of desktop|tablet|mobile" };

      const { results } = await captureUrlAtViewports(url, vps, { force });

      return {
        url,
        viewports_requested: vps,
        results: results.map((r) => ({
          ...r,
          markdown_image: r.publicUrl ? `![${url} · ${r.viewport}](${r.publicUrl})` : null,
        })),
        note:
          results.every((r) => r.status === "failed")
            ? "All viewports failed. Surface the per-viewport error to the user."
            : "Render each viewport's `markdown_image` inline so the user sees the responsive comparison. Label them clearly: 'Desktop 1440×900', 'Tablet 768×1024', 'Mobile 375×812'.",
      };
    }

    case "check_accessibility": {
      if (user.role !== "admin") return { error: "Admin-only tool" };
      const url = typeof input.url === "string" ? input.url : null;
      if (!url || !/^https?:\/\//.test(url)) return { error: "url required (must start with http:// or https://)" };
      const allowedVps: Viewport[] = ["desktop", "tablet", "mobile"];
      const viewport: Viewport =
        typeof input.viewport === "string" && allowedVps.includes(input.viewport as Viewport)
          ? (input.viewport as Viewport)
          : "desktop";

      const result = await checkUrlAccessibility(url, viewport);
      if (result.error) {
        return { ok: false, error: result.error, url, viewport };
      }
      const counts: Record<string, number> = {};
      for (const v of result.violations) {
        const k = v.impact ?? "unknown";
        counts[k] = (counts[k] ?? 0) + 1;
      }

      // Also capture a screenshot so the agent can show the user *where*
      // the violations are. Best-effort, runs in parallel with response shaping.
      // Use cached screenshot if present.
      const previewUrl = previewPublicUrl(url, viewport);

      return {
        ok: true,
        url,
        viewport,
        passes: result.passes,
        incomplete: result.incomplete,
        violation_count: result.violations.length,
        worst_impact: result.worst_impact,
        by_impact: counts,
        violations: result.violations,
        preview_screenshot_url: previewUrl,
        note:
          result.violations.length === 0
            ? `Clean — ${result.passes} axe rules passed at ${viewport}. Tell the user the page is accessible. (If you also want a screenshot, call capture_url_at_viewports for visual confirmation.)`
            : `Found ${result.violations.length} violation(s), worst impact ${result.worst_impact}. Present them grouped by impact (critical → serious → moderate → minor) with the help_url so the user can read the axe rule explanation. Suggest the highest-impact fix first.`,
      };
    }

    // ────────── A — Quality gauntlet ──────────
    case "qualify_page_for_publish": {
      if (user.role !== "admin") return { error: "Admin-only tool" };
      const pageId = typeof input.page_id === "string" ? input.page_id : null;
      if (!pageId) return { error: "page_id required" };
      const skipExternal = input.skip_external === true;
      const liveUrl = typeof input.live_url === "string" ? input.live_url : undefined;

      let report: GauntletReport;
      try {
        report = await runPublishGauntlet(pageId, { skipExternal, liveUrl });
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
      }

      await recordAdminAction({
        actor: user,
        kind: "build.gauntlet_run",
        targetType: "other",
        targetId: pageId,
        summary: `Gauntlet on "${report.page_title}" — verdict ${report.verdict} (${report.block_count} block, ${report.warn_count} warn, ${report.pass_count} pass)`,
        after: {
          verdict: report.verdict,
          checks: report.checks.map((c) => ({ name: c.name, status: c.status })),
        },
      });

      return {
        ...report,
        note:
          report.verdict === "block"
            ? "Page is BLOCKED from publish. Surface every blocked check with its `summary` and the `top_fixes` list. Tell the user explicitly why this can't go live yet."
            : report.verdict === "pass_with_warnings"
              ? "Page CAN publish but has warnings. Show the warnings and ask the user if they want to fix first or proceed as-is."
              : "Page is clean across every check. Safe to schedule via schedule_publish.",
      };
    }

    // ────────── B — Publish queue ──────────
    case "schedule_publish": {
      if (user.role !== "admin") return { error: "Admin-only tool" };
      const pageId = typeof input.page_id === "string" ? input.page_id : null;
      const publishAtStr = typeof input.publish_at === "string" ? input.publish_at : null;
      if (!pageId) return { error: "page_id required" };
      if (!publishAtStr) return { error: "publish_at required (ISO 8601 UTC)" };
      const publishAt = new Date(publishAtStr);
      if (isNaN(publishAt.getTime())) return { error: "publish_at must be valid ISO 8601" };
      const confirm = input.confirm === true;
      const force = input.force === true;

      const [page] = await d.select().from(siteBuildPages).where(eq(siteBuildPages.id, pageId)).limit(1);
      if (!page) return { error: "Page not found" };

      const slot = await nextAllowedSlot(page.projectId, publishAt);
      if (!confirm) {
        return {
          preview: true,
          page_id: pageId,
          page_title: page.title,
          requested_publish_at: publishAt.toISOString(),
          cadence_status: slot.allowed ? "within_cap" : "blocked",
          resolved_publish_at: slot.resolvedAt.toISOString(),
          cap: `${MAX_PUBLISHES_PER_WINDOW} publishes per ${WINDOW_DAYS}-day rolling window per project`,
          reason: slot.reason,
          note: slot.allowed
            ? `Cadence ok. Call again with confirm:true to actually schedule. Page will publish at ${publishAt.toISOString()}.`
            : `Cadence cap blocks publish at the requested time. Earliest available: ${slot.resolvedAt.toISOString()}. Either pick a later time, or override with force:true (DISCOURAGED — Google penalty risk).`,
        };
      }

      const result = await schedulePagePublish({
        pageId,
        scheduledAt: publishAt,
        force,
        createdBy: user.id,
      });
      if (!result.ok) {
        return {
          ok: false,
          cadence_blocked: result.cadence_blocked === true,
          next_slot: result.next_slot,
          reason: result.reason,
        };
      }

      await recordAdminAction({
        actor: user,
        kind: result.rescheduled ? "build.publish_rescheduled" : "build.publish_scheduled",
        targetType: "other",
        targetId: pageId,
        summary: `${result.rescheduled ? "Rescheduled" : "Scheduled"} "${page.title}" for ${publishAt.toISOString()}`,
        after: { forced: force },
      });

      return {
        ok: true,
        rescheduled: result.rescheduled === true,
        page_id: pageId,
        page_title: page.title,
        scheduled_at: publishAt.toISOString(),
        cadence_note: result.reason,
      };
    }

    case "list_publish_schedule": {
      if (user.role !== "admin") return { error: "Admin-only tool" };
      const projectId = typeof input.project_id === "string" ? input.project_id : null;
      if (!projectId) return { error: "project_id required" };
      const rows = await listProjectSchedule(projectId);
      const now = new Date();
      const inWindow = rows.filter(
        (r) =>
          (r.status === "scheduled" || r.status === "publishing" || r.status === "published") &&
          r.scheduledAt.getTime() >= now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000 &&
          r.scheduledAt.getTime() <= now.getTime(),
      );
      const queued = rows.filter((r) => r.status === "scheduled");
      const published = rows.filter((r) => r.status === "published");

      return {
        project_id: projectId,
        total_rows: rows.length,
        in_current_window: inWindow.length,
        window_cap: MAX_PUBLISHES_PER_WINDOW,
        headroom_in_window: Math.max(0, MAX_PUBLISHES_PER_WINDOW - inWindow.length),
        queued_count: queued.length,
        published_count: published.length,
        rows,
        note:
          rows.length === 0
            ? "No publish schedule entries yet — call schedule_publish to queue a page."
            : `Queued: ${queued.length} | Published: ${published.length} | Window headroom: ${Math.max(0, MAX_PUBLISHES_PER_WINDOW - inWindow.length)}/${MAX_PUBLISHES_PER_WINDOW}. Render the rows as a chronological list (scheduled_at · title · status).`,
      };
    }

    case "cancel_scheduled_publish": {
      if (user.role !== "admin") return { error: "Admin-only tool" };
      const pageId = typeof input.page_id === "string" ? input.page_id : null;
      if (!pageId) return { error: "page_id required" };
      const confirm = input.confirm === true;

      const [page] = await d.select().from(siteBuildPages).where(eq(siteBuildPages.id, pageId)).limit(1);
      if (!page) return { error: "Page not found" };

      if (!confirm) {
        const [entry] = await d.select().from(publishSchedule).where(eq(publishSchedule.pageId, pageId)).limit(1);
        return {
          preview: true,
          would_cancel: !!entry && entry.status === "scheduled",
          current_status: entry?.status ?? null,
          scheduled_at: entry?.scheduledAt?.toISOString() ?? null,
          note: !entry
            ? "No schedule entry — nothing to cancel."
            : entry.status === "scheduled"
              ? "Call again with confirm:true to cancel."
              : `Cannot cancel — current status is '${entry.status}'.`,
        };
      }

      const res = await cancelScheduledPublish(pageId);
      if (res.ok) {
        await recordAdminAction({
          actor: user,
          kind: "build.publish_cancelled",
          targetType: "other",
          targetId: pageId,
          summary: `Cancelled scheduled publish for "${page.title}"`,
        });
      }
      return res;
    }

    // ────────── C — Performance monitoring ──────────
    case "get_page_performance": {
      if (user.role !== "admin") return { error: "Admin-only tool" };
      const pageId = typeof input.page_id === "string" ? input.page_id : null;
      if (!pageId) return { error: "page_id required" };

      const [page] = await d.select().from(siteBuildPages).where(eq(siteBuildPages.id, pageId)).limit(1);
      if (!page) return { error: "Page not found" };

      const snapshots = await d
        .select()
        .from(buildPagePerformanceSnapshots)
        .where(eq(buildPagePerformanceSnapshots.pageId, pageId))
        .orderBy(buildPagePerformanceSnapshots.daysSincePublish);

      const ageDays = page.publishedAt
        ? Math.floor((Date.now() - page.publishedAt.getTime()) / (1000 * 60 * 60 * 24))
        : null;

      // Expected milestones we should have by now
      const milestones = [14, 30, 60, 90];
      const expected = ageDays !== null ? milestones.filter((m) => m <= ageDays) : [];
      const present = new Set(snapshots.map((s) => s.daysSincePublish));
      const missing = expected.filter((m) => !present.has(m));

      return {
        page_id: pageId,
        page_title: page.title,
        page_status: page.status,
        published_at: page.publishedAt?.toISOString() ?? null,
        age_days: ageDays,
        snapshot_count: snapshots.length,
        snapshots,
        expected_milestones: expected,
        missing_milestones: missing,
        note:
          ageDays === null
            ? "Page hasn't been published yet — no snapshots."
            : missing.length > 0
              ? `Missing snapshots for ${missing.join(", ")}-day milestone(s). The cron runs daily at 04:30 UTC — if a milestone is missing, GSC is likely not connected for the parent site. Connect at /admin/sites/[slug]/integrations.`
              : snapshots.some((s) => s.verdict === "rolled_back")
                ? "Page was AUTO-ROLLED-BACK due to chronic underperformance. Re-audit with suggest_ai_overview_improvements and consider rewriting before re-publishing."
                : snapshots.some((s) => s.verdict === "underperforming")
                  ? "Page is UNDERPERFORMING. Run suggest_ai_overview_improvements to identify gaps."
                  : "All snapshots clean — page is performing as expected.",
      };
    }

    // ────────── D — EEAT standalone ──────────
    case "check_eeat_signals": {
      if (user.role !== "admin") return { error: "Admin-only tool" };
      const pageId = typeof input.page_id === "string" ? input.page_id : null;
      if (!pageId) return { error: "page_id required" };
      const [page] = await d.select().from(siteBuildPages).where(eq(siteBuildPages.id, pageId)).limit(1);
      if (!page) return { error: "Page not found" };
      const body = page.bodyMarkdown ?? "";
      if (!body) return { error: "Page has no bodyMarkdown" };
      const schemaJson = Array.isArray(page.schemaJson) ? page.schemaJson : [];

      const eeat = checkEeatSignals(body, schemaJson);
      const auth = authenticityScore(body);
      const skeleton = pageSkeleton(body);

      return {
        page_id: pageId,
        page_title: page.title,
        eeat_score: eeat.score,
        eeat_signals: eeat,
        authenticity: auth,
        skeleton_fingerprint_length: skeleton.length,
        note:
          eeat.score < 4
            ? `EEAT score ${eeat.score}/5 — blocked by gauntlet. Missing: ${eeat.missing.join(", ")}. Add these before scheduling publish.`
            : `EEAT score ${eeat.score}/5 — passes. Authenticity ${auth.per_1k_words}/1k words.`,
      };
    }

    // ────────── E — Business facts ──────────
    case "get_business_facts": {
      if (user.role !== "admin") return { error: "Admin-only tool" };
      const projectId = typeof input.project_id === "string" ? input.project_id : null;
      if (!projectId) return { error: "project_id required" };
      const [project] = await d.select().from(siteBuildProjects).where(eq(siteBuildProjects.id, projectId)).limit(1);
      if (!project) return { error: "Project not found" };

      const facts = (project.businessFacts ?? {}) as Record<string, unknown>;
      const recommended = ["hourly_rates", "minimum_hours", "fleet", "drivers", "service_areas", "licenses", "associations", "aggregate_rating", "contact_phone", "address", "about_url"];
      const present = recommended.filter((k) => k in facts && facts[k] != null && (Array.isArray(facts[k]) ? (facts[k] as unknown[]).length > 0 : true));
      const missing = recommended.filter((k) => !present.includes(k));

      return {
        project_id: projectId,
        business_name: project.businessName,
        facts,
        completeness: `${present.length}/${recommended.length}`,
        present_keys: present,
        missing_keys: missing,
        note:
          missing.length > 0
            ? `Missing facts: ${missing.join(", ")}. These should be pasted in BEFORE running page generation — they're the #1 anti-generic signal. Suggest the operator runs set_business_facts with the values.`
            : "All recommended facts present. Page generation will bake real data into every page.",
      };
    }

    // ────────── New static-site build kickoff ──────────
    case "start_new_site_kickoff": {
      if (user.role !== "admin") return { error: "Admin-only tool" };
      const businessName = typeof input.business_name === "string" ? input.business_name : null;
      const industry = typeof input.industry === "string" ? input.industry : null;
      const city = typeof input.city === "string" ? input.city : null;
      const domain = typeof input.domain === "string" ? input.domain : null;

      await recordAdminAction({
        actor: user,
        kind: "site.kickoff_started",
        targetType: "other",
        targetId: businessName ?? "new",
        summary: `Kickoff: ${businessName ?? "(unnamed)"} · ${industry ?? "(industry?)"} · ${city ?? "(city?)"}`,
        after: { businessName, industry, city, domain },
      });

      return {
        phase: 0,
        playbook: "static-site-build-playbook",
        pre_filled: { business_name: businessName, industry, city, domain },
        phase_0_questions: [
          {
            key: "business_basics",
            ask: "Business basics — what's the legal name (if different from brand name)? Phone? Email? Physical address (or 'service-area business' if no fixed street)? Founding year?",
            why: "These go into the company object in data.js + every LocalBusiness JSON-LD block + the contact page.",
          },
          {
            key: "brand_vibe",
            ask: "Brand vibe + palette — give me 3 specific hex colors (primary, surface/background, accent), one serif heading font + one sans body font, and a single vibe word (luxury / rugged / minimal / premium / approachable).",
            why: "These get baked into the build's CSS variables + the OG-image generator + the heading typography. Lock now or pay later.",
          },
          {
            key: "services",
            ask: "Service list — 6 to 10 services with a 1-line description each (e.g. 'Villa Deep Clean — 60-point checklist, eco products, same-day AED quote').",
            why: "One page per service. Each gets a focus keyword + 8-10 FAQs + schema.org/Service JSON-LD + internal links to every service area.",
          },
          {
            key: "service_areas",
            ask: "Service areas — every city/town/neighborhood/county served. Be exhaustive — 'we'll add more later' = SEO landmines.",
            why: "One page per area. Internal-linking matrix needs the full list locked before generation starts.",
          },
          {
            key: "services_or_products",
            ask: industry?.toLowerCase().includes("clean")
              ? "Services — every distinct service you offer with: name (e.g. 'Villa Deep Clean'), what's included (60-point checklist, appliance interiors, etc.), typical duration, price range in AED."
              : "Products / packages — if applicable, list every distinct offering with name, type, capacity/spec, key features. Skip if N/A.",
            why: "One service page per offering + schema.org/Service markup + dedicated internal links.",
          },
          {
            key: "hosting",
            ask: "Domain + hosting — where does the site live? Pick ONE: Cloudflare Pages | Netlify | Vercel | SiteGround | Hostinger | other. Is the domain registered yet?",
            why: "Determines deploy automation (git auto-deploy vs SFTP rsync) AND .htaccess strategy. Lock before code.",
          },
          {
            key: "cms",
            ask: "CMS — Static HTML (RECOMMENDED for SEO + speed + cost) | WordPress | Webflow. Pick one. No mid-build swaps.",
            why: "Each path has different deploy + plugin + admin discipline — switching mid-build wastes weeks.",
          },
          {
            key: "image_source",
            ask: "Image source — AI-generated (ChatGPT / Midjourney / Sora) | stock | real photography. CRITICAL: all images for ALL pages will be generated in the SAME session in the SAME style. Never mix.",
            why: "Mixed image sessions = visual inconsistency = looks unprofessional. The vintage Lincoln Continental incident on the last site forced a full regeneration.",
          },
        ],
        absolute_rules: [
          "DO NOT write any code, generate any image, or create any file until ALL 8 Phase 0 items are answered AND the operator has confirmed each.",
          "DO NOT skip ahead to Phase 1+ even if the operator says 'just get started' — push back and explain why locking Phase 0 prevents rework.",
          "DO NOT promise 'done' on anything without measurement (curl / validate_schema / PageSpeed / check_accessibility).",
          "USE AskUserQuestion-style branching prompts when there's a real choice (palette, hosting, CMS). Don't guess.",
        ],
        next_action: businessName && industry && city
          ? "Acknowledge what's pre-filled, then ask Phase 0 questions for everything still missing — in the order listed above. One question at a time, never bulk-dump."
          : "Ask Phase 0 questions in the order listed above — START with business_basics. ONE question at a time so the operator can think + answer cleanly. Once all 8 are confirmed, summarize the locked decisions back to them BEFORE moving to Phase 1.",
        playbook_phases: [
          "Phase 0 — Lock decisions (8 questions above)",
          "Phase 1 — Build src/data.js with all arrays",
          "Phase 2 — Build pipeline (build.js + templates + BUILD_ID)",
          "Phase 3 — SEO baked into v1 (meta + canonical + OG + JSON-LD + sitemap + robots + llms.txt + a11y)",
          "Phase 4 — Performance (.htaccess + self-hosted fonts + WebP images + perf budgets)",
          "Phase 5 — Deployment (one-command deploy: git auto-deploy or SFTP rsync)",
          "Phase 6 — Off-page SEO scheduled alongside (GBP, GSC, citations, reviews, backlinks)",
        ],
      };
    }

    // ────────── Booking widget theming ──────────
    case "audit_widget_brand_match": {
      if (user.role !== "admin") return { error: "Admin-only tool" };
      const siteSlug = typeof input.site_slug === "string" ? input.site_slug : null;
      if (!siteSlug) return { error: "site_slug required" };
      const [site] = await d.select().from(sites).where(eq(sites.slug, siteSlug)).limit(1);
      if (!site) return { error: `Site '${siteSlug}' not found` };
      if (!site.domain) return { error: `Site '${siteSlug}' has no domain configured` };

      const { client, model } = await getLLMClient({ tier: "heavy" });
      const audit = await auditWidgetBrandMatch(client, model, { siteDomain: site.domain });

      await recordAdminAction({
        actor: user,
        kind: "widget.brand_audit",
        targetType: "site",
        targetId: site.id,
        summary: `Widget brand audit: ${audit.match_score}/100 (${audit.verdict})`,
        after: { score: audit.match_score, verdict: audit.verdict },
      });

      return {
        ...audit,
        site_slug: siteSlug,
        site_domain: site.domain,
        note:
          audit.error
            ? `Audit failed: ${audit.error}`
            : audit.verdict === "match"
              ? `Brand match. The widget reads as part of the host site.`
              : audit.verdict === "close"
                ? `Close match (${audit.match_score}/100). Consider running extract_and_propose_themes for tighter alignment.`
                : `Brand mismatch (${audit.match_score}/100). Run extract_and_propose_themes — this is the #1 problem to fix on this site.`,
      };
    }

    case "extract_and_propose_themes": {
      if (user.role !== "admin") return { error: "Admin-only tool" };
      const siteSlug = typeof input.site_slug === "string" ? input.site_slug : null;
      if (!siteSlug) return { error: "site_slug required" };
      const [site] = await d.select().from(sites).where(eq(sites.slug, siteSlug)).limit(1);
      if (!site) return { error: `Site '${siteSlug}' not found` };
      if (!site.domain) return { error: `Site '${siteSlug}' has no domain configured` };

      // 1. Extract base theme from the live homepage
      const base = await extractTheme(site.domain);
      // 2. Generate 3 variants
      const variants = proposeThemeVariants(base);
      // 3. Capture preview screenshots — sequentially to avoid Playwright contention
      const baseUrlForLinks = process.env.PUBLIC_BASE_URL?.replace(/\/$/, "") ?? "http://localhost:3001";
      const enriched: Array<ThemeVariant & {
        screenshot_url: string | null;
        absolute_screenshot_url: string | null;
        markdown_image: string | null;
        capture_error?: string;
      }> = [];
      for (const v of variants) {
        const cap = await captureVariantPreview(v, { force: false });
        const abs = cap.screenshot_url ? `${baseUrlForLinks}${cap.screenshot_url}` : null;
        enriched.push({
          ...v,
          screenshot_url: cap.screenshot_url,
          absolute_screenshot_url: abs,
          markdown_image: cap.screenshot_url ? `![${v.display_name}](${cap.screenshot_url})` : null,
          capture_error: cap.error ?? undefined,
        });
      }

      await recordAdminAction({
        actor: user,
        kind: "widget.theme_proposals",
        targetType: "site",
        targetId: site.id,
        summary: `Generated 3 widget theme variants for ${site.name} (base source: ${base.source})`,
        after: {
          base_source: base.source,
          base_palette: { primary: base.primary, accent: base.accent, surface: base.surface },
        },
      });

      return {
        site_slug: siteSlug,
        site_domain: site.domain,
        base_theme: base,
        base_source: base.source,
        extraction_notes: base.extraction_meta.notes,
        variants: enriched,
        note: `Render each variant as: ## {display_name}\\n{markdown_image}\\n{rationale}\\nPalette: primary={primary} · accent={accent} · radius={border_radius_px}px · heading={font_family_heading}. THEN ask the operator: "Pick a variant (exact / premium / dark_luxury) or tell me what to tweak — I'll apply it via apply_widget_theme."`,
      };
    }

    case "apply_widget_theme": {
      if (user.role !== "admin") return { error: "Admin-only tool" };
      const siteSlug = typeof input.site_slug === "string" ? input.site_slug : null;
      if (!siteSlug) return { error: "site_slug required" };
      const variantLabel = typeof input.variant_label === "string" ? input.variant_label : null;
      const manualTheme = input.theme && typeof input.theme === "object" ? (input.theme as Record<string, unknown>) : null;
      const confirm = input.confirm === true;
      if (!variantLabel && !manualTheme) {
        return { error: "Pass either variant_label or a full theme object" };
      }

      const [site] = await d.select().from(sites).where(eq(sites.slug, siteSlug)).limit(1);
      if (!site) return { error: `Site '${siteSlug}' not found` };
      if (!site.domain) return { error: `Site '${siteSlug}' has no domain configured` };

      // Resolve the theme to apply
      let theme: ExtractedTheme;
      if (variantLabel) {
        const base = await extractTheme(site.domain);
        const variants = proposeThemeVariants(base);
        const match = variants.find((v) => v.label === variantLabel);
        if (!match) return { error: `Unknown variant_label '${variantLabel}'` };
        theme = match.theme;
      } else {
        // Manual theme — fill in any missing fields with safe defaults
        theme = {
          primary: String(manualTheme!.primary ?? "#0B1E3F"),
          primary_text: String(manualTheme!.primary_text ?? "#FFFFFF"),
          surface: String(manualTheme!.surface ?? "#FFFFFF"),
          surface_text: String(manualTheme!.surface_text ?? "#0B1E3F"),
          accent: String(manualTheme!.accent ?? "#C9A961"),
          border: String(manualTheme!.border ?? "rgba(11,30,63,0.12)"),
          font_family_body: String(manualTheme!.font_family_body ?? "system-ui, sans-serif"),
          font_family_heading: String(manualTheme!.font_family_heading ?? "Georgia, serif"),
          border_radius_px: typeof manualTheme!.border_radius_px === "number" ? manualTheme!.border_radius_px as number : 8,
          mode: (manualTheme!.mode === "dark" ? "dark" : manualTheme!.mode === "auto" ? "auto" : "light") as "light" | "dark" | "auto",
          source: "manual" as ExtractedTheme["source"],
          extraction_meta: { notes: ["manual via chat"], sources_used: ["chat"] },
        };
      }

      if (!confirm) {
        // Preview — capture a screenshot of what would be pushed
        const cap = await captureVariantPreview({ label: "exact", display_name: "would-apply", rationale: "", theme }, { force: false });
        return {
          preview: true,
          site_slug: siteSlug,
          site_domain: site.domain,
          would_apply: theme,
          preview_screenshot_url: cap.screenshot_url,
          markdown_image: cap.screenshot_url ? `![Would apply](${cap.screenshot_url})` : null,
          note: `This is what would be pushed. Call again with confirm:true to apply to the live plugin. ⚠️ This changes the booking widget for EVERY page on ${site.domain}.`,
        };
      }

      // Save + push
      await saveThemeRow(site.id, theme);
      const pushResult = await applyThemeToPlugin(site.id, theme);
      if (pushResult.ok) {
        await d
          .update(siteThemes)
          .set({ appliedAt: pushResult.appliedAt ?? new Date(), applyError: null, updatedAt: new Date() })
          .where(eq(siteThemes.siteId, site.id));
      } else {
        await d
          .update(siteThemes)
          .set({ appliedAt: null, applyError: pushResult.error ?? "unknown", updatedAt: new Date() })
          .where(eq(siteThemes.siteId, site.id));
      }

      await recordAdminAction({
        actor: user,
        kind: pushResult.ok ? "widget.theme_applied" : "widget.theme_apply_failed",
        targetType: "site",
        targetId: site.id,
        summary: pushResult.ok
          ? `Pushed widget theme to ${site.name} plugin (source: ${theme.source})`
          : `Failed to push widget theme to ${site.name}: ${pushResult.error}`,
        after: { theme_source: theme.source, ok: pushResult.ok },
      });

      // Verification screenshot — captures the LIVE site post-apply so the
      // operator sees the real result, not just the mockup.
      let verification = null;
      try {
        const liveCap = await captureUrlAtViewports(`https://${site.domain}/`, ["desktop"], { force: true });
        verification = liveCap.results[0]?.publicUrl ?? null;
      } catch {
        // ignore — verification is best-effort
      }

      return {
        ok: pushResult.ok,
        site_slug: siteSlug,
        applied_theme: theme,
        applied_at: pushResult.appliedAt?.toISOString() ?? null,
        error: pushResult.error,
        live_site_screenshot_url: verification,
        markdown_image: verification ? `![${site.domain} (post-apply)](${verification})` : null,
        note: pushResult.ok
          ? "Theme pushed. Render the live_site_screenshot_url inline so the user can see the result on the actual page (cache may need 60s to refresh; refresh the page if no change visible)."
          : `Push failed: ${pushResult.error}. Check that the site's API key is active at /admin/sites/${siteSlug}.`,
      };
    }

    case "set_widget_theme_per_page": {
      if (user.role !== "admin") return { error: "Admin-only tool" };
      const siteSlug = typeof input.site_slug === "string" ? input.site_slug : null;
      const pageId = typeof input.page_id === "number" ? input.page_id : null;
      const vars = input.vars && typeof input.vars === "object" ? (input.vars as Record<string, string>) : null;
      const confirm = input.confirm === true;
      if (!siteSlug) return { error: "site_slug required" };
      if (!pageId) return { error: "page_id (WP post ID) required" };
      if (!vars || Object.keys(vars).length === 0) return { error: "vars must be a non-empty map of CSS var → value" };

      const [site] = await d.select().from(sites).where(eq(sites.slug, siteSlug)).limit(1);
      if (!site) return { error: `Site '${siteSlug}' not found` };

      // Validate var names — all must start with `--gyl-` or `--` (allow flexibility)
      const badKeys = Object.keys(vars).filter((k) => !k.startsWith("--"));
      if (badKeys.length > 0) {
        return { error: `CSS variable names must start with -- · bad: ${badKeys.join(", ")}` };
      }

      if (!confirm) {
        return {
          preview: true,
          site_slug: siteSlug,
          page_id: pageId,
          would_push: { vars },
          note: `Would push a page_design blob to ${site.domain} scoped to post ID ${pageId}. Only the booking widget on that page changes. Call again with confirm:true.`,
        };
      }

      const result = await setPageScopedWidgetTheme(site.id, pageId, vars);
      if (result.ok) {
        await recordAdminAction({
          actor: user,
          kind: "widget.page_scoped_theme",
          targetType: "site",
          targetId: site.id,
          summary: `Pushed page-scoped widget theme (post ${pageId}) on ${site.name}: ${Object.keys(vars).length} var(s)`,
          after: { page_id: pageId, var_count: Object.keys(vars).length },
        });
      }
      return {
        ...result,
        site_slug: siteSlug,
        page_id: pageId,
        applied_vars: vars,
        note: result.ok
          ? `Applied. The booking widget on post ${pageId} now uses these overrides. Other pages on the site are unchanged.`
          : `Push failed: ${result.error}`,
      };
    }

    case "set_business_facts": {
      if (user.role !== "admin") return { error: "Admin-only tool" };
      const projectId = typeof input.project_id === "string" ? input.project_id : null;
      const facts = input.facts && typeof input.facts === "object" ? (input.facts as Record<string, unknown>) : null;
      const confirm = input.confirm === true;
      if (!projectId) return { error: "project_id required" };
      if (!facts) return { error: "facts must be an object" };

      const [project] = await d.select().from(siteBuildProjects).where(eq(siteBuildProjects.id, projectId)).limit(1);
      if (!project) return { error: "Project not found" };

      const existing = (project.businessFacts ?? {}) as Record<string, unknown>;
      const merged = { ...existing, ...facts };

      if (!confirm) {
        const changed = Object.keys(facts);
        return {
          preview: true,
          project_id: projectId,
          would_change: changed,
          before: existing,
          after: merged,
          note: `Call again with confirm:true to save. ${changed.length} key(s) will be updated: ${changed.join(", ")}.`,
        };
      }

      await d
        .update(siteBuildProjects)
        .set({ businessFacts: merged, updatedAt: new Date() })
        .where(eq(siteBuildProjects.id, projectId));

      await recordAdminAction({
        actor: user,
        kind: "build.business_facts_updated",
        targetType: "other",
        targetId: projectId,
        summary: `Updated business_facts on "${project.businessName}" — ${Object.keys(facts).length} key(s)`,
        after: { keys: Object.keys(facts) },
      });

      return { ok: true, project_id: projectId, saved_keys: Object.keys(facts), merged_facts: merged };
    }

    default:
      return { error: `unknown tool: ${name}` };
  }
}
