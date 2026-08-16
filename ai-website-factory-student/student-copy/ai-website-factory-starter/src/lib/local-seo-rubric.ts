/**
 * Local SEO Rubric — codifies Wali Shah's three-class doctrine into
 * data the auditor can grade pages against.
 *
 * Sources (the three class transcripts you taught):
 *   1. Local SEO Website Structure (Optimized)
 *   2. Local SEO_On-Page Checklist
 *   3. Local SEO Website Structure & Semantic Strategy
 *
 * Every check has a stable `id` so historical audits can diff cleanly
 * even after we tighten thresholds.
 */

/** Page types the rubric understands. */
export type RubricPageType = "homepage" | "service" | "location" | "blog" | "about" | "contact" | "other";

/** Severity of a finding. */
export type RubricSeverity = "blocking" | "high" | "medium" | "low" | "info";

/** Category grouping for the score breakdown. */
export type RubricCategory =
  | "on_page"
  | "structure"
  | "eeat"
  | "local_proof"
  | "schema"
  | "internal_linking"
  | "semantic"
  | "anti_doorway";

/** One atomic check the auditor runs. */
export interface RubricCheck {
  id: string;
  category: RubricCategory;
  /** Which page types this check applies to. */
  appliesTo: RubricPageType[];
  /** Plain-English description for the audit panel. */
  description: string;
  /** Weight in the overall score (1-10). Higher = more punishing when failed. */
  weight: number;
  /**
   * "deterministic" runs in pure JS against HTML/meta.
   * "judge" needs Haiku to evaluate something subjective.
   */
  mode: "deterministic" | "judge";
  /** What to suggest the operator do if this check fails. */
  fixHint?: string;
}

// ════════════════════════════════════════════════════════════════════
// 1. ON-PAGE CHECKLIST (from class 2)
// ════════════════════════════════════════════════════════════════════

export const URL_MAX_LENGTH = 60;
export const URL_RECOMMENDED_MAX = 50;
export const META_TITLE_MIN = 30;
export const META_TITLE_MAX = 65;
export const META_DESC_MIN = 120;
export const META_DESC_MAX = 165;

/** Image filenames that signal an SEO-renamed asset. */
export const IMAGE_NAME_OK_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.(?:jpe?g|png|webp|avif|svg)$/i;
/** Image filenames that scream camera-dump / generic. */
export const IMAGE_NAME_BAD_RE = /^(?:img|image|photo|dsc|pxl|screenshot|untitled|unnamed|asset|tmp)[_-]?\d*\.(?:jpe?g|png|webp|avif|svg)$/i;

// ════════════════════════════════════════════════════════════════════
// 2. SECTION REQUIREMENTS (from class 1)
// ════════════════════════════════════════════════════════════════════

/**
 * Every required section per page type with detection hints.
 * The detector looks for ANY of `selectors` OR `headingPatterns` OR
 * `contentSignals`. A section is "present" if at least one hits.
 */
export interface SectionRequirement {
  id: string;
  label: string;
  /** CSS selectors that strongly indicate this section. */
  selectors?: string[];
  /** Heading regex (case-insensitive) that suggests this section. */
  headingPatterns?: RegExp[];
  /** Body-text phrase regex that hints at the section. */
  contentSignals?: RegExp[];
  /** If true, an LLM judge double-checks the section is genuine, not lip-service. */
  needsJudge?: boolean;
  /** Why this matters — surfaced in the UI. */
  rationale: string;
}

