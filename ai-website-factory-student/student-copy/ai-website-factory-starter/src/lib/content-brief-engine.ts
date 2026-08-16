/**
 * Brief-first content engine — Phase 1 (foundation).
 *
 * The job of this module is to turn a {siteId, pageType, targetKeyword}
 * request into a STRUCTURED, GROUNDED content brief that a downstream
 * generate-from-brief job (Phase 2) can expand into a publish-ready page.
 *
 * Three pillars:
 *   1. Page-type structure templates — vertical-aware H2/H3 outlines, word-count
 *      ranges, and which of the 7 local-SEO pillars each page MUST satisfy.
 *   2. Vertical-awareness — the angle + section emphasis adapts to the site's
 *      business vertical (cleaning services outcome-photos vs AC-repair heatwave-urgency),
 *      driven from stored business facts (no fabrication).
 *   3. Keyword grounding — SEMrush head + long-tail + question/near-me pull,
 *      tagged by intent + AI-Overview-trigger likelihood (reuses semrush.ts).
 *
 * Deterministic where possible (templates, scoring, geo-entity extraction);
 * the LLM is used only for prose-shaped fields (headline options, the
 * AI-Overview answer block, per-section purpose lines). When the LLM key is
 * absent the engine still returns a usable brief from the deterministic
 * skeleton — it just skips the prose polish.
 *
 * GROUNDING RULE: the brief never invents local facts. Where a fact the
 * template wants is missing from stored business facts, the brief emits a
 * `needs business fact: X` marker instead of a hallucinated value.
 */

import { eq } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { sites, siteGbp, siteBuildProjects, orgSettings } from "@/db/schema";
import { getLLMClient } from "./llm";
import {
  researchKeywords,
  hasSemrushKey,
  type SemrushKeyword,
  type SemrushResult,
} from "./semrush";

// ============================================================
// Page types + 7 local-SEO pillars
// ============================================================

export const PAGE_TYPES = [
  "home",
  "service",
  "area",
  "blog",
  "about",
  "contact",
  "pricing",
  "faq", // faq-as-content variant
] as const;
export type PageType = (typeof PAGE_TYPES)[number];

export function isPageType(v: string): v is PageType {
  return (PAGE_TYPES as readonly string[]).includes(v);
}

/**
 * The 7 local-SEO pillars. A page-type template declares which pillars it
 * MUST hit; the brief carries a checklist so the operator (and the Phase-2
 * generator) can see, per pillar, whether the brief satisfies it and how.
 */
export const SEO_PILLARS = {
  intent_match: "Search-intent match — page format matches what the query wants",
  local_relevance: "Local relevance — real neighborhoods, landmarks, service radius",
  problem_solution: "Core problem → solution the service solves",
  eeat_trust: "E-E-A-T / trust — experience, license, NAP, reviews",
  modern_schema: "Modern schema — LocalBusiness / Service / Breadcrumb (no FAQ/HowTo rich results)",
  internal_linking: "Internal linking — links to hub + sibling spokes",
  conversion_ai: "Conversion + conversational / AI-Overview answer coverage",
} as const;
export type PillarKey = keyof typeof SEO_PILLARS;
export const PILLAR_KEYS = Object.keys(SEO_PILLARS) as PillarKey[];

export interface PillarCheck {
  pillar: PillarKey;
  label: string;
  /** true once the brief has a concrete plan for this pillar. */
  satisfied: boolean;
  /** How the brief satisfies it, or a `needs business fact: X` marker. */
  note: string;
}

// ============================================================
// Page-type structure templates
// ============================================================

export interface SectionTemplate {
  /** H2 heading (may be a question for AI-Overview eligibility). */
  h2: string;
  /** Suggested H3 sub-sections. */
  h3: string[];
  /** Why this section exists — guides the writer. */
  purpose: string;
  /** Which pillars this section primarily advances. */
  pillars: PillarKey[];
}

export interface PageTypeTemplate {
  pageType: PageType;
  label: string;
  /** Default search intent for this page type. */
  defaultIntent: SemrushKeyword["intent"];
  /** Defensible word-count band. */
  wordCount: { min: number; max: number };
  /** Mandatory pillars for this page type. */
  requiredPillars: PillarKey[];
  /** Ordered section skeleton. */
  sections: SectionTemplate[];
  /** Modern schema types to emit (no FAQ/HowTo for rich results). */
  schemaTypes: string[];
  /** Should the brief carry a dedicated AI-Overview answer block? */
  wantsAiOverviewBlock: boolean;
}

/**
 * Base, vertical-NEUTRAL templates. `verticalContext` (below) rewrites the
 * angle + section copy per vertical so an HVAC service page reads about
 * heatwave urgency while a villa-cleaning service page reads about the 60-point checklist and eco products.
 *
 * Word counts are deliberately defensible bands, not single numbers —
 * thin pages trip the scaled-content classifier, bloated ones bury intent.
 */
const TEMPLATES: Record<PageType, PageTypeTemplate> = {
  home: {
    pageType: "home",
    label: "Home",
    defaultIntent: "transactional",
    wordCount: { min: 700, max: 1000 },
    requiredPillars: [
      "intent_match",
      "local_relevance",
      "problem_solution",
      "eeat_trust",
      "modern_schema",
      "internal_linking",
      "conversion_ai",
    ],
    schemaTypes: ["LocalBusiness", "WebSite", "BreadcrumbList"],
    wantsAiOverviewBlock: true,
    sections: [
      { h2: "{Service} in {City} — Fast, Professional & Fully Insured", h3: ["Who we serve", "Coverage area"], purpose: "Hero promise + primary keyword + city in the first 100 words.", pillars: ["intent_match", "local_relevance", "conversion_ai"] },
      { h2: "Why {City} Chooses {Business} for {Service}", h3: ["Years of experience", "Licensing & insurance", "Real reviews"], purpose: "E-E-A-T proof: years operating, license/permits, real review count.", pillars: ["eeat_trust"] },
      { h2: "Our {City} {Service} Services", h3: [], purpose: "Card grid linking to each service spoke (internal links).", pillars: ["internal_linking", "intent_match"] },
      { h2: "Areas We Serve Across {City}", h3: [], purpose: "Link to area spokes; name real neighborhoods.", pillars: ["local_relevance", "internal_linking"] },
      { h2: "How Booking {Service} in {City} Works", h3: ["Get a quote", "Confirm details", "Enjoy the ride"], purpose: "Low-friction process → conversion.", pillars: ["conversion_ai", "problem_solution"] },
      { h2: "Get Your Free {City} {Service} Quote", h3: [], purpose: "Primary CTA with NAP + booking form.", pillars: ["conversion_ai", "eeat_trust"] },
    ],
  },

  service: {
    pageType: "service",
    label: "Service",
    defaultIntent: "transactional",
    wordCount: { min: 900, max: 1400 },
    requiredPillars: [
      "intent_match",
      "local_relevance",
      "problem_solution",
      "eeat_trust",
      "modern_schema",
      "internal_linking",
      "conversion_ai",
    ],
    schemaTypes: ["Service", "LocalBusiness", "BreadcrumbList"],
    wantsAiOverviewBlock: true,
    sections: [
      { h2: "When Do You Need {Service} in {City}?", h3: [], purpose: "Name the specific pain this service solves in this market — answer-first.", pillars: ["problem_solution", "intent_match", "conversion_ai"] },
      { h2: "Our {City} {Service} — What's Included", h3: ["What's included", "What makes it different"], purpose: "Concrete deliverable, not generic prose.", pillars: ["problem_solution"] },
      { h2: "How Our {Service} Works, Step by Step", h3: ["Get a quote", "Confirm details", "We handle the rest"], purpose: "How we deliver — builds trust + reduces booking friction.", pillars: ["eeat_trust", "conversion_ai"] },
      { h2: "Why {City} Chooses Us for {Service}", h3: ["Years of experience", "Licensing & insurance", "Verified reviews"], purpose: "E-E-A-T: years, credentials, review snippet.", pillars: ["eeat_trust"] },
      { h2: "How Much Does {Service} Cost in {City}?", h3: ["What affects the price", "How to get a quote"], purpose: "Transparent price drivers + quote CTA (real rates if known).", pillars: ["conversion_ai", "problem_solution"] },
      { h2: "{Service} Across {City} & Nearby Areas", h3: [], purpose: "Link to area spokes + name neighborhoods.", pillars: ["local_relevance", "internal_linking"] },
      { h2: "{Service} in {City}: Your Questions Answered", h3: [], purpose: "FAQ-as-content (on-page Q&A, NOT FAQ schema) — captures conversational + PAA queries.", pillars: ["conversion_ai", "intent_match"] },
      { h2: "Book {Service} in {City} Today", h3: [], purpose: "Final CTA with NAP.", pillars: ["conversion_ai"] },
    ],
  },

  area: {
    pageType: "area",
    label: "Area / Location",
    defaultIntent: "transactional",
    wordCount: { min: 800, max: 1200 },
    requiredPillars: [
      "intent_match",
      "local_relevance",
      "problem_solution",
      "eeat_trust",
      "modern_schema",
      "internal_linking",
      "conversion_ai",
    ],
    schemaTypes: ["Service", "LocalBusiness", "BreadcrumbList"],
    wantsAiOverviewBlock: true,
    sections: [
      // Area pages lead with AREA DETAIL — this is what separates a real local
      // page from a doorway page. Neighborhoods/landmarks/routes come FIRST.
      { h2: "{Service} in {Area}: Neighborhoods, Landmarks & Routes", h3: ["Neighborhoods we cover", "Landmarks & routes", "Local context"], purpose: "Real local detail FIRST — neighborhoods, landmarks, common routes/access. The anti-doorway signal.", pillars: ["local_relevance", "intent_match"] },
      { h2: "Why {Area} Riders Book a Dedicated {Service}", h3: [], purpose: "The specific problem riders/customers in THIS area face that the service solves.", pillars: ["problem_solution", "local_relevance"] },
      { h2: "How We Serve {Area} — Coverage, Timing & Routes", h3: ["Coverage & timing", "What's specific here"], purpose: "How we serve THIS area specifically — pickup times, routes, area-specific notes.", pillars: ["problem_solution", "eeat_trust"] },
      { h2: "What {Area} Customers Say", h3: ["Reviews from {Area}", "Routes we run here"], purpose: "Area-anchored social proof (real reviews / route examples if known).", pillars: ["eeat_trust", "local_relevance"] },
      { h2: "More {City} Areas & Services We Cover", h3: [], purpose: "Link to area hub + sibling areas + relevant services.", pillars: ["internal_linking"] },
      { h2: "Book {Service} in {Area}", h3: [], purpose: "Area-scoped CTA with NAP.", pillars: ["conversion_ai"] },
    ],
  },

  blog: {
    pageType: "blog",
    label: "Blog (capsule)",
    defaultIntent: "informational",
    wordCount: { min: 1200, max: 2000 },
    requiredPillars: [
      "intent_match",
      "problem_solution",
      "eeat_trust",
      "internal_linking",
      "conversion_ai",
    ],
    schemaTypes: ["Article", "BreadcrumbList"],
    wantsAiOverviewBlock: true,
    sections: [
      // Capsule mode: each H2 is a question, opens with a TLDR, cites sources.
      { h2: "{Question 1}?", h3: ["TLDR", "Detail", "Sources"], purpose: "Capsule: H2-as-question → 1-2 sentence TLDR answer → detail → citation.", pillars: ["intent_match", "conversion_ai"] },
      { h2: "{Question 2}?", h3: ["TLDR", "Detail"], purpose: "Capsule answering the next sub-question in the cluster.", pillars: ["intent_match", "conversion_ai"] },
      { h2: "{Question 3}?", h3: ["TLDR", "Detail"], purpose: "Capsule answering the next sub-question in the cluster.", pillars: ["problem_solution"] },
      { h2: "What This Means for {City} {Service}", h3: [], purpose: "Localize the topic + link to the relevant service/area spoke.", pillars: ["local_relevance", "internal_linking"] },
      { h2: "Need {Service} in {City}? Talk to a Local Expert", h3: [], purpose: "Soft conversion CTA back to the money page.", pillars: ["conversion_ai", "eeat_trust"] },
    ],
  },

  about: {
    pageType: "about",
    label: "About",
    defaultIntent: "informational",
    wordCount: { min: 500, max: 900 },
    requiredPillars: ["eeat_trust", "local_relevance", "modern_schema", "internal_linking", "conversion_ai"],
    schemaTypes: ["AboutPage", "LocalBusiness", "BreadcrumbList"],
    wantsAiOverviewBlock: false,
    sections: [
      { h2: "Our Story: {Service} in {City} Done Right", h3: ["How we started", "Years serving {City}"], purpose: "First-hand experience signal — the 'E' in E-E-A-T.", pillars: ["eeat_trust", "local_relevance"] },
      { h2: "Licensing, Insurance & Credentials", h3: [], purpose: "License numbers, insurance, associations (real values only).", pillars: ["eeat_trust"] },
      { h2: "Meet the Team Behind {Business}", h3: [], purpose: "Real people / experience — authority signal.", pillars: ["eeat_trust"] },
      { h2: "{Service} Services We Offer in {City}", h3: [], purpose: "Link to services + areas.", pillars: ["internal_linking"] },
      { h2: "Book {Service} or Get in Touch", h3: [], purpose: "NAP + CTA.", pillars: ["conversion_ai"] },
    ],
  },

  contact: {
    pageType: "contact",
    label: "Contact",
    defaultIntent: "transactional",
    wordCount: { min: 300, max: 600 },
    requiredPillars: ["local_relevance", "eeat_trust", "modern_schema", "conversion_ai"],
    schemaTypes: ["ContactPage", "LocalBusiness", "BreadcrumbList"],
    wantsAiOverviewBlock: false,
    sections: [
      { h2: "Contact {Business} — {City} {Service}", h3: ["Phone", "Email", "Hours"], purpose: "Complete NAP — the canonical citation source.", pillars: ["eeat_trust", "local_relevance"] },
      { h2: "Areas We Cover in {City}", h3: [], purpose: "Map + named coverage area.", pillars: ["local_relevance"] },
      { h2: "Request Your Free {Service} Quote", h3: [], purpose: "Primary conversion form.", pillars: ["conversion_ai"] },
    ],
  },

  pricing: {
    pageType: "pricing",
    label: "Pricing",
    defaultIntent: "commercial",
    wordCount: { min: 600, max: 1100 },
    requiredPillars: ["intent_match", "problem_solution", "eeat_trust", "modern_schema", "conversion_ai"],
    schemaTypes: ["Service", "LocalBusiness", "BreadcrumbList"],
    wantsAiOverviewBlock: true,
    sections: [
      { h2: "How much does {service} cost in {City}?", h3: ["TLDR", "Rate table"], purpose: "Answer-first price range (real rates if known) — captures 'cost'/'price' queries + AI Overview.", pillars: ["intent_match", "conversion_ai", "problem_solution"] },
      { h2: "What Affects {Service} Pricing in {City}", h3: [], purpose: "Honest price drivers — builds trust vs. hidden-fee competitors.", pillars: ["eeat_trust", "problem_solution"] },
      { h2: "What's Included in Your {Service}", h3: [], purpose: "Scope clarity reduces objection.", pillars: ["problem_solution"] },
      { h2: "Get an Exact {Service} Quote", h3: [], purpose: "Quote CTA with NAP.", pillars: ["conversion_ai"] },
    ],
  },

  faq: {
    pageType: "faq",
    label: "FAQ (as content)",
    defaultIntent: "informational",
    wordCount: { min: 700, max: 1300 },
    requiredPillars: ["intent_match", "problem_solution", "internal_linking", "conversion_ai"],
    // FAQ-AS-CONTENT: real on-page Q&A. We deliberately do NOT emit FAQPage
    // schema — Google killed FAQ rich results for most sites and it can
    // trigger spam flags. Schema stays LocalBusiness/Breadcrumb only.
    schemaTypes: ["LocalBusiness", "BreadcrumbList"],
    wantsAiOverviewBlock: true,
    sections: [
      { h2: "{Top question}?", h3: ["TLDR", "Detail"], purpose: "Answer-first to the highest-volume question/near-me query.", pillars: ["intent_match", "conversion_ai"] },
      { h2: "{Question 2}?", h3: [], purpose: "Conversational/PAA query coverage.", pillars: ["conversion_ai"] },
      { h2: "{Question 3}?", h3: [], purpose: "Conversational/PAA query coverage.", pillars: ["conversion_ai"] },
      { h2: "{Question 4}?", h3: [], purpose: "Conversational/PAA query coverage.", pillars: ["problem_solution"] },
      { h2: "Still Have Questions About {Service} in {City}?", h3: [], purpose: "CTA + links to service/area spokes.", pillars: ["internal_linking", "conversion_ai"] },
    ],
  },
};