export const HOMEPAGE_SECTIONS: SectionRequirement[] = [
  {
    id: "hero",
    label: "Hero with primary keyword + location + CTA",
    selectors: [".hero", "[data-section=hero]", "header.hero", ".alt-hero", ".nwtl-hero"],
    contentSignals: [/call\s+now|get\s+(?:a\s+)?(?:free\s+)?quote|book\s+now|reserve\s+now/i],
    rationale: "Primary conversion area. Must lead with Service + Location and surface a CTA + phone + trust badge above the fold.",
    needsJudge: true,
  },
  {
    id: "service_overview",
    label: "Service overview with 3+ services + internal links",
    headingPatterns: [/our\s+services|services\s+we\s+offer|what\s+we\s+do|core\s+services/i],
    selectors: [".services", ".service-grid", ".alt-services", ".nwtl-services", ".feature-grid"],
    rationale: "Each main service gets 2-3 lines + a link to its dedicated page. Internal linking signal.",
  },
  {
    id: "areas_we_serve",
    label: "Areas We Serve (city/area grid with links)",
    headingPatterns: [/areas?\s+we\s+(?:serve|cover)|service\s+area|locations?\s+we\s+(?:serve|cover)|where\s+we\s+work/i],
    selectors: [".areas-served", ".service-areas", ".alt-areas", ".nwtl-areas", ".location-grid"],
    rationale: "Grid/slider linking to each city landing page. Powers the spoke side of hub-and-spoke local SEO.",
  },
  {
    id: "eeat",
    label: "EEAT block (experience, certifications, real photos)",
    headingPatterns: [/why\s+choose|years?\s+of\s+experience|our\s+team|certifications?|trusted\s+by/i],
    contentSignals: [/(?:[1-9]\d?|\d{2,})\s*\+\s*years?|since\s+(?:19|20)\d{2}|licensed|insured|certified|bbb|cao|tssa/i],
    rationale: "Show Google + AI you're credible: years in business, certifications, real team photos (not stock), review summary.",
    needsJudge: true,
  },
  {
    id: "local_proof",
    label: "Local proof (landmarks, neighborhoods, named clients)",
    contentSignals: [/(?:near|around|by|next to)\s+[A-Z][a-z]+|Palm Jumeirah|Emirates Hills|Dubai Marina|Downtown Dubai|DIFC|JBR|Business Bay|Al Barsha|Dubai Hills|Arabian Ranches|JVC|Jumeirah/],
    rationale: "Hyper-local trust signal: name actual landmarks, neighborhoods, or partner businesses to prove you're really here.",
    needsJudge: true,
  },
  {
    id: "faqs",
    label: "FAQ section with 6-8 conversational questions",
    headingPatterns: [/frequently\s+asked|FAQ|common\s+questions|questions?\s+(?:we\s+)?(?:get|hear|answer)/i],
    selectors: [".faq", ".faq-section", ".alt-faq", ".nwtl-faq", "details summary"],
    rationale: "AI Overview / featured-snippet feeder. 6-8 short conversational Q&As, 40-50 words each.",
    needsJudge: true,
  },
];

export const SERVICE_PAGE_SECTIONS: SectionRequirement[] = [
  {
    id: "service_definition",
    label: "Service definition (what it is, clearly)",
    headingPatterns: [/what\s+is|what\s+we\s+(?:do|offer)|our\s+\w+\s+service/i],
    rationale: "Explain the service clearly up top so both Google and AI Overviews can lift the definition.",
  },
  {
    id: "problem_solution",
    label: "Problem → Solution framing",
    contentSignals: [/(?:blocked|damaged|leaking|broken|cracked|worn|stained|outdated)\s+\w+.*(?:we\s+(?:remove|fix|repair|replace|restore|clean))/is],
    rationale: "Lead with the customer's pain, then your fix. Higher buyer-intent signal than feature-listing.",
    needsJudge: true,
  },
  {
    id: "how_it_works",
    label: "How the service works (step-by-step)",
    headingPatterns: [/how\s+it\s+works|our\s+process|step[- ]by[- ]step|the\s+process/i],
    selectors: [".process", ".process-steps", ".alt-process", ".steps-grid"],
    rationale: "Simple numbered process: inspection → core service → quality check → follow-up.",
  },
  {
    id: "benefits",
    label: "Benefits section (4+ concrete benefits)",
    headingPatterns: [/benefits?|why\s+(?:this\s+)?(?:matters?|invest|do\s+it)|(?:advantages?)/i],
    rationale: "Bullet-style. Prevent damage, improve X, extend lifespan, protect Y.",
  },
  {
    id: "local_relevance",
    label: "Local relevance (named areas where service is offered)",
    contentSignals: [/(?:across|throughout|in)\s+(?:[A-Z][a-z]+(?:,\s*[A-Z][a-z]+)+)|nearby\s+(?:areas?|locations?)/],
    rationale: "Plug-in the city/cluster name list so each service page also pulls local SEO weight.",
    needsJudge: true,
  },
  {
    id: "pricing_signals",
    label: "Pricing transparency signals (no hidden fees, from £X, free quote)",
    contentSignals: [/no\s+hidden\s+fees?|free\s+(?:quote|estimate|consultation)|(?:starting\s+|from\s+)?[£\$€]\s*\d+|transparent\s+pricing/i],
    rationale: "Trust signal without committing to exact numbers. \"From £X / free quote / no hidden fees\" hits the right note.",
  },
  {
    id: "service_faqs",
    label: "Service-specific FAQs (6-8 questions)",
    headingPatterns: [/frequently\s+asked|FAQ|common\s+questions/i],
    selectors: [".faq", ".faq-section", ".alt-faq", ".nwtl-faq"],
    rationale: "Service-page FAQs are different from homepage FAQs — they answer specific buying objections for this service.",
    needsJudge: true,
  },
];