export function templateFor(pageType: PageType): PageTypeTemplate {
  return TEMPLATES[pageType];
}

/**
 * The page type a keyword should become. Structure of the KEYWORD ITSELF wins
 * over SEMrush's intent code, because SEMrush mis-tags local money queries all
 * the time (e.g. it calls bare "deep cleaning" informational and "deep cleaning
 * dubai" commercial). In local SEO a "{service} {city}" query is a service /
 * money page — NEVER a blog. We only route to blog for genuinely research-shaped
 * queries, and to pricing for explicit price queries.
 *
 * Order of precedence:
 *   1. Question / research-shaped ("how to", "what is", "guide", "tips", "vs")  → blog
 *   2. Explicit price intent ("cost", "price", "rates", "how much", "cheap")     → pricing
 *   3. Any service/company query (service nouns present)                         → service
 *   4. Otherwise fall back to the SEMrush intent mapping.
 */
const PRICE_RE = /\b(cost|costs?|price|prices|pricing|rate|rates|fee|fees|how much|cheap|cheapest|affordable|budget|quote)\b/i;
const RESEARCH_RE = /\b(how|what|why|when|where|who|which|guide|tips?|ideas?|checklist|examples?|meaning|definition|vs|versus|difference|benefits?|pros and cons)\b/i;
// Cleaning-services commercial-intent nouns. Matches queries like
// "deep cleaning services dubai", "villa cleaning company", "sofa cleaning
// hire", "carpet cleaning booking", "office cleaner near me".
const SERVICE_NOUN_RE = /\b(service|services|company|companies|cleaner|cleaners|cleaning|maid|maids|housekeeping|maintenance|sanitisation|sanitization|disinfection|hire|booking|quote|near me)\b/i;

export function recommendPageType(targetKeyword: string, intent: SemrushKeyword["intent"]): PageType {
  const kw = (targetKeyword || "").toLowerCase().trim();
  // 1. Genuinely research/question-shaped → blog. (Price words handled next so
  //    "how much does X cost" goes to pricing, not blog.)
  if (RESEARCH_RE.test(kw) && !PRICE_RE.test(kw)) return "blog";
  // 2. Explicit price query → pricing.
  if (PRICE_RE.test(kw)) return "pricing";
  // 3. Service / company query (the common local money page) → service, even if
  //    SEMrush tagged it commercial / navigational / informational.
  if (SERVICE_NOUN_RE.test(kw)) return "service";
  // 4. Fall back to the SEMrush intent code.
  switch (intent) {
    case "transactional": return "service";
    case "commercial": return "pricing";
    case "informational": return "blog";
    case "navigational": return "home";
    default: return "service";
  }
}

// ============================================================
// Vertical-awareness
// ============================================================

/**
 * The assembled vertical context drives the angle + section emphasis. It is
 * built from stored business facts (no fabrication) and falls back to the
 * network's primary vertical (Dubai cleaning services).
 */
export interface VerticalContext {
  /** Canonical vertical key — e.g. 'cleaning_services', 'hvac', 'plumbing'. */
  vertical: string;
  /** Human label for prompts. */
  label: string;
  /** The dominant urgency/angle this vertical's pages should lead with. */
  angle: string;
  /** Words/phrases that signal trust in this vertical (license kinds, etc.). */
  trustSignals: string[];
  /** Typical conversion action. */
  conversionAction: string;
  /** The grounded facts available (or noted missing) for this site. */
  facts: GroundedFacts;
}

/** Facts the brief is allowed to use, pulled from the DB. Never invented. */
export interface GroundedFacts {
  businessName: string | null;
  city: string | null;
  region: string | null;
  serviceAreas: string[];
  neighborhoods: string[];
  phone: string | null;
  email: string | null;
  address: string | null;
  ratingValue: string | null;
  ratingCount: number | null;
  yearsExperience: number | null;
  licenses: string[];
  fleetOrAssets: string[];
  /** Free-form business facts blob (from site_build_projects.business_facts). */
  raw: Record<string, unknown>;
  /** Pillar-keyed list of facts the template wanted but are missing. */
  missing: string[];
}

/**
 * Per-vertical angle profiles. The STRUCTURE template is shared; this layer
 * rewrites the lead angle, trust vocabulary, and conversion verb so the same
 * service-page skeleton reads correctly for very different industries.
 */
const VERTICAL_PROFILES: Record<string, Omit<VerticalContext, "facts">> = {
  hvac: {
    vertical: "hvac",
    label: "HVAC (heating, cooling, AC repair)",
    angle: "same-day urgency during heatwaves/cold snaps + comfort restoration",
    trustSignals: ["HVAC license", "manufacturer certifications", "years in business", "warranty", "verified reviews"],
    conversionAction: "book a same-day service call",
  },
  plumbing: {
    vertical: "plumbing",
    label: "plumbing service",
    angle: "emergency response + preventing water damage",
    trustSignals: ["plumbing license", "bonded & insured", "years in business", "warranty", "verified reviews"],
    conversionAction: "call for emergency service",
  },
  general_local_service: {
    vertical: "general_local_service",
    label: "local service business",
    angle: "trusted local provider + fast, reliable service",
    trustSignals: ["licensing", "insurance", "years in business", "verified reviews"],
    conversionAction: "request a quote",
  },
  cleaning_services: {
    vertical: "cleaning_services",
    label: "residential & commercial cleaning service",
    angle: "trust + reliability + spotless results + flexible recurring plans",
    trustSignals: ["bonded & insured", "background-checked staff", "years in business", "satisfaction guarantee", "verified reviews"],
    conversionAction: "get a free quote / book a cleaning",
  },
};

const DEFAULT_VERTICAL = "cleaning_services";