export const LOCATION_PAGE_SECTIONS: SectionRequirement[] = [
  {
    id: "local_intro",
    label: "Local intro (Service + City + Intent)",
    contentSignals: [/(?:need|looking for|searching for)\s+[\w\s]+\s+in\s+[A-Z][a-z]+/i],
    rationale: "Opening line proves the page is for this city specifically, not a generic stub.",
    needsJudge: true,
  },
  {
    id: "why_choose_us_local",
    label: "Why choose us in this city (local trust factors)",
    headingPatterns: [/why\s+choose\s+us|why\s+(?:residents|homeowners|locals?)\s+(?:trust|pick|choose)/i],
    rationale: "City-specific trust factors: local technicians, fast response in this area, trusted by residents here.",
  },
  {
    id: "landmarks_coverage",
    label: "Landmarks + neighborhoods + coverage",
    contentSignals: [/(?:near|around)\s+[A-Z][a-z]+|(?:[A-Z][a-z]+\s+Market|[A-Z][a-z]+\s+Park|[A-Z][a-z]+\s+Station)/],
    rationale: "Name actual neighborhoods + landmarks. Stockport Market, Bramhall, Hazel Grove. Avoids the \"generic city page\" smell.",
    needsJudge: true,
  },
  {
    id: "local_case_study",
    label: "Real case study / job in this city",
    contentSignals: [/recently\s+(?:cleaned|deep-cleaned|serviced|completed|finished|maintained)|case\s+study|recent\s+job/i],
    rationale: "Most powerful single signal that the page is real, not a template. \"Deep-cleaned a 4-bedroom villa in Palm Jumeirah after a fit-out — 60-point checklist attached.\"",
    needsJudge: true,
  },
  {
    id: "local_reviews",
    label: "Reviews mentioning this city",
    selectors: [".reviews", ".testimonial", ".alt-quote", "blockquote"],
    rationale: "Even one quoted review that names the city is worth a hundred generic 5-star stars.",
    needsJudge: true,
  },
  {
    id: "city_specific_faqs",
    label: "City-specific FAQs",
    headingPatterns: [/FAQ|frequently\s+asked|common\s+questions/i],
    rationale: "FAQs unique to this city — weather, local issues, timing. Powers AI Overview citations for city-modified queries.",
    needsJudge: true,
  },
  {
    id: "location_internal_links",
    label: "Internal links to services + nearby cities + homepage",
    rationale: "Hub-and-spoke wiring: city page → all main service pages, + 3-5 nearby city pages, + homepage. Skips orphan-page penalty.",
  },
];