function profileForVertical(vertical: string): Omit<VerticalContext, "facts"> {
  return VERTICAL_PROFILES[vertical] ?? VERTICAL_PROFILES[DEFAULT_VERTICAL];
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function strOrNull(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

/**
 * Assemble the grounded facts + vertical context for a site. Reads from:
 *  - sites (city/region)
 *  - site_gbp (NAP, service areas, rating)
 *  - site_build_projects.business_facts (fleet, drivers, licenses, neighborhoods)
 *  - org_settings.industry (network-wide vertical default)
 *
 * Never fabricates. Missing-but-wanted facts are recorded in `facts.missing`.
 */
export async function assembleVerticalContext(siteId: string): Promise<VerticalContext> {
  await ensureSchema();

  const [site] = await db().select().from(sites).where(eq(sites.id, siteId)).limit(1);
  const [gbp] = await db().select().from(siteGbp).where(eq(siteGbp.siteId, siteId)).limit(1);
  const [project] = await db()
    .select()
    .from(siteBuildProjects)
    .where(eq(siteBuildProjects.publishedSiteId, siteId))
    .limit(1);
  const [org] = await db().select().from(orgSettings).where(eq(orgSettings.id, "singleton")).limit(1);

  const bf = (project?.businessFacts ?? {}) as Record<string, unknown>;

  // Vertical: explicit business-fact override → org-wide industry → default.
  const vertical =
    strOrNull(bf.vertical) ||
    strOrNull(bf.industry) ||
    org?.industry ||
    DEFAULT_VERTICAL;
  const profile = profileForVertical(vertical);

  // Neighborhoods: from service_areas fact blob (neighborhood field) + gbp.
  const neighborhoods = [
    ...asArray(bf.service_areas)
      .map((a) => (a && typeof a === "object" ? strOrNull((a as Record<string, unknown>).neighborhood) : strOrNull(a)))
      .filter((x): x is string => !!x),
  ];

  const licenses = asArray(bf.licenses)
    .map((l) => {
      if (l && typeof l === "object") {
        const o = l as Record<string, unknown>;
        return [strOrNull(o.kind), strOrNull(o.number)].filter(Boolean).join(" ");
      }
      return strOrNull(l) ?? "";
    })
    .filter(Boolean);

  const fleet = asArray(bf.fleet)
    .map((f) => {
      if (f && typeof f === "object") {
        const o = f as Record<string, unknown>;
        return [strOrNull(o.year), strOrNull(o.make), strOrNull(o.model)].filter(Boolean).join(" ");
      }
      return strOrNull(f) ?? "";
    })
    .filter(Boolean);

  const ratingObj = (bf.aggregate_rating ?? {}) as Record<string, unknown>;
  const facts: GroundedFacts = {
    businessName: gbp?.businessName ?? project?.businessName ?? site?.name ?? null,
    city: gbp?.city ?? project?.city ?? site?.city ?? null,
    region: gbp?.region ?? project?.region ?? site?.region ?? null,
    serviceAreas: gbp?.serviceAreas?.length ? gbp.serviceAreas : [],
    neighborhoods,
    phone: gbp?.phone ?? strOrNull(bf.contact_phone),
    email: gbp?.publicEmail ?? strOrNull(bf.contact_email),
    address:
      gbp?.street && gbp?.city
        ? [gbp.street, gbp.city, gbp.region, gbp.postalCode].filter(Boolean).join(", ")
        : strOrNull(bf.address),
    ratingValue: gbp?.ratingValue ?? strOrNull(ratingObj.value),
    ratingCount: gbp?.ratingCount ?? (typeof ratingObj.count === "number" ? ratingObj.count : null),
    yearsExperience: typeof bf.years_in_business === "number" ? bf.years_in_business : null,
    licenses,
    fleetOrAssets: fleet,
    raw: bf,
    missing: [],
  };

  // Record what's missing so the brief can say so instead of inventing.
  if (!facts.city) facts.missing.push("city / primary service location");
  if (facts.serviceAreas.length === 0 && facts.neighborhoods.length === 0)
    facts.missing.push("service areas / neighborhoods (local relevance)");
  if (!facts.phone) facts.missing.push("public phone (NAP)");
  if (!facts.address) facts.missing.push("street address (NAP / LocalBusiness schema)");
  if (facts.licenses.length === 0) facts.missing.push("license / permit numbers (E-E-A-T)");
  if (!facts.ratingValue || !facts.ratingCount) facts.missing.push("aggregate rating + review count (E-E-A-T)");
  if (facts.yearsExperience == null) facts.missing.push("years in business (experience signal)");

  return { ...profile, facts };
}

// ============================================================
// Keyword harvest (head + long-tail + question/near-me, intent + AIO tagged)
// ============================================================

export interface HarvestedKeyword extends SemrushKeyword {
  /** Is this a question/PAA-style query? */
  isQuestion: boolean;
  /** Is this a near-me / hyper-local query? */
  isNearMe: boolean;
  /** Likely to trigger an AI Overview (informational/question + non-trivial). */
  likelyAiOverview: boolean;
}

export interface KeywordHarvest {
  ok: boolean;
  source: "semrush" | "fallback";
  error?: string;
  head: HarvestedKeyword[];
  longTail: HarvestedKeyword[];
  /** Semantically related terms (SEMrush phrase_related) — the practical "LSI" set. */
  lsi: HarvestedKeyword[];
  questions: HarvestedKeyword[];
  nearMe: HarvestedKeyword[];
  aiOverviewTriggers: HarvestedKeyword[];
  all: HarvestedKeyword[];
  notes: string[];
}

const NEAR_ME_RE = /\bnear me\b|\bnearby\b|\bclose to me\b/i;
const QUESTION_RE = /^(how|what|why|when|where|which|who|is|are|can|do|does|should)\b/i;

function tagKeyword(k: SemrushKeyword): HarvestedKeyword {
  const kw = k.keyword.toLowerCase();
  const isQuestion = k.source === "question" || QUESTION_RE.test(kw) || kw.includes("?");
  const isNearMe = NEAR_ME_RE.test(kw);
  // AI Overviews skew informational/question. Transactional "near me" rarely
  // shows an AIO. Honest heuristic, not a guarantee.
  const likelyAiOverview =
    (isQuestion || k.intent === "informational" || k.intent === "commercial") &&
    !isNearMe &&
    kw.split(/\s+/).length >= 3;
  return { ...k, isQuestion, isNearMe, likelyAiOverview };
}

/**
 * Exhaustive keyword pull for a target keyword. Reuses semrush.ts (head via
 * phrase_this, related, broad via fullsearch, questions via phrase_questions).
 * Then buckets head / long-tail / question / near-me and tags AI-Overview
 * likelihood per keyword.
 *
 * When SEMrush isn't configured, returns a fallback harvest derived from the
 * seed so the brief is still buildable (head = seed; near-me + question
 * variants synthesized) — flagged source:"fallback".
 */
export async function harvestKeywords(targetKeyword: string, db_ = "ca"): Promise<KeywordHarvest> {
  const seed = targetKeyword.trim();
  if (!seed) {
    return { ok: false, source: "fallback", error: "missing-keyword", head: [], longTail: [], lsi: [], questions: [], nearMe: [], aiOverviewTriggers: [], all: [], notes: [] };
  }

  if (!hasSemrushKey()) {
    return fallbackHarvest(seed);
  }

  let res: SemrushResult;
  try {
    res = await researchKeywords(seed, db_, 60);
  } catch (e) {
    const fb = fallbackHarvest(seed);
    fb.notes.push(`semrush threw: ${(e as Error).message}`);
    return fb;
  }
  if (!res.ok && res.keywords.length === 0) {
    const fb = fallbackHarvest(seed);
    fb.notes.push(...(res.error ? [res.error] : res.notes));
    return fb;
  }

  const all = res.keywords.map(tagKeyword);
  const head = all.filter((k) => k.keyword.toLowerCase().split(/\s+/).length <= 3 && !k.isQuestion);
  const longTail = all.filter((k) => k.keyword.toLowerCase().split(/\s+/).length >= 4 && !k.isQuestion);
  const questions = all.filter((k) => k.isQuestion);
  const nearMe = all.filter((k) => k.isNearMe);
  const aiOverviewTriggers = all.filter((k) => k.likelyAiOverview);
  // LSI / semantically-related: SEMrush phrase_related results (topic-adjacent
  // terms), excluding questions/near-me which have their own buckets.
  const lsi = all.filter((k) => k.source === "related" && !k.isQuestion && !k.isNearMe);

  return {
    ok: true,
    source: "semrush",
    head: head.slice(0, 12),
    longTail: longTail.slice(0, 20),
    lsi: lsi.slice(0, 15),
    questions: questions.slice(0, 15),
    nearMe: nearMe.slice(0, 10),
    aiOverviewTriggers: aiOverviewTriggers.slice(0, 15),
    all,
    notes: res.notes,
  };
}

function mkKw(keyword: string, source: SemrushKeyword["source"], intent: SemrushKeyword["intent"]): HarvestedKeyword {
  return tagKeyword({ keyword, volume: null, cpc: null, competition: null, difficulty: null, intent, intentFromSemrush: false, opportunity: 0, source });
}

/** Seed-only harvest when SEMrush is absent. Honest: no real volumes. */
function fallbackHarvest(seed: string): KeywordHarvest {
  const head = [mkKw(seed, "seed", "transactional")];
  const nearMe = [mkKw(`${seed} near me`, "related", "transactional")];
  const questions = [
    mkKw(`how much does ${seed} cost`, "question", "commercial"),
    mkKw(`what is the best ${seed}`, "question", "informational"),
    mkKw(`how do I book ${seed}`, "question", "transactional"),
  ];
  const all = [...head, ...nearMe, ...questions];
  return {
    ok: true,
    source: "fallback",
    head,
    longTail: [],
    lsi: [],
    questions,
    nearMe,
    aiOverviewTriggers: all.filter((k) => k.likelyAiOverview),
    all,
    notes: ["SEMRUSH_API_KEY not set — keyword data is synthesized from the seed only (no real volumes)."],
  };
}

// ============================================================
// Brief object shape
// ============================================================

export interface OutlineSection {
  h2: string;
  h3: string[];
  purpose: string;
  pillarsCovered: PillarKey[];
}

export interface SchemaPlan {
  types: string[];
  /** Per-type note on what the page must expose for the schema to be valid. */
  notes: string[];
  /** Explicit reminder of what we deliberately do NOT use. */
  avoid: string[];
}

export interface AiOverviewScore {
  score: number; // 0-100
  reasons: string[];
  /** Honest disclaimer carried with the score. */
  disclaimer: string;
}

export interface ContentBriefPlan {
  pageType: PageType;
  targetKeyword: string;
  intent: SemrushKeyword["intent"];
  /** Intent→page-type guidance: did the chosen page type match the keyword's intent? */
  intentPlan: {
    detectedIntent: SemrushKeyword["intent"];
    fromSemrush: boolean;
    recommendedPageType: PageType;
    matchesChosen: boolean;
    note: string;
  };
  vertical: string;
  wordCountTarget: { min: number; max: number };
  headlineOptions: string[]; // 3
  metaTitleOptions: string[];
  outline: OutlineSection[];
  schemaPlan: SchemaPlan;
  /** Answer-first ~40-60 word block engineered for AI-Overview citation. */
  aiOverviewAnswerBlock: string;
  geoEntities: string[];
  internalLinkTargets: string[];
  aiOverviewScore: number; // 0-100 (mirror of aiOverviewReadiness.score)
  aiOverviewReadiness: AiOverviewScore;
  pillarChecklist: PillarCheck[];
  /** Keyword groupings used to ground the brief. */
  keywords: {
    head: string[];
    longTail: string[];
    lsi: string[];
    questions: string[];
    nearMe: string[];
    aiOverviewTriggers: string[];
    source: "semrush" | "fallback";
  };
  /** Facts the brief WANTED but the site doesn't have yet. Never invented. */
  needsBusinessFacts: string[];
}

export interface ProposeBriefInput {
  siteId: string;
  pageType: PageType;
  targetKeyword: string;
  /** Optional cluster of related keywords (e.g. from a fan-out). */
  cluster?: string[];
}

// ============================================================
// Deterministic skeleton builders
// ============================================================

/** Fill {tokens} in a template string from the vertical context. */
function fill(s: string, ctx: VerticalContext, pageType: PageType, targetKeyword: string): string {
  const f = ctx.facts;
  return s
    .replace(/\{Business\}/g, f.businessName ?? "us")
    .replace(/\{City\}/g, f.city ?? "{needs business fact: city}")
    .replace(/\{Area\}/g, f.city ?? "{needs business fact: area}")
    .replace(/\{Service\}/g, capitalize(serviceLabel(targetKeyword, ctx)))
    .replace(/\{service\}/g, serviceLabel(targetKeyword, ctx));
}

function capitalize(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

function serviceLabel(targetKeyword: string, ctx: VerticalContext): string {
  // Strip city + "near me" noise so the service phrase reads cleanly in headings.
  let s = targetKeyword.toLowerCase();
  if (ctx.facts.city) s = s.replace(new RegExp(`\\b${escapeRe(ctx.facts.city.toLowerCase())}\\b`, "g"), "").trim();
  s = s.replace(NEAR_ME_RE, "").replace(/\s+/g, " ").trim();
  return s || ctx.label;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Build the deterministic outline from the template + vertical fill. */
function buildOutline(
  tmpl: PageTypeTemplate,
  ctx: VerticalContext,
  targetKeyword: string,
  harvest: KeywordHarvest,
): OutlineSection[] {
  const questionPool = [...harvest.questions, ...harvest.aiOverviewTriggers].map((k) => k.keyword);
  let qi = 0;
  return tmpl.sections.map((sec) => {
    let h2 = fill(sec.h2, ctx, tmpl.pageType, targetKeyword);
    // For capsule/FAQ templates, replace {Question N} / {Top question} tokens
    // with real harvested questions where available.
    if (/\{(Question|Top question)/i.test(sec.h2)) {
      const q = questionPool[qi++];
      h2 = q ? capitalize(q.replace(/\?+$/, "")) + "?" : h2.replace(/\{[^}]+\}/g, "this");
    }
    return { h2, h3: sec.h3.map((h) => fill(h, ctx, tmpl.pageType, targetKeyword)), purpose: sec.purpose, pillarsCovered: sec.pillars };
  });
}

/** Geo-entities: real, grounded place names only. */
function buildGeoEntities(ctx: VerticalContext): string[] {
  const f = ctx.facts;
  const set = new Set<string>();
  if (f.city) set.add(f.city);
  if (f.region) set.add(f.region);
  for (const a of f.serviceAreas) set.add(a);
  for (const n of f.neighborhoods) set.add(n);
  return [...set];
}

/** Internal-link targets implied by the page type + grounded areas/services. */
function buildInternalLinks(tmpl: PageTypeTemplate, ctx: VerticalContext): string[] {
  const links = new Set<string>();
  switch (tmpl.pageType) {
    case "home":
      links.add("/services/").add("/areas/").add("/about/").add("/contact/");
      break;
    case "service":
      links.add("/services/").add("/areas/").add("/pricing/").add("/contact/");
      break;
    case "area":
      links.add("/areas/").add("/services/").add("/contact/");
      break;
    case "blog":
      links.add("/services/").add("/contact/");
      break;
    case "pricing":
    case "faq":
      links.add("/services/").add("/contact/");
      break;
    case "about":
      links.add("/services/").add("/areas/").add("/contact/");
      break;
    case "contact":
      links.add("/services/");
      break;
  }
  // Add grounded area spokes (real neighborhoods only).
  for (const a of ctx.facts.serviceAreas.slice(0, 4)) {
    links.add(`/areas/${slugify(a)}/`);
  }
  return [...links];
}

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** Build the schema plan, encoding the no-FAQ/HowTo rich-results rule. */
function buildSchemaPlan(tmpl: PageTypeTemplate, ctx: VerticalContext): SchemaPlan {
  const f = ctx.facts;
  const notes: string[] = [];
  for (const t of tmpl.schemaTypes) {
    if (t === "LocalBusiness") {
      const have = [f.businessName && "name", f.address && "address", f.phone && "telephone"].filter(Boolean);
      const need = [!f.businessName && "name", !f.address && "address", !f.phone && "telephone"].filter(Boolean);
      notes.push(
        `LocalBusiness: ${have.length ? `have ${have.join(", ")}` : "no NAP yet"}${need.length ? `; needs business fact: ${need.join(", ")}` : ""}` +
          (f.ratingValue && f.ratingCount ? `; aggregateRating ${f.ratingValue} (${f.ratingCount})` : "; needs business fact: aggregateRating"),
      );
    } else if (t === "Service") {
      notes.push(`Service: provider=LocalBusiness, areaServed=${ctx.facts.serviceAreas.length ? ctx.facts.serviceAreas.join(", ") : "needs business fact: service areas"}`);
    } else if (t === "BreadcrumbList") {
      notes.push("BreadcrumbList: home → hub → this page");
    } else {
      notes.push(`${t}: standard fields`);
    }
  }
  return {
    types: tmpl.schemaTypes,
    notes,
    avoid: ["FAQPage", "HowTo"], // killed for rich results / spam-flag risk; use on-page FAQ-as-content instead
  };
}

/** Deterministic fallback headlines/meta when no LLM is available. */
function fallbackHeadlines(ctx: VerticalContext, targetKeyword: string): { headlines: string[]; metaTitles: string[] } {
  const svc = capitalize(serviceLabel(targetKeyword, ctx));
  const city = ctx.facts.city ?? "Your City";
  const biz = ctx.facts.businessName ?? "Us";
  return {
    headlines: [
      `${svc} in ${city}`,
      `${svc} You Can Count On in ${city}`,
      `Professional ${svc} — ${city} & Surrounding Areas`,
    ],
    metaTitles: [`${svc} in ${city} | ${biz}`, `${city} ${svc} | Book Online | ${biz}`],
  };
}

// ============================================================
// AI-Overview readiness scoring
// ============================================================

/**
 * Honest structuring score (0-100). It measures whether the brief is BUILT
 * the way AI Overviews / answer engines favour — answer-first block, entity
 * coverage, question H2s, modern schema. It is NOT a prediction that Google
 * will cite the page; that depends on authority, freshness, and SERP context.
 */
export function scoreAiOverviewReadiness(brief: {
  aiOverviewAnswerBlock: string;
  geoEntities: string[];
  outline: OutlineSection[];
  schemaPlan: SchemaPlan;
  keywords: { questions: string[]; aiOverviewTriggers: string[] };
  pageType: PageType;
}): AiOverviewScore {
  const reasons: string[] = [];
  let score = 0;

  // 1. Answer-first block present + tight (~40-60 words). (30)
  const wc = brief.aiOverviewAnswerBlock.trim().split(/\s+/).filter(Boolean).length;
  if (wc >= 25 && wc <= 90) {
    score += 30;
    reasons.push(`+30 answer-first block present (${wc} words)`);
  } else if (wc > 0) {
    score += 15;
    reasons.push(`+15 answer block present but ${wc < 25 ? "too short" : "too long"} (${wc} words; aim 40-60)`);
  } else {
    reasons.push("+0 no answer-first block — biggest AIO miss");
  }

  // 2. Question-style H2s in the outline. (20)
  const qH2 = brief.outline.filter((s) => s.h2.trim().endsWith("?")).length;
  if (qH2 >= 2) {
    score += 20;
    reasons.push(`+20 ${qH2} question-style H2s (PAA/conversational coverage)`);
  } else if (qH2 === 1) {
    score += 10;
    reasons.push("+10 only 1 question H2 — add more for PAA coverage");
  } else {
    reasons.push("+0 no question H2s — answer engines favour Q-shaped headings");
  }

  // 3. Geo / entity coverage. (20)
  if (brief.geoEntities.length >= 3) {
    score += 20;
    reasons.push(`+20 ${brief.geoEntities.length} grounded geo entities`);
  } else if (brief.geoEntities.length >= 1) {
    score += 10;
    reasons.push(`+10 only ${brief.geoEntities.length} geo entity — add real neighborhoods/landmarks`);
  } else {
    reasons.push("+0 no grounded geo entities — needs business fact: service areas");
  }

  // 4. Modern schema planned (LocalBusiness/Service/Breadcrumb), none banned. (15)
  const hasModern = brief.schemaPlan.types.some((t) => ["LocalBusiness", "Service", "Article"].includes(t));
  const hasBanned = brief.schemaPlan.types.some((t) => brief.schemaPlan.avoid.includes(t));
  if (hasModern && !hasBanned) {
    score += 15;
    reasons.push("+15 modern schema planned (no FAQ/HowTo)");
  } else if (hasModern) {
    score += 7;
    reasons.push("+7 modern schema planned but includes a banned type");
  } else {
    reasons.push("+0 no entity-bearing schema planned");
  }

  // 5. Conversational / question keyword coverage harvested. (15)
  const qCount = brief.keywords.questions.length + brief.keywords.aiOverviewTriggers.length;
  if (qCount >= 4) {
    score += 15;
    reasons.push(`+15 ${qCount} conversational/AIO-trigger keywords harvested`);
  } else if (qCount >= 1) {
    score += 7;
    reasons.push(`+7 only ${qCount} conversational keywords — pull more PAA/near-me`);
  } else {
    reasons.push("+0 no conversational keywords harvested");
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    reasons,
    disclaimer:
      "Structuring score only — measures whether the brief is built for AI-Overview eligibility (answer-first, entities, question H2s, schema). It does NOT predict that Google will cite the page; that depends on domain authority, freshness, and live SERP context.",
  };
}

// ============================================================
// LLM polish (prose-shaped fields only)
// ============================================================

interface LlmPolish {
  headlineOptions: string[];
  metaTitleOptions: string[];
  aiOverviewAnswerBlock: string;
}

const POLISH_SYSTEM = `You are a senior local-SEO content strategist. You produce ONLY the prose-shaped parts of a content brief: headline options, meta-title options, and a tight answer-first block engineered for AI-Overview citation.

Hard rules:
- GROUNDED ONLY. Use only the facts provided. NEVER invent neighborhoods, prices, license numbers, review counts, or claims. If a fact is missing, write around it — do not fabricate.
- The answer-first block must directly answer the target keyword's intent in 40-60 words, lead with the answer, and read naturally (no keyword stuffing).
- Headlines: 3 options, specific, include the service + city when known. No "world-class", "best-in-class", "premier", or other empty superlatives.
- Meta titles: 2 options, <= 60 chars, front-load the keyword.

Output STRICT JSON only:
{ "headlineOptions": ["..","..",".."], "metaTitleOptions": ["..",".."], "aiOverviewAnswerBlock": ".." }`;

async function llmPolish(
  tmpl: PageTypeTemplate,
  ctx: VerticalContext,
  targetKeyword: string,
  harvest: KeywordHarvest,
): Promise<LlmPolish | null> {
  let client;
  try {
    ({ client } = await getLLMClient({ tier: "standard" }));
  } catch {
    return null; // no key — caller falls back to deterministic
  }

  const f = ctx.facts;
  const factLines = [
    `Business: ${f.businessName ?? "(unknown — do not invent)"}`,
    `Vertical: ${ctx.label}`,
    `Angle to lead with: ${ctx.angle}`,
    `City: ${f.city ?? "(unknown — do not invent)"}`,
    `Region: ${f.region ?? "(unknown)"}`,
    `Service areas: ${f.serviceAreas.length ? f.serviceAreas.join(", ") : "(none stored — do not invent)"}`,
    `Neighborhoods: ${f.neighborhoods.length ? f.neighborhoods.join(", ") : "(none stored)"}`,
    `Years in business: ${f.yearsExperience ?? "(unknown)"}`,
    `Rating: ${f.ratingValue && f.ratingCount ? `${f.ratingValue} (${f.ratingCount} reviews)` : "(unknown — do not invent)"}`,
    `Trust signals available: ${ctx.trustSignals.join(", ")}`,
  ].join("\n");

  const user = [
    `Page type: ${tmpl.label} (target word count ${tmpl.wordCount.min}-${tmpl.wordCount.max})`,
    `Target keyword: "${targetKeyword}"`,
    `Default intent: ${tmpl.defaultIntent}`,
    "",
    "--- GROUNDED FACTS (use only these; do not invent) ---",
    factLines,
    "",
    `Top questions to potentially answer: ${[...harvest.questions, ...harvest.aiOverviewTriggers].slice(0, 6).map((k) => k.keyword).join(" | ") || "(none harvested)"}`,
    "",
    "Produce the JSON now.",
  ].join("\n");

  try {
    const resp = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 600,
      system: [{ type: "text", text: POLISH_SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: user }],
    });
    const text = resp.content.find((b): b is Extract<(typeof resp.content)[number], { type: "text" }> => b.type === "text")?.text ?? "";
    const parsed = safeParseJson(text);
    if (!parsed || typeof parsed !== "object") return null;
    const o = parsed as Record<string, unknown>;
    const headlines = Array.isArray(o.headlineOptions) ? o.headlineOptions.filter((x): x is string => typeof x === "string").slice(0, 3) : [];
    const metas = Array.isArray(o.metaTitleOptions) ? o.metaTitleOptions.filter((x): x is string => typeof x === "string").slice(0, 3) : [];
    const block = typeof o.aiOverviewAnswerBlock === "string" ? o.aiOverviewAnswerBlock.trim() : "";
    if (headlines.length === 0 && !block) return null;
    return { headlineOptions: headlines, metaTitleOptions: metas, aiOverviewAnswerBlock: block };
  } catch {
    return null;
  }
}

function safeParseJson(raw: string): unknown {
  if (!raw) return null;
  const stripped = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  try {
    return JSON.parse(stripped);
  } catch {
    const m = stripped.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
}

// ============================================================
// proposeBrief — the public entry point
// ============================================================

export async function proposeBrief(input: ProposeBriefInput): Promise<ContentBriefPlan> {
  const { siteId, pageType, targetKeyword, cluster } = input;
  const tmpl = templateFor(pageType);

  // 1. Vertical context + grounded facts.
  const ctx = await assembleVerticalContext(siteId);

  // 2. Keyword harvest (head + long-tail + question/near-me, intent + AIO tagged).
  const harvest = await harvestKeywords(targetKeyword);
  // Fold in any caller-supplied cluster keywords (e.g. fan-out) as long-tail.
  if (cluster?.length) {
    for (const c of cluster) {
      const tagged = tagKeyword({ keyword: c, volume: null, cpc: null, competition: null, difficulty: null, intent: "commercial", intentFromSemrush: false, opportunity: 0, source: "related" });
      if (tagged.isQuestion) harvest.questions.push(tagged);
      else harvest.longTail.push(tagged);
      harvest.all.push(tagged);
      if (tagged.likelyAiOverview) harvest.aiOverviewTriggers.push(tagged);
    }
  }

  // 3. Deterministic skeleton.
  const outline = buildOutline(tmpl, ctx, targetKeyword, harvest);
  const geoEntities = buildGeoEntities(ctx);
  const internalLinkTargets = buildInternalLinks(tmpl, ctx);
  const schemaPlan = buildSchemaPlan(tmpl, ctx);

  // 4. LLM polish for prose-shaped fields, with deterministic fallback.
  const polish = await llmPolish(tmpl, ctx, targetKeyword, harvest);
  const fb = fallbackHeadlines(ctx, targetKeyword);
  const headlineOptions = polish?.headlineOptions.length ? polish.headlineOptions : fb.headlines;
  const metaTitleOptions = polish?.metaTitleOptions.length ? polish.metaTitleOptions : fb.metaTitles;
  const aiOverviewAnswerBlock = tmpl.wantsAiOverviewBlock
    ? polish?.aiOverviewAnswerBlock ||
      (ctx.facts.city
        ? `${capitalize(serviceLabel(targetKeyword, ctx))} in ${ctx.facts.city}: needs business fact — answer-first block (40-60 words) should state who you serve, coverage, and the booking action. Provide rates / years / reviews to ground it.`
        : "needs business fact: city + service details to write the answer-first block")
    : "";

  // 5. Intent — anchor on the SEED keyword's own row (the exact target keyword),
  //    NOT head[0]: head[0] is just the first ≤3-word term and is often a
  //    tangential related keyword (e.g. bare "cleaning") that SEMrush mis-tags
  //    informational, which wrongly pushed service queries to "blog".
  const seedNorm = targetKeyword.trim().toLowerCase();
  const seedKw =
    harvest.all.find((k) => k.keyword.toLowerCase() === seedNorm) ??
    harvest.head[0];
  const intent = seedKw?.intent ?? tmpl.defaultIntent;
  const recommendedPageType = recommendPageType(targetKeyword, intent);
  const matchesChosen = recommendedPageType === pageType;
  const intentPlan = {
    detectedIntent: intent,
    fromSemrush: seedKw?.intentFromSemrush ?? false,
    recommendedPageType,
    matchesChosen,
    note: matchesChosen
      ? `“${targetKeyword}” reads as ${intent} — a ${tmpl.label} page is the right fit.`
      : `“${targetKeyword}” reads as ${intent}, which usually wants a ${templateFor(recommendedPageType).label} page, not ${tmpl.label}. Switch unless you have a reason.`,
  };

  // 6. Pillar checklist — does the brief satisfy each REQUIRED pillar?
  const pillarChecklist = buildPillarChecklist(tmpl, ctx, { outline, geoEntities, internalLinkTargets, schemaPlan, harvest });

  // 7. AI-Overview readiness.
  const keywords = {
    head: harvest.head.map((k) => k.keyword),
    longTail: harvest.longTail.map((k) => k.keyword),
    lsi: harvest.lsi.map((k) => k.keyword),
    questions: harvest.questions.map((k) => k.keyword),
    nearMe: harvest.nearMe.map((k) => k.keyword),
    aiOverviewTriggers: harvest.aiOverviewTriggers.map((k) => k.keyword),
    source: harvest.source,
  };
  const aiOverviewReadiness = scoreAiOverviewReadiness({
    aiOverviewAnswerBlock,
    geoEntities,
    outline,
    schemaPlan,
    keywords: { questions: keywords.questions, aiOverviewTriggers: keywords.aiOverviewTriggers },
    pageType,
  });

  // 8. Collect missing-fact markers (facts the brief wanted, site lacks).
  const needsBusinessFacts = [...new Set(ctx.facts.missing)];

  return {
    pageType,
    targetKeyword,
    intent,
    intentPlan,
    vertical: ctx.vertical,
    wordCountTarget: tmpl.wordCount,
    headlineOptions,
    metaTitleOptions,
    outline,
    schemaPlan,
    aiOverviewAnswerBlock,
    geoEntities,
    internalLinkTargets,
    aiOverviewScore: aiOverviewReadiness.score,
    aiOverviewReadiness,
    pillarChecklist,
    keywords,
    needsBusinessFacts,
  };
}

/** Per-pillar satisfaction check, grounded in what the brief actually has. */
function buildPillarChecklist(
  tmpl: PageTypeTemplate,
  ctx: VerticalContext,
  built: {
    outline: OutlineSection[];
    geoEntities: string[];
    internalLinkTargets: string[];
    schemaPlan: SchemaPlan;
    harvest: KeywordHarvest;
  },
): PillarCheck[] {
  const f = ctx.facts;
  return PILLAR_KEYS.map((pillar) => {
    const required = tmpl.requiredPillars.includes(pillar);
    let satisfied = false;
    let note = "";
    switch (pillar) {
      case "intent_match":
        satisfied = built.outline.length > 0;
        note = `Page-type "${tmpl.label}" matches ${tmpl.defaultIntent} intent.`;
        break;
      case "local_relevance":
        satisfied = built.geoEntities.length > 0;
        note = satisfied ? `Grounded geo entities: ${built.geoEntities.join(", ")}` : "needs business fact: service areas / neighborhoods";
        break;
      case "problem_solution":
        satisfied = built.outline.some((s) => /problem|solution|cost|price|process/i.test(s.h2));
        note = satisfied ? "Problem→solution section present in outline." : "Add an explicit problem→solution section.";
        break;
      case "eeat_trust":
        satisfied = !!(f.yearsExperience || f.licenses.length || (f.ratingValue && f.ratingCount));
        note = satisfied
          ? `Trust facts: ${[f.yearsExperience && `${f.yearsExperience}y`, f.licenses.length && `${f.licenses.length} license(s)`, f.ratingValue && f.ratingCount && `${f.ratingValue}/${f.ratingCount}`].filter(Boolean).join(", ")}`
          : "needs business fact: years in business / license / reviews";
        break;
      case "modern_schema":
        satisfied = built.schemaPlan.types.some((t) => !built.schemaPlan.avoid.includes(t));
        note = `Schema: ${built.schemaPlan.types.join(", ")} (avoid: ${built.schemaPlan.avoid.join(", ")})`;
        break;
      case "internal_linking":
        satisfied = built.internalLinkTargets.length >= 2;
        note = `Link targets: ${built.internalLinkTargets.join(", ")}`;
        break;
      case "conversion_ai":
        satisfied = built.outline.some((s) => s.pillarsCovered.includes("conversion_ai"));
        note = `Conversion action: ${ctx.conversionAction}.${tmpl.wantsAiOverviewBlock ? " AI-Overview answer block planned." : ""}`;
        break;
    }
    return { pillar, label: SEO_PILLARS[pillar], satisfied: required ? satisfied : satisfied || !required, note: required ? note : `(optional for this page type) ${note}` };
  });
}