export const BLOG_POST_SECTIONS: SectionRequirement[] = [
  {
    id: "blog_intro",
    label: "Blog intro paragraph orienting the reader",
    rationale: "One short paragraph that frames the question and previews the answer. Capsule mode helper.",
  },
  {
    id: "blog_tldr",
    label: "Key takeaways / TLDR block",
    selectors: [".tldr", ".key-takeaways", ".nwtl-tldr", ".alt-tldr-card"],
    headingPatterns: [/key\s+takeaways?|TLDR|TL;DR|in\s+(?:a\s+)?(?:short|nutshell)/i],
    rationale: "AI Overview lifts the TLDR almost verbatim. Bullet list of 4-6 hard facts.",
  },
  {
    id: "blog_h2_questions",
    label: "H2-as-question structure (capsules)",
    rationale: "Each major section is an H2 phrased as a question (\"How much does X cost in Y?\"). Capsule format maximizes citation odds.",
    needsJudge: true,
  },
  {
    id: "blog_citations",
    label: "Citations to authority sources",
    contentSignals: [/according\s+to\s+[A-Z]|<a\s+[^>]*href=["']https?:\/\/(?:www\.)?(?:gov|ca|uk|edu|nasa|cdc|who|statcan)/i],
    rationale: "Cite government data, industry-body statistics, named studies. Without citations, Google's quality raters mark you as low-authority.",
  },
  {
    id: "blog_local_anchor",
    label: "Local relevance anchor",
    contentSignals: [/in\s+[A-Z][a-z]+(?:,\s*[A-Z]{2,})?/],
    rationale: "Even a blog should anchor to the service area — \"the deep-clean rate in Dubai Marina\" not just \"the deep-clean rate\".",
  },
];

// ════════════════════════════════════════════════════════════════════
// 3. SCHEMA REQUIREMENTS (from class 2)
// ════════════════════════════════════════════════════════════════════

/** Schema types the rubric grades, by page type. */
export const REQUIRED_SCHEMA_BY_PAGE_TYPE: Record<RubricPageType, string[]> = {
  homepage: ["LocalBusiness", "Organization", "WebSite"],
  service: ["Service", "FAQPage"],
  location: ["LocalBusiness", "Place"],
  blog: ["Article", "BlogPosting"],
  about: ["Organization", "AboutPage"],
  contact: ["ContactPage", "LocalBusiness"],
  other: [],
};

/** Schema types that DESERVE bonus credit (one or the other is fine). */
export const OPTIONAL_SCHEMA: Record<RubricPageType, string[]> = {
  homepage: ["AggregateRating", "BreadcrumbList"],
  service: ["AggregateRating", "BreadcrumbList", "Offer"],
  location: ["FAQPage", "BreadcrumbList"],
  blog: ["BreadcrumbList", "Person"],
  about: [],
  contact: ["BreadcrumbList"],
  other: [],
};

// ════════════════════════════════════════════════════════════════════
// 4. SEMANTIC STRATEGY (from class 3)
// ════════════════════════════════════════════════════════════════════

/** Doorway-page heuristic thresholds. */
export const MIN_BODY_WORDS_PER_PAGE_TYPE: Record<RubricPageType, number> = {
  homepage: 400,
  service: 600,
  location: 500,
  blog: 1000,
  about: 300,
  contact: 100,
  other: 200,
};

/** % uniqueness threshold (vs. other pages on same site) before flagging as a doorway. */
export const DOORWAY_DUPLICATE_THRESHOLD = 0.65;

/**
 * The "Core SEO Entities" canon — used by the semantic-coverage check.
 * The auditor counts how many entities from the relevant bucket the
 * page mentions. Low coverage = thin / shallow content.
 *
 * This list is the Dubai cleaning-services canon. Used by the semantic-
 * coverage check on service + city pages. For a different niche the operator
 * would swap the buckets — but every site currently on the platform is
 * cleaning-vertical.
 */
export const CORE_ENTITIES = {
  service: [
    "deep clean", "villa clean", "apartment clean", "move-in clean",
    "move-out clean", "post-construction clean", "sofa cleaning",
    "carpet cleaning", "curtain cleaning", "mattress cleaning",
    "office cleaning", "kitchen deep clean", "bathroom deep clean",
    "sanitisation", "disinfection", "recurring clean", "one-off clean",
  ],
  cleaning_specifics: [
    "60-point checklist", "written standard", "audit sheet", "walkthrough",
    "team lead", "insured", "licensed", "trained", "background-checked",
    "eco-friendly", "non-toxic", "hospital-grade", "steam clean",
  ],
  local_dubai: [
    "dubai marina", "palm jumeirah", "emirates hills", "dubai hills",
    "arabian ranches", "downtown dubai", "difc", "jbr", "jumeirah",
    "business bay", "al barsha", "jvc", "silicon oasis", "meadows",
    "the springs", "the greens", "damac hills", "mira oasis",
  ],
  decision_making: [
    "fixed price", "same-day quote", "aed", "hourly rate", "package",
    "subscription", "booking", "reservation", "cancellation", "guarantee",
    "insurance", "licensed by dubai municipality", "trade licence",
    "vat included", "no hidden fees",
  ],
};

// ════════════════════════════════════════════════════════════════════
// 5. THE CHECK CATALOG (everything the auditor runs)
// ════════════════════════════════════════════════════════════════════

export const CHECKS: RubricCheck[] = [
  // ── On-page ─────────────────────────────────────────────────────
  { id: "url_short", category: "on_page", appliesTo: ["homepage", "service", "location", "blog", "about", "contact"], description: `URL ≤ ${URL_MAX_LENGTH} chars`, weight: 4, mode: "deterministic", fixHint: "Shorten the URL — strip filler words like \"best-affordable-company-in\". Keep keyword + location only." },
  { id: "url_keyword", category: "on_page", appliesTo: ["service", "location"], description: "URL contains the page's primary keyword", weight: 5, mode: "deterministic", fixHint: "Bake the primary keyword (or its slug form) into the URL — e.g. /kitchen-renovation-dubai." },
  { id: "url_lowercase_kebab", category: "on_page", appliesTo: ["homepage", "service", "location", "blog", "about", "contact"], description: "URL is lowercase, hyphenated, no underscores", weight: 2, mode: "deterministic", fixHint: "Use kebab-case (foo-bar), never snake_case (foo_bar) or mixed case (FooBar)." },

  { id: "meta_title_present", category: "on_page", appliesTo: ["homepage", "service", "location", "blog", "about", "contact"], description: "Meta title present", weight: 8, mode: "deterministic", fixHint: "Add a meta title via RankMath. Formula: Primary Keyword + Location + Value Hook." },
  { id: "meta_title_length", category: "on_page", appliesTo: ["homepage", "service", "location", "blog", "about", "contact"], description: `Meta title ${META_TITLE_MIN}-${META_TITLE_MAX} chars`, weight: 4, mode: "deterministic", fixHint: "Keep meta title within Google's display window (50-60 chars sweet spot)." },
  { id: "meta_title_keyword", category: "on_page", appliesTo: ["service", "location"], description: "Meta title contains primary keyword", weight: 6, mode: "deterministic" },
  { id: "meta_title_location", category: "on_page", appliesTo: ["homepage", "service", "location"], description: "Meta title contains city/location", weight: 5, mode: "deterministic", fixHint: "Service pages and city pages must have the city in the meta title for local pack ranking." },

  { id: "meta_desc_present", category: "on_page", appliesTo: ["homepage", "service", "location", "blog", "about", "contact"], description: "Meta description present", weight: 6, mode: "deterministic" },
  { id: "meta_desc_length", category: "on_page", appliesTo: ["homepage", "service", "location", "blog", "about", "contact"], description: `Meta description ${META_DESC_MIN}-${META_DESC_MAX} chars`, weight: 3, mode: "deterministic" },
  { id: "meta_desc_cta", category: "on_page", appliesTo: ["homepage", "service", "location"], description: "Meta description ends with a CTA verb", weight: 3, mode: "deterministic", fixHint: "End with: \"Get a same-day quote\", \"Book a walkthrough\", \"Call today\", etc." },

  { id: "h1_exactly_one", category: "on_page", appliesTo: ["homepage", "service", "location", "blog", "about", "contact"], description: "Exactly one H1 on the page", weight: 5, mode: "deterministic", fixHint: "Multiple H1s split the topical signal. Demote secondary ones to H2." },
  { id: "h1_has_primary", category: "on_page", appliesTo: ["service", "location"], description: "H1 contains the primary keyword", weight: 4, mode: "deterministic" },
  { id: "heading_hierarchy", category: "on_page", appliesTo: ["homepage", "service", "location", "blog"], description: "Heading hierarchy doesn't skip levels (no H2 → H4)", weight: 2, mode: "deterministic" },

  { id: "https", category: "on_page", appliesTo: ["homepage", "service", "location", "blog", "about", "contact"], description: "Served over HTTPS", weight: 8, mode: "deterministic", fixHint: "Force HTTPS at the host / via redirect. SSL is table stakes — Google demotes HTTP." },

  { id: "image_alt_text", category: "on_page", appliesTo: ["homepage", "service", "location", "blog", "about"], description: "All <img> elements have descriptive alt text", weight: 3, mode: "deterministic", fixHint: "Add alt text describing what's in the image, not just \"cleaning.jpg\". Example: \"Post-clean marble floor in Palm Jumeirah villa\"." },
  { id: "image_named_well", category: "on_page", appliesTo: ["homepage", "service", "location", "blog"], description: "Images named with descriptive keywords, not DSC1234.jpg", weight: 2, mode: "deterministic", fixHint: "Rename images using descriptive slugs: \"villa-deep-clean-dubai-marina-kitchen.jpg\" not \"IMG_4382.jpg\"." },

  // ── Structure ───────────────────────────────────────────────────
  { id: "homepage_hero", category: "structure", appliesTo: ["homepage"], description: "Homepage hero with service + location + CTA", weight: 9, mode: "deterministic" },
  { id: "homepage_service_overview", category: "structure", appliesTo: ["homepage"], description: "Service overview with 3+ services + internal links", weight: 7, mode: "deterministic" },
  { id: "homepage_areas_served", category: "structure", appliesTo: ["homepage"], description: "Areas-served block linking to city pages", weight: 7, mode: "deterministic" },
  { id: "homepage_eeat", category: "structure", appliesTo: ["homepage"], description: "EEAT block: years + certifications + team", weight: 8, mode: "judge" },
  { id: "homepage_local_proof", category: "structure", appliesTo: ["homepage"], description: "Hyper-local proof: landmarks, neighborhoods, named clients", weight: 7, mode: "judge" },
  { id: "homepage_faqs", category: "structure", appliesTo: ["homepage"], description: "FAQ section with 6-8 conversational Q&As", weight: 6, mode: "judge" },

  { id: "service_definition", category: "structure", appliesTo: ["service"], description: "Service definition block", weight: 7, mode: "deterministic" },
  { id: "service_problem_solution", category: "structure", appliesTo: ["service"], description: "Problem → Solution framing", weight: 6, mode: "judge" },
  { id: "service_how_it_works", category: "structure", appliesTo: ["service"], description: "How the service works (step-by-step)", weight: 5, mode: "deterministic" },
  { id: "service_benefits", category: "structure", appliesTo: ["service"], description: "Benefits section (4+ concrete benefits)", weight: 5, mode: "deterministic" },
  { id: "service_local_relevance", category: "structure", appliesTo: ["service"], description: "Local relevance (named areas)", weight: 6, mode: "judge" },
  { id: "service_pricing_signals", category: "structure", appliesTo: ["service"], description: "Pricing transparency signals", weight: 4, mode: "deterministic" },
  { id: "service_faqs", category: "structure", appliesTo: ["service"], description: "Service-specific FAQs", weight: 6, mode: "judge" },

  { id: "location_intro", category: "structure", appliesTo: ["location"], description: "Local intro framing (Service + City + Intent)", weight: 7, mode: "judge" },
  { id: "location_why_choose_us", category: "structure", appliesTo: ["location"], description: "Why choose us in this city", weight: 6, mode: "deterministic" },
  { id: "location_landmarks", category: "structure", appliesTo: ["location"], description: "Landmarks + neighborhoods + coverage", weight: 8, mode: "judge" },
  { id: "location_case_study", category: "structure", appliesTo: ["location"], description: "Real case study or local job", weight: 7, mode: "judge" },
  { id: "location_reviews", category: "structure", appliesTo: ["location"], description: "Reviews mentioning this city", weight: 5, mode: "judge" },
  { id: "location_city_faqs", category: "structure", appliesTo: ["location"], description: "City-specific FAQs", weight: 6, mode: "judge" },

  { id: "blog_tldr", category: "structure", appliesTo: ["blog"], description: "Key takeaways / TLDR block", weight: 6, mode: "deterministic" },
  { id: "blog_intro", category: "structure", appliesTo: ["blog"], description: "Blog intro paragraph", weight: 4, mode: "deterministic" },
  { id: "blog_h2_questions", category: "structure", appliesTo: ["blog"], description: "H2-as-question capsule structure", weight: 6, mode: "judge" },
  { id: "blog_citations", category: "structure", appliesTo: ["blog"], description: "Citations to authority sources", weight: 6, mode: "deterministic" },
  { id: "blog_local_anchor", category: "structure", appliesTo: ["blog"], description: "Local relevance anchor", weight: 4, mode: "deterministic" },

  // ── Schema ─────────────────────────────────────────────────────
  { id: "schema_required_present", category: "schema", appliesTo: ["homepage", "service", "location", "blog", "about", "contact"], description: "Required JSON-LD schema types present", weight: 7, mode: "deterministic", fixHint: "Add the required schema via RankMath → Schema → Add. Homepage needs LocalBusiness + Organization + WebSite." },
  { id: "schema_valid_json", category: "schema", appliesTo: ["homepage", "service", "location", "blog", "about", "contact"], description: "All JSON-LD blocks parse as valid JSON", weight: 6, mode: "deterministic" },
  { id: "schema_has_url", category: "schema", appliesTo: ["homepage", "service", "location", "blog"], description: "Schema includes canonical URL + name", weight: 3, mode: "deterministic" },

  // ── Internal linking ───────────────────────────────────────────
  { id: "internal_links_present", category: "internal_linking", appliesTo: ["homepage", "service", "location", "blog"], description: "At least 3 internal links to other pages", weight: 5, mode: "deterministic" },
  { id: "service_to_location_link", category: "internal_linking", appliesTo: ["service"], description: "Service page links to at least one location page", weight: 4, mode: "deterministic" },
  { id: "location_to_service_link", category: "internal_linking", appliesTo: ["location"], description: "Location page links to at least one service page", weight: 4, mode: "deterministic" },
  { id: "outbound_authority", category: "internal_linking", appliesTo: ["blog"], description: "Blog has 1+ outbound link to authority source", weight: 3, mode: "deterministic" },

  // ── Semantic + anti-doorway ─────────────────────────────────────
  { id: "semantic_entity_coverage", category: "semantic", appliesTo: ["homepage", "service", "location"], description: "Page mentions 6+ relevant industry entities", weight: 4, mode: "deterministic" },
  { id: "body_word_count", category: "anti_doorway", appliesTo: ["homepage", "service", "location", "blog", "about"], description: "Body content meets minimum word count for page type", weight: 5, mode: "deterministic", fixHint: "Doorway-thin content gets demoted. Service pages need 600+ words; city pages 500+." },
  { id: "uniqueness_vs_siblings", category: "anti_doorway", appliesTo: ["service", "location"], description: "Body content is sufficiently unique vs other pages on site", weight: 7, mode: "deterministic", fixHint: "Template-copy across city pages is the #1 reason city pages don't rank. Rewrite each with unique landmarks, case studies, and local context." },
];

/** Convenience: get all checks for one page type. */
export function checksForPageType(pageType: RubricPageType): RubricCheck[] {
  return CHECKS.filter((c) => c.appliesTo.includes(pageType));
}

/** Convenience: get only judge-mode checks (need Haiku). */
export function judgeChecksForPageType(pageType: RubricPageType): RubricCheck[] {
  return checksForPageType(pageType).filter((c) => c.mode === "judge");
}

/** Convenience: get only deterministic checks. */
export function deterministicChecksForPageType(pageType: RubricPageType): RubricCheck[] {
  return checksForPageType(pageType).filter((c) => c.mode === "deterministic");
}

/** Sum of weights for a page type — denominator for score. */
export function maxScoreForPageType(pageType: RubricPageType): number {
  return checksForPageType(pageType).reduce((sum, c) => sum + c.weight, 0);
}

/** Infer page type from URL + title fallback. */
export function inferPageType(input: { url: string; title?: string }): RubricPageType {
  const u = input.url.toLowerCase();
  const t = (input.title ?? "").toLowerCase();

  // Homepage
  if (u === "/" || u.endsWith(".com/") || u.endsWith(".com") || /\/$/.test(new URL(u, "https://x.test").pathname) && new URL(u, "https://x.test").pathname === "/") {
    return "homepage";
  }
  try {
    const path = new URL(u, "https://x.test").pathname;
    if (path === "/" || path === "") return "homepage";
    if (/^\/blog\/|^\/news\/|^\/articles?\//.test(path)) return "blog";
    if (/^\/about|^\/who-we-are|^\/our-team/.test(path)) return "about";
    if (/^\/contact|^\/get-in-touch/.test(path)) return "contact";
    // Location heuristic: short slug that's just a city name (1-3 words)
    if (/^\/(?:locations?|areas?|cities?|service-area)\//.test(path)) return "location";
    // Service heuristic: contains a service-y keyword
    if (/(?:cleaning|clean|deep-clean|villa|apartment|move-in|move-out|post-construction|sofa|carpet|curtain|mattress|office|maid|housekeeping|maintenance|sanitisation|disinfection|service|repair|installation)/i.test(path)) {
      return "service";
    }
  } catch {
    // not a URL — fall through
  }
  // Title heuristics
  if (/\bin\s+[A-Z][a-z]+/.test(input.title ?? "")) return "location";
  if (t.includes("blog") || t.includes("guide") || t.includes("how to")) return "blog";
  return "other";
}
