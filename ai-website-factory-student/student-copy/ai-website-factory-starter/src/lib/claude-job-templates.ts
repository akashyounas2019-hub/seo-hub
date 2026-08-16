/**
 * A3 — Claude Code job templates.
 *
 * Each template defines a structured task the Mac worker dispatches to
 * Claude Code (or, more precisely, builds the prompt that the worker
 * feeds into the local `claude` CLI).
 *
 * Templates are NICHE-AGNOSTIC. The operator types their industry once
 * (e.g. "dental clinic", "law firm") and the `niche` flows into `input.niche`
 * (or `ctx.niche`); every prompt reads it so the same templates work for any
 * business. The `buildPrompt` fn returns the full system+user prompt the
 * worker hands to Claude Code; the worker captures Claude's response
 * (Markdown) and posts it back via /api/claude-jobs/<id>/complete.
 */
import { nichePreface } from "./prompt-library";

// Design-taste gate, injected into every VISUAL build prompt (page generation,
// design DNA). Names the installed taste/craft skills the Mac worker invokes
// (design-taste-frontend · impeccable · emil-design-eng · review-animations) and
// inlines their core anti-slop rules so the server (API) executor — which can't
// load ~/.claude/skills — still benefits. House standards win on conflict.
export const DESIGN_SKILLS_DIRECTIVE = [
  "",
  "──────── DESIGN-TASTE GATE (every page goes through this) ────────",
  "Apply the installed taste & craft skills before finalizing layout, sections, copy, or styling:",
  "  • design-taste-frontend — anti-slop: no AI-purple gradients, no eyebrow on every section (≤1 per 3 sections), no duplicate-CTA-intent, hero ≤2 lines + subtext ≤20 words, one accent color locked page-wide, real images (never div fake-screenshots).",
  "  • impeccable — craft: body contrast ≥4.5:1, pair fonts on a contrast axis, tinted (never pure-black) shadows, no cards-nested-in-cards, full interaction states (loading/empty/error).",
  "  • emil-design-eng — motion: ease-out (never ease-in) for UI, custom curves, <300ms, scale(0.97) on :active, never animate from scale(0), honor prefers-reduced-motion.",
  "These layer on top of the project's house standards — house rules win on conflict (premium SVG icons only — never emoji; one locked accent color; mobile-first).",
  "─────────────────────────────────────────────────────────────────",
  "",
].join("\n");

/** Resolve the niche for a prompt from the job input / ctx, with a neutral fallback. */
function nicheOf(
  input: Record<string, string>,
  ctx?: { niche?: string },
): string {
  return (input.niche && input.niche.trim()) || (ctx?.niche && ctx.niche.trim()) || "local service business";
}

export interface JobTemplateField {
  name: string;
  label: string;
  type: "text" | "url" | "select" | "textarea" | "site";
  required: boolean;
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
  helpText?: string;
}

export interface JobTemplate {
  kind: string;
  label: string;
  description: string;
  category: "research" | "audit" | "content" | "design";
  /** Estimated duration in minutes — for the UI to set expectations. */
  estMinutes: number;
  fields: JobTemplateField[];
  /** Build the prompt the worker will feed to Claude Code. */
  buildPrompt(input: Record<string, string>, ctx: { siteName?: string; siteUrl?: string; siteCity?: string; siteRegion?: string; niche?: string }): string;
}

// Reference markets the global research job surveys. Not the user's
// market — the goal is INSPIRATION from best-in-class businesses worldwide.
const GLOBAL_MARKETS = [
  { city: "New York", country: "US", emoji: "🇺🇸" },
  { city: "Los Angeles", country: "US", emoji: "🇺🇸" },
  { city: "Miami", country: "US", emoji: "🇺🇸" },
  { city: "London", country: "UK", emoji: "🇬🇧" },
  { city: "Paris", country: "France", emoji: "🇫🇷" },
  { city: "Dubai", country: "UAE", emoji: "🇦🇪" },
  { city: "Sydney", country: "Australia", emoji: "🇦🇺" },
  { city: "Singapore", country: "Singapore", emoji: "🇸🇬" },
  { city: "Tokyo", country: "Japan", emoji: "🇯🇵" },
  { city: "Zurich", country: "Switzerland", emoji: "🇨🇭" },
];

export const JOB_TEMPLATES: JobTemplate[] = [
  // ────────────────────────────────────────────────────────────────
  // BUILD WORKFLOW — the new-site pipeline
  // ────────────────────────────────────────────────────────────────
  {
    kind: "build:global_research",
    label: "Build · Global design research",
    description:
      "Survey best-in-class sites in the business's niche worldwide (NYC, LA, London, Paris, Dubai, Sydney, Singapore, Tokyo, Zurich, Miami). Extract common patterns + standout uniques. Output 10-12 reference sites with what to learn from each.",
    category: "research",
    estMinutes: 15,
    fields: [
      {
        name: "businessName",
        label: "Business name (for context)",
        type: "text",
        required: true,
        placeholder: "Bright Smile Dental",
      },
      {
        name: "niche",
        label: "Business niche / industry",
        type: "text",
        required: true,
        placeholder: "dental clinic",
      },
      {
        name: "targetCity",
        label: "Target city (so we know what to differentiate FROM)",
        type: "text",
        required: true,
        placeholder: "Dubai",
      },
    ],
    buildPrompt(input, ctx) {
      const niche = nicheOf(input, ctx);
      const markets = GLOBAL_MARKETS.map((m) => `${m.city} (${m.country})`).join(", ");
      return [
        nichePreface(niche),
        `TASK: Global research pass for a NEW ${niche} website we're building.`,
        ``,
        `Target market: ${input.targetCity}`,
        `Business: ${input.businessName}`,
        ``,
        `Use WebSearch + WebFetch to survey best-in-class ${niche} websites across:`,
        markets,
        ``,
        `For each market, find the 1-2 most distinctive operators (not the biggest — the most VISUALLY DISTINCTIVE). Avoid Google's top 5 in each market — those are the average. We want creative outliers.`,
        ``,
        `Return Markdown with these sections:`,
        ``,
        `## Reference operators (10-12 sites)`,
        `For each: company name, URL, city, what makes them distinctive (1 sentence each), one specific element worth stealing.`,
        ``,
        `## What's "standard" everywhere`,
        `The patterns common across ALL strong ${niche} sites. These become table stakes for the new site.`,
        ``,
        `## Standout differentiators by market`,
        `What does NYC do that London doesn't? What's the Dubai aesthetic vs. Paris? Specific to the ${niche} space.`,
        ``,
        `## White space for ${input.targetCity}`,
        `What's underused in the target market that's working elsewhere?`,
        ``,
        `## 5 concrete design directions worth pitching`,
        `Each: name + 1-sentence concept + 2-sentence rationale tied to the references.`,
        ``,
        `Cite every claim with the URL inline.`,
      ].join("\n");
    },
  },
  {
    kind: "build:design_dna",
    label: "Build · Design DNA synthesis",
    description:
      "From the global research output, synthesize a unique Design DNA for THIS site — palette, typography, motifs, photo direction, microcopy voice. Anti-patterns explicitly called out.",
    category: "design",
    estMinutes: 8,
    fields: [
      {
        name: "businessName",
        label: "Business name",
        type: "text",
        required: true,
      },
      {
        name: "targetCity",
        label: "Target city",
        type: "text",
        required: true,
      },
      {
        name: "research",
        label: "Paste the global research output here",
        type: "textarea",
        required: true,
        helpText: "Auto-filled from the previous phase when run via /admin/build.",
      },
      {
        name: "niche",
        label: "Business niche / industry",
        type: "text",
        required: false,
        placeholder: "dental clinic",
      },
      {
        name: "preferences",
        label: "Any preferences / brand notes",
        type: "textarea",
        required: false,
        placeholder: "Optional: tone, must-haves, things to avoid",
      },
    ],
    buildPrompt(input, ctx) {
      const niche = nicheOf(input, ctx);
      return [
        nichePreface(niche),
        `TASK: Produce a unique Design DNA for ${input.businessName}, a ${niche} in ${input.targetCity}.`,
        ``,
        `Inputs:`,
        `--- RESEARCH ---`,
        input.research,
        `--- END RESEARCH ---`,
        ``,
        input.preferences ? `User preferences:\n${input.preferences}\n` : ``,
        ``,
        `Output Markdown with EXACTLY these sections (don't add or skip):`,
        ``,
        `## Positioning`,
        `One sentence that anchors everything. Must be DIFFERENT from at least 7 references in the research.`,
        ``,
        `## Palette`,
        `5 colors as a JSON code block:`,
        '```json',
        `{ "primary": "#hex", "accent": "#hex", "surface": "#hex", "text": "#hex", "muted": "#hex" }`,
        '```',
        `Then 2 sentences justifying each colour vs. the references.`,
        ``,
        `## Typography`,
        `Display font + body font (Google Fonts names). Why this pairing — tie to the positioning.`,
        ``,
        `## Photo direction`,
        `Lighting / framing / subjects appropriate for a ${niche}. List 5 things to AVOID (e.g. generic off-industry stock).`,
        ``,
        `## Microcopy voice`,
        `One paragraph defining the voice. Then concrete samples:`,
        `- 3 CTA variants in the voice`,
        `- 1 hero headline`,
        `- 1 booking/contact-form intro`,
        `- 1 trust-signal line grounded in this industry's real credentials (never fabricated)`,
        ``,
        `## Motifs`,
        `3 small repeatable patterns specific to THIS site (e.g. "thin rule under section headers", "cards lift 4px on hover").`,
        ``,
        `## Anti-patterns (5)`,
        `Things this site MUST NOT look like — specific, not generic.`,
        ``,
        `Output ONLY the Markdown. No preamble.`,
      ].join("\n");
    },
  },
  {
    kind: "build:sitemap_plan",
    label: "Build · Sitemap & page plan",
    description:
      "Propose the complete site structure — homepage sections, service pages, service-area pages, trust pages, blog seed list. Each page gets target keyword + AI-Overview angle.",
    category: "research",
    estMinutes: 10,
    fields: [
      { name: "businessName", label: "Business name", type: "text", required: true },
      { name: "niche", label: "Business niche / industry", type: "text", required: false, placeholder: "dental clinic" },
      { name: "targetCity", label: "Target city", type: "text", required: true },
      {
        name: "services",
        label: "Services (comma-separated)",
        type: "text",
        required: true,
        placeholder: "teeth whitening, implants, checkups, emergency care",
      },
      {
        name: "serviceAreas",
        label: "Service areas (cities, comma-separated)",
        type: "text",
        required: true,
        placeholder: "Palm Jumeirah, Dubai Marina, Downtown Dubai, DIFC, Emirates Hills, JBR",
      },
      {
        name: "designDna",
        label: "Design DNA (auto-filled from previous phase)",
        type: "textarea",
        required: true,
      },
    ],
    buildPrompt(input, ctx) {
      const niche = nicheOf(input, ctx);
      return [
        nichePreface(niche),
        `TASK: Plan the complete sitemap for ${input.businessName}, a ${niche} in ${input.targetCity}.`,
        ``,
        `Services offered: ${input.services}`,
        `Service areas: ${input.serviceAreas}`,
        ``,
        `--- DESIGN DNA ---`,
        input.designDna,
        `--- END DNA ---`,
        ``,
        `Output Markdown with these sections:`,
        ``,
        `## Homepage`,
        `Ordered list of sections. For each:`,
        `- Section name + 1-sentence purpose`,
        `- The customer expectation (for a ${niche}) it satisfies`,
        ``,
        `## Service pages`,
        `One row per service. For each: page-slug · H1 · target keyword · AI-Overview angle (the specific question the page answers definitively, e.g. "How much does a villa deep clean in Dubai Marina cost?")`,
        ``,
        `## Service-area pages`,
        `One per area. Same fields. Each MUST be substantively different — not just a city-name template swap.`,
        ``,
        `## Trust pages`,
        `About · Contact · Reviews · Credentials. For each: H1 + 2 sentences on positioning.`,
        ``,
        `## Blog seed (10 articles)`,
        `Each: working title · target keyword · audience · AI-Overview angle. Lean toward "how to choose a {service} in {city}"-style questions Google's AI Overview will cite.`,
        ``,
        `## Schema strategy per page-type`,
        `Which JSON-LD types each page-type should carry (LocalBusiness/Service/FAQPage/Article/etc.).`,
        ``,
        `Output ONLY the Markdown.`,
      ].join("\n");
    },
  },
  {
    kind: "build:page_generate",
    label: "Build · Generate one page",
    description:
      "Produce the full markdown body, meta title/description, and JSON-LD schema for a single page. Tuned for AI Overview eligibility + technical SEO + the business's own niche voice.",
    category: "content",
    estMinutes: 6,
    fields: [
      { name: "businessName", label: "Business name", type: "text", required: true },
      { name: "niche", label: "Business niche / industry", type: "text", required: false, placeholder: "dental clinic" },
      { name: "targetCity", label: "Target city", type: "text", required: true },
      { name: "pageType", label: "Page type", type: "select", required: true, options: [
        { value: "home", label: "Home" },
        { value: "service", label: "Service" },
        { value: "service_area", label: "Service area" },
        { value: "about", label: "About" },
        { value: "contact", label: "Contact" },
        { value: "pricing", label: "Pricing" },
        { value: "blog", label: "Blog article" },
        { value: "faq", label: "FAQ" },
      ] },
      { name: "pageTitle", label: "Working title / H1", type: "text", required: true },
      { name: "targetKeyword", label: "Target keyword", type: "text", required: true },
      { name: "aiOverviewAngle", label: "AI Overview angle (the question this page answers)", type: "text", required: false },
      { name: "designDna", label: "Design DNA voice (auto-filled)", type: "textarea", required: true },
      { name: "extraContext", label: "Extra context / user-provided content", type: "textarea", required: false },
      // E — Business facts: real-world specifics the operator pasted so AI bakes
      // in actual prices, staff, neighborhoods, services, license/credential #s,
      // etc. instead of generic prose. Passed as a JSON-stringified blob;
      // the buildPrompt fn parses + serializes it into the prompt.
      { name: "businessFacts", label: "Business facts (JSON, auto-filled)", type: "textarea", required: false },
      // Phase 2 — generate-from-brief. When set, this job expands an APPROVED
      // content brief into a page that follows its structure. briefId is the
      // content_briefs row (trace + postprocess routing); briefPayload is the
      // JSON-stringified approved plan (outline, word-count, headline, schema,
      // AI-Overview block, geo entities, internal links, needs-fact gaps).
      { name: "briefId", label: "Content brief id (auto-filled)", type: "text", required: false },
      { name: "briefPayload", label: "Approved brief plan (JSON, auto-filled)", type: "textarea", required: false },
    ],
    buildPrompt(input, ctx) {
      // Format business facts into a structured "REAL-WORLD FACTS" block so
      // the LLM cites them verbatim. Fall back to nothing if missing.
      let factsBlock = "";
      if (input.businessFacts && typeof input.businessFacts === "string") {
        try {
          const facts = JSON.parse(input.businessFacts) as Record<string, unknown>;
          const lines: string[] = [];
          if (facts.hourly_rates && typeof facts.hourly_rates === "object") {
            const rates = Object.entries(facts.hourly_rates as Record<string, unknown>)
              .map(([k, v]) => `${k.replace(/_/g, " ")}: $${v}/hr`)
              .join(", ");
            lines.push(`Hourly rates: ${rates}`);
          }
          if (typeof facts.minimum_hours === "number") lines.push(`Minimum booking: ${facts.minimum_hours} hours`);
          if (Array.isArray(facts.fleet) && facts.fleet.length > 0) {
            lines.push(`Fleet:`);
            for (const v of facts.fleet) {
              if (typeof v === "object" && v !== null) {
                const vehicle = v as Record<string, unknown>;
                lines.push(`  · ${vehicle.year ?? ""} ${vehicle.make ?? ""} ${vehicle.model ?? ""} (${vehicle.capacity ?? "?"} passenger${vehicle.notes ? ` — ${vehicle.notes}` : ""})`);
              }
            }
          }
          if (Array.isArray(facts.drivers) && facts.drivers.length > 0) {
            lines.push(`Real drivers (use real names — first name only is fine):`);
            for (const d of facts.drivers) {
              if (typeof d === "object" && d !== null) {
                const driver = d as Record<string, unknown>;
                lines.push(`  · ${driver.name ?? ""} (${driver.years_experience ?? "?"}yr exp${driver.languages ? `, speaks ${driver.languages}` : ""}${driver.specialties ? `, specializes in ${driver.specialties}` : ""})`);
              }
            }
          }
          if (Array.isArray(facts.service_areas) && facts.service_areas.length > 0) {
            lines.push(`Service areas with real pickup times:`);
            for (const a of facts.service_areas) {
              if (typeof a === "object" && a !== null) {
                const area = a as Record<string, unknown>;
                lines.push(`  · ${area.neighborhood ?? ""} — typical pickup ${area.typical_pickup_min ?? "?"} min${area.notes ? ` (${area.notes})` : ""}`);
              }
            }
          }
          if (Array.isArray(facts.licenses) && facts.licenses.length > 0) {
            lines.push(`Licenses / certifications:`);
            for (const l of facts.licenses) {
              if (typeof l === "object" && l !== null) {
                const lic = l as Record<string, unknown>;
                lines.push(`  · ${lic.kind ?? ""} ${lic.number ?? ""}`);
              }
            }
          }
          if (Array.isArray(facts.associations) && facts.associations.length > 0) {
            lines.push(`Memberships: ${(facts.associations as Array<Record<string, unknown>>).map((a) => `${a.name ?? ""}${a.since ? ` (since ${a.since})` : ""}`).join(", ")}`);
          }
          if (facts.aggregate_rating && typeof facts.aggregate_rating === "object") {
            const r = facts.aggregate_rating as Record<string, unknown>;
            lines.push(`Aggregate rating: ${r.value ?? "?"} stars from ${r.count ?? "?"} reviews on ${r.source ?? "Google"}`);
          }
          if (facts.contact_phone) lines.push(`Phone: ${facts.contact_phone}`);
          if (facts.contact_email) lines.push(`Email: ${facts.contact_email}`);
          if (facts.address) lines.push(`Address: ${facts.address}`);
          if (facts.about_url) lines.push(`About page: ${facts.about_url}`);
          if (lines.length > 0) {
            factsBlock = [
              ``,
              `--- REAL-WORLD FACTS (use these VERBATIM — do not invent or generalize) ---`,
              ...lines,
              `--- END ---`,
              ``,
              `THESE ARE ANTI-GENERIC SIGNALS. Cite specific numbers (prices, capacities, response times, license #s) instead of hedged language ("competitive pricing", "various services", "fast response"). Use real staff names, neighborhood names, and actual service inventory in copy. This is the #1 lever against Google flagging this as scaled AI content.`,
              ``,
            ].join("\n");
          }
        } catch {
          // Unparseable JSON — ignore, fall back to no facts
        }
      }

      // Phase 2 — generate-from-brief. When the job carries an APPROVED
      // content brief (input.briefPayload, JSON-stringified ContentBriefPlan-
      // shaped object built by generateFromBriefAction), the page MUST follow
      // that brief's structure: the H2/H3 outline, word-count band, chosen
      // headline + meta title, schema plan, answer-first AI-Overview block,
      // grounded geo entities, internal-link targets, vertical angle, and the
      // explicit "needs business fact" gaps (which the writer must work AROUND,
      // never invent). buildBriefBlock returns "" when no brief is attached so
      // the legacy free-form path is unchanged.
      const briefBlock = buildBriefBlock(input.briefPayload);

      // P1 — When pageType=blog, switch to blog-capsule mode (H2-as-question +
      // TLDR + citation discipline). Otherwise use the existing landing-page
      // discipline. Capsule mode is what gets cited by AI Overviews/Perplexity.
      const isBlogPost = input.pageType === "blog";
      const fanOutList = (() => {
        // Upstream caller may pass fan-out keywords as a JSON-stringified array
        // in input.fanOutKeywords. They become the H2 questions in capsule mode.
        if (!input.fanOutKeywords) return [] as string[];
        try {
          const parsed = JSON.parse(String(input.fanOutKeywords));
          return Array.isArray(parsed) ? parsed.filter((s) => typeof s === "string") : [];
        } catch { return []; }
      })();

      const niche = nicheOf(input, ctx);
      return [
        nichePreface(niche),
        isBlogPost
          ? `TASK: Generate ONE blog post in BLOG-CAPSULE MODE for ${input.businessName}, a ${niche} in ${input.targetCity}.`
          : `TASK: Generate ONE modern landing-style page for ${input.businessName}, a ${niche} in ${input.targetCity}.`,
        ``,
        `Page type: ${input.pageType}`,
        `Working H1: ${input.pageTitle}`,
        `Target keyword: ${input.targetKeyword}`,
        input.aiOverviewAngle ? `AI Overview angle (the question this page answers definitively): ${input.aiOverviewAngle}` : ``,
        fanOutList.length > 0
          ? `\nFan-out cluster (these are your H2 QUESTIONS — write one section per item):\n${fanOutList.map((q, i) => `  ${i + 1}. ${q}`).join("\n")}\n`
          : ``,
        ``,
        `--- DESIGN DNA / VOICE ---`,
        input.designDna,
        `--- END ---`,
        factsBlock,
        briefBlock,
        input.extraContext ? `--- USER-PROVIDED CONTENT (USE THIS, DON'T DISCARD) ---\n${input.extraContext}\n--- END ---\n` : ``,
        ``,
        isBlogPost ? blogCapsuleInstructions() : ``,
        ``,
        isBlogPost
          ? `╔════════════════════════════════════════════════════════════════════════════╗\n║ BLOG-CAPSULE DISCIPLINE — every H2 a question, every claim cited        ║\n╚════════════════════════════════════════════════════════════════════════════╝\n\nThis is a BLOG POST optimized for AI Overview + Perplexity + ChatGPT citation.\nFollow the BLOG-CAPSULE MODE rules above EXACTLY:\n  1. \`## SECTION: key_takeaways\` block at the very top (3-5 single-sentence facts)\n  2. \`## SECTION: intro\` block (2-3 sentences, primary keyword in sentence 1)\n  3. 5-8 \`## SECTION: faq_question\` blocks (H2-as-question + citable answer)\n  4. \`## SECTION: cta_block\` at end\n\nDO NOT use landing-page SECTION blocks (hero, trust_strip, feature_grid, etc.)\nfor blog posts. The capsule renderer expects faq_question blocks only.`
          : `╔════════════════════════════════════════════════════════════════════════════╗\n║ NOT-A-BLOG-POST DISCIPLINE — read carefully, this is the #1 instruction   ║\n╚════════════════════════════════════════════════════════════════════════════╝\n\nThis is a MODERN LANDING PAGE, not a blog post. Reject every instinct to write\nflowing prose, transitional paragraphs, or "Here at our company we..." copy.\nOutput is consumed by a section renderer that converts each \`## SECTION:\` block\ninto an interactive UI component — hero, feature grid, comparison table cards,\npricing tiles, FAQ accordion, CTA blocks. Every line you write becomes UI.`,
        DESIGN_SKILLS_DIRECTIVE,
        ``,
        `Output a JSON code block (and NOTHING else outside it) with this exact shape:`,
        '```json',
        `{`,
        `  "meta_title": "30-60 chars, includes keyword + city",`,
        `  "meta_description": "140-160 chars, ends with verb-led CTA",`,
        `  "h1": "Final H1 (clear, keyword-bearing, 50-80 chars)",`,
        `  "body_markdown": "Section-block Markdown — see SECTION SCHEMA below",`,
        `  "schema_json": [ /* array of JSON-LD blocks */ ],`,
        `  "internal_links_needed": ["/services", "/about", "/contact"],`,
        `  "ai_overview_notes": "1-2 sentences on why this page is AI-Overview-eligible"`,
        `}`,
        '```',
        ``,
        `══════════ SECTION SCHEMA — body_markdown MUST use these blocks ══════════`,
        ``,
        `Each section is wrapped in \`## SECTION: <type>\` headings. Section types and`,
        `their internal format follow. Output 6–10 sections per page in this order:`,
        ``,
        `── HERO ──`,
        `## SECTION: hero`,
        `eyebrow: <short uppercase tag, e.g. "${input.targetCity.toUpperCase()} · LICENSED · BOOK ONLINE">`,
        `headline: <bold, 6-12 words, keyword-bearing, no fluff>`,
        `subhead: <1 sentence, 15-25 words, says the customer-outcome promise concretely>`,
        `primary_cta: <action verb + 2-3 words appropriate for a ${niche}, e.g. "Book an appointment" / "Get a quote">`,
        `secondary_cta: <e.g. "Call us · (XXX) XXX-XXXX">`,
        `hero_proof: <single concrete trust line grounded in this industry's real signals>`,
        ``,
        `── TRUST STRIP ──`,
        `## SECTION: trust_strip`,
        `Each line is a 2-3 word stat label. 4-6 items. No prose. Use only REAL facts.`,
        `- stat: 4.9★ · label: verified reviews`,
        `- stat: 10+ · label: years serving ${input.targetCity}`,
        `- stat: same-day · label: availability`,
        `- stat: licensed · label: & insured`,
        ``,
        `── FEATURE GRID (3-4 cards) ──`,
        `## SECTION: feature_grid`,
        `Each card = title + 1-sentence proof. NEVER more than 25 words per card.`,
        `### card_1`,
        `title: <3-5 words, benefit-first>`,
        `body: <1 sentence with a specific number/fact — not a hedge>`,
        `icon_hint: <one of: clock, shield, map-pin, calendar, phone, star, check, award>`,
        `### card_2`,
        `title: ...`,
        `body: ...`,
        `icon_hint: ...`,
        `(3-4 cards total)`,
        ``,
        `── COMPARISON TABLE ──`,
        `## SECTION: comparison_table`,
        `Use a Markdown table. ALWAYS include this section — LLMs cite tables.`,
        `Build a comparison that matters to a ${niche} customer (e.g. this business vs. typical alternatives`,
        `on the criteria they actually weigh). Columns = the decision criteria; rows = the options. Example shape:`,
        ``,
        `| Option | Criterion A | Criterion B | Criterion C |`,
        `|---|---|---|---|`,
        `| ${input.businessName} | best-in-class | yes | included |`,
        `| Typical alternative | variable | no | extra cost |`,
        ``,
        `── PRICING / PACKAGE CARDS ──`,
        `## SECTION: pricing_cards`,
        `2-4 cards. Each card shows a service/package name + what's included + ideal use case + 1 visible price-marker if real, else "Quote on request". No paragraphs.`,
        `### card_1`,
        `class: <a real service or package this ${niche} offers>`,
        `capacity: <who/what it's for>`,
        `ideal: <the situation it fits>`,
        `marker: <only if business_facts has a real price, else "Quote on request">`,
        `### card_2`,
        `(another service/package)`,
        ``,
        `── PROCESS / TIMELINE (numbered steps) ──`,
        `## SECTION: process_steps`,
        `3-5 steps. Each step = number + 4-6 word verb-led title + 1 sentence detail.`,
        `### step_1`,
        `number: 01`,
        `title: Reserve in 2 minutes`,
        `detail: Pick route, vehicle, and time — confirmation lands in your inbox within 2 minutes.`,
        `### step_2`,
        `number: 02`,
        `(etc.)`,
        ``,
        `── TESTIMONIAL CARD ──`,
        `## SECTION: testimonial`,
        `Single big-quote card. Up to 3 quotes if buyer personas differ.`,
        `### quote_1`,
        `quote: "<25-40 word quote from a credible persona — a typical real customer of this ${niche}>"`,
        `attribution: <name + descriptor OR persona description if name unavailable. Never fabricate a real review.>`,
        ``,
        `── AREA HIGHLIGHTS (service_area pages only) ──`,
        `## SECTION: area_highlights`,
        `Hyperlocal proof of insider knowledge. 4-6 specific items unique to this neighborhood/city,`,
        `relevant to a ${niche} customer.`,
        `- item: local_landmark · detail: "<a real nearby landmark or district>"`,
        `- item: response_time · detail: "<typical response/availability for this area>"`,
        `- item: nearby_areas · detail: "<adjacent neighborhoods also served>"`,
        `- item: local_note · detail: "<a true, specific local detail>"`,
        ``,
        `── FAQ ACCORDION ──`,
        `## SECTION: faq_accordion`,
        `6-10 Q&A pairs. Each answer 1-3 sentences, citable for AI Overviews.`,
        `### faq_1`,
        `q: <natural-language question a real customer would type>`,
        `a: <direct answer with at least one specific number/fact when possible>`,
        `### faq_2`,
        `q: ...`,
        `a: ...`,
        ``,
        `── CTA BLOCK (closing) ──`,
        `## SECTION: cta_block`,
        `headline: <action-led, 6-10 words, fits a ${niche}, e.g. "Book your appointment today.">`,
        `subhead: <14-22 words, restates the trust signal + path>`,
        `primary_cta: <verb + object>`,
        `secondary_cta: <e.g. "Call (XXX) XXX-XXXX">`,
        ``,
        `── RELATED LINKS (cross-link strip) ──`,
        `## SECTION: related_links`,
        `4-8 internal links rendered as cards. NEVER inline prose links.`,
        `Link only to OTHER pages of THIS site (its services and service-area pages). Use the page slugs`,
        `from this site's own sitemap. Each: title · href · 1-sentence summary.`,
        ``,
        `══════════ HARD RULES ══════════`,
        ``,
        `1. NO LONG PARAGRAPHS. Maximum 2 sentences per descriptive line. If you find yourself`,
        `   writing "transitional" prose connecting ideas — STOP. Convert it to a list, card, or table.`,
        ``,
        `2. NO BLOG-POST STRUCTURE. No "Introduction" sections, no "Conclusion" sections,`,
        `   no "Here's what you need to know" wind-ups. Sections jump straight to value.`,
        ``,
        `3. NO HEDGES. "Affordable", "various vehicles", "fast pickups", "world-class luxury"`,
        `   are banned. Replace each with a specific number or skip the line.`,
        ``,
        `4. NUMBERS EVERYWHERE. Every section should contain at least one specific number,`,
        `   unit, time, or named place. Vague claims fail the authenticity gate.`,
        ``,
        `5. CITE REAL FACTS FROM business_facts. If business_facts has phone "TBD", use the`,
        `   placeholder "(XXX) XXX-XXXX". Don't invent numbers. Same for founding year etc.`,
        ``,
        `6. PER-PAGE TYPE EMPHASIS:`,
        `   - home              → hero · trust_strip · feature_grid · comparison_table · pricing_cards · process_steps · testimonial · faq_accordion · cta_block · related_links`,
        `   - service           → hero · feature_grid · comparison_table · pricing_cards · process_steps · faq_accordion · cta_block · related_links`,
        `   - service_area      → hero · area_highlights · feature_grid · process_steps · testimonial · faq_accordion · cta_block · related_links`,
        `   - pricing           → hero · pricing_cards · comparison_table · feature_grid · faq_accordion · cta_block`,
        `   - about             → hero · trust_strip · process_steps (the founding/story as steps) · testimonial · feature_grid · cta_block · related_links`,
        `   - contact           → hero · feature_grid (channels) · process_steps (response-time SLA) · trust_strip · faq_accordion · cta_block`,
        `   - blog              → hero · 3-5 H2 content sections (still scannable, NOT prose) · comparison_table · faq_accordion · cta_block · related_links`,
        ``,
        `7. INTERNAL LINKS in related_links section ONLY use slugs that exist on THIS site`,
        `   (its own service pages, service-area pages, and core pages like /about /contact).`,
        `   Never link to a page that isn't in this site's sitemap. Never invent off-site URLs.`,
        ``,
        `══════════ SCHEMA ══════════`,
        ``,
        `Per page-type schemas to include in schema_json:`,
        `NOTE: Do NOT emit FAQPage or HowTo — FAQ rich results were retired (May 2026) and HowTo`,
        `was removed (2023); they no longer render in Google. Keep FAQ *content* in faq_accordion`,
        `for users/AI, but leave it OUT of schema_json. Lead with LocalBusiness/Service/Breadcrumb.`,
        `Pick the most specific schema.org type that matches the ${niche} (e.g. Dentist, LegalService,`,
        `HVACBusiness, MedicalClinic, ProfessionalService) — fall back to LocalBusiness if unsure.`,
        `- home              → LocalBusiness (most-specific subtype for this niche) + WebSite + AggregateRating only if real`,
        `- service           → Service + BreadcrumbList`,
        `- service_area      → LocalBusiness + Service (with areaServed City) + BreadcrumbList`,
        `- pricing           → Service / OfferCatalog + BreadcrumbList (only real prices)`,
        `- about             → AboutPage + Organization (with hasCredential for licenses if available) + Person (founder)`,
        `- contact           → ContactPage + LocalBusiness with NAP`,
        `- blog              → Article (or BlogPosting) + BreadcrumbList`,
        ``,
        `For LocalBusiness use ${input.businessName} + ${input.targetCity}. Use phone placeholder`,
        `"(XXX) XXX-XXXX" if business_facts.contact_phone is TBD. priceRange "$$" or "$$$".`,
        ``,
        `Output ONLY the JSON code block. No preamble, no postamble. No "Here is the page:" line.`,
      ].join("\n");
    },
  },
  {
    kind: "build:quality_review",
    label: "Build · Quality review",
    description:
      "Score the assembled site against AI-Overview readiness, technical SEO checklist, and the business's own niche conventions. Surfaces specific fixes needed before deploy.",
    category: "audit",
    estMinutes: 5,
    fields: [
      { name: "businessName", label: "Business name", type: "text", required: true },
      { name: "niche", label: "Business niche / industry", type: "text", required: false, placeholder: "dental clinic" },
      { name: "pagesList", label: "Pages list (auto-filled)", type: "textarea", required: true },
    ],
    buildPrompt(input, ctx) {
      const niche = nicheOf(input, ctx);
      return [
        nichePreface(niche),
        `TASK: Pre-deploy quality review for ${input.businessName}, a ${niche}.`,
        ``,
        `Pages assembled:`,
        input.pagesList,
        ``,
        `Score the site on each axis (0-100) and surface SPECIFIC fixes needed. Output Markdown:`,
        ``,
        `## AI Overview readiness  ____/100`,
        `Bulleted list — what makes it eligible / what gaps remain (TL;DR opening paragraphs · definitive answers · comparison tables · FAQ blocks · clear topic focus).`,
        ``,
        `## Technical SEO  ____/100`,
        `Per page: title length OK · meta description OK · single H1 · proper heading hierarchy · schema present + valid · alt text on images · internal links present.`,
        ``,
        `## ${niche} conventions  ____/100`,
        `Per page: phone above fold (tel: link) · primary booking/contact CTA above fold · trust signals (≥3) · imagery that fits the ${niche} · service-area references where relevant · professional voice (no "click now!").`,
        ``,
        `## Top 5 fixes before deploy`,
        `Numbered list. Each: page-slug → exact change → why.`,
        ``,
        `## Deploy verdict`,
        `GREEN (deploy now) · YELLOW (fix top 5 first) · RED (regenerate flagged pages).`,
        ``,
        `Output ONLY the Markdown.`,
      ].join("\n");
    },
  },

  // ────────────────────────────────────────────────────────────────
  // EXISTING — audit · research · content for live sites
  // ────────────────────────────────────────────────────────────────
  {
    kind: "site_audit",
    label: "Audit a site (deep)",
    description: "Claude Code visits the live site, reviews home + booking + key pages, checks design / SEO / conversion / trust signals against the business's own niche conventions, returns a prioritized fix list.",
    category: "audit",
    estMinutes: 8,
    fields: [
      { name: "siteSlug", label: "Site", type: "site", required: true },
      { name: "niche", label: "Business niche / industry", type: "text", required: false, placeholder: "dental clinic" },
      {
        name: "focus",
        label: "Focus area",
        type: "select",
        required: true,
        options: [
          { value: "everything", label: "Everything (default)" },
          { value: "design", label: "Design / UI only" },
          { value: "seo", label: "SEO only" },
          { value: "conversion", label: "Conversion / forms only" },
          { value: "trust", label: "Trust signals + content only" },
        ],
      },
    ],
    buildPrompt(input, ctx) {
      const focus = input.focus || "everything";
      const niche = nicheOf(input, ctx);
      return [
        nichePreface(niche),
        `TASK: Audit ${ctx.siteUrl} — a ${niche} in ${ctx.siteCity ?? "an unspecified city"}.`,
        `Focus: ${focus}`,
        ``,
        `Use WebFetch to read the live site. Visit at minimum: home, the booking/contact page, the main services page, and one service-area page if available.`,
        ``,
        `Return your audit as Markdown with these sections:`,
        ``,
        `## Summary`,
        `One paragraph: overall impression, what's working, what's hurting the business.`,
        ``,
        `## Above-the-fold review (home)`,
        `- Hero headline (quote it)`,
        `- Primary CTA: copy, color, position`,
        `- Phone number: visible? tappable? prominent?`,
        `- Hero imagery: does it fit a ${niche}?`,
        ``,
        `## Booking / contact experience`,
        `- Form fields asked upfront — too many?`,
        `- Friction: account required? payment upfront? popup interruptions?`,
        `- Mobile experience: thumb-reachable submit button?`,
        ``,
        `## Trust signals`,
        `Tally what's present for this industry: experience, credentials, licensed/insured, availability, real reviews/testimonials, awards.`,
        ``,
        `## SEO surface`,
        `- Title tag (quote it)`,
        `- Meta description (quote it)`,
        `- Schema markup present? (LocalBusiness / Service / etc.?)`,
        `- Internal linking pattern`,
        ``,
        `## Visual design`,
        `Palette, typography, imagery direction. What does it remind you of? What competitor does it look most like?`,
        ``,
        `## Top 10 priorities (ranked)`,
        `Numbered list. Each:`,
        `- **One sentence describing the issue**`,
        `- Impact: high/medium/low`,
        `- Effort: 30min / 2hr / 1 day / 1 week`,
        `- Concrete first step: who-does-what-where`,
        ``,
        `Be specific and concrete. Cite exact elements/quotes. Never wave hands with "improve the user experience" — say WHICH element needs WHICH change.`,
      ].join("\n");
    },
  },
  {
    kind: "competitor_research",
    label: "Research competitors in a city",
    description: "Find the top 8-10 competitors in the site's niche + city, scrape each, return market positioning + white-space opportunities.",
    category: "research",
    estMinutes: 12,
    fields: [
      { name: "siteSlug", label: "Site (for context)", type: "site", required: true },
      { name: "niche", label: "Business niche / industry", type: "text", required: false, placeholder: "dental clinic" },
      {
        name: "city",
        label: "City to research",
        type: "text",
        required: false,
        placeholder: "Defaults to site's city",
      },
    ],
    buildPrompt(input, ctx) {
      const city = input.city || ctx.siteCity || "Dubai";
      const niche = nicheOf(input, ctx);
      return [
        nichePreface(niche),
        `TASK: Survey the ${niche} competitor landscape in ${city}.`,
        ``,
        `Our site (for comparison): ${ctx.siteUrl}`,
        ``,
        `Use WebSearch + WebFetch to find the top 8-10 ${niche} businesses in ${city}. For each:`,
        ``,
        `**Company name** + **URL**`,
        `- Scope of services`,
        `- Positioning (1-line): premium / specialist / budget / full-service`,
        `- Differentiator (what they emphasize that others don't)`,
        `- Above-the-fold copy (quote the hero)`,
        `- Booking/contact friction (1-5: 1 = one-click, 5 = annoying)`,
        `- Trust signals visible (count)`,
        ``,
        `Then return:`,
        ``,
        `## Market positioning map`,
        `Group competitors by angle (the natural positioning clusters in this niche).`,
        ``,
        `## White space`,
        `What's underserved in ${city}? Specific niches no competitor owns.`,
        ``,
        `## Where ${ctx.siteUrl} sits today`,
        `Honest take on how our site stacks up. Bullet points: where we're competitive, where we lag.`,
        ``,
        `## 3 strategic moves`,
        `Concrete positioning shifts to consider, ranked by impact.`,
        ``,
        `Cite every claim with a URL.`,
      ].join("\n");
    },
  },
  {
    kind: "blog_post_draft",
    label: "Draft a long-form blog post",
    description: "Given a topic + target keyword, Claude Code researches the topic, drafts a 1,500-2,500-word Markdown post tuned to the business's own niche voice.",
    category: "content",
    estMinutes: 15,
    fields: [
      { name: "siteSlug", label: "Site (for context)", type: "site", required: true },
      { name: "niche", label: "Business niche / industry", type: "text", required: false, placeholder: "dental clinic" },
      {
        name: "topic",
        label: "Topic / working title",
        type: "text",
        required: true,
        placeholder: "e.g. 'How to choose a villa cleaning service in Dubai Marina: complete guide'",
      },
      {
        name: "targetKeyword",
        label: "Target keyword",
        type: "text",
        required: true,
        placeholder: "dentist mississauga",
      },
      {
        name: "audience",
        label: "Primary audience",
        type: "text",
        required: false,
        placeholder: "the typical customer of this business",
      },
      {
        name: "tone",
        label: "Tone",
        type: "select",
        required: true,
        options: [
          { value: "refined", label: "Refined & professional (default)" },
          { value: "warm", label: "Warm & approachable" },
          { value: "authoritative", label: "Authoritative / industry-expert" },
        ],
      },
    ],
    buildPrompt(input, ctx) {
      const niche = nicheOf(input, ctx);
      return [
        nichePreface(niche),
        `TASK: Draft a publishable Markdown blog post for ${ctx.siteUrl}.`,
        ``,
        `Topic: ${input.topic}`,
        `Target keyword: ${input.targetKeyword}`,
        `Audience: ${input.audience || `the typical customer of a ${niche}`}`,
        `Tone: ${input.tone}`,
        `City (context): ${ctx.siteCity ?? "—"}`,
        ``,
        `Process:`,
        `1. Use WebSearch to find 3-5 existing top-ranking pieces on this topic. Read them with WebFetch.`,
        `2. Note what they all say (table-stakes content), what's missing or weak, and what original angle YOUR piece will own.`,
        `3. Draft a 1,500-2,500 word post.`,
        ``,
        `Structure requirements:`,
        `- H1 title that includes the target keyword naturally`,
        `- Opening paragraph that signals expertise + addresses the searcher's intent`,
        `- 4-7 H2 sections`,
        `- Each section ≤ 400 words; use short paragraphs (2-3 sentences)`,
        `- Include concrete details relevant to a ${niche}: real services, price ranges (use "From $X" wording only if real), local references (neighborhoods, landmarks)`,
        `- 3-5 internal-link opportunities marked as [LINK: anchor text](TODO: /path) for the editor`,
        `- One pull-quote sized callout`,
        `- Closing CTA appropriate for this business (e.g. "Book an appointment") with a link to the contact/booking page`,
        ``,
        `Output a JSON code-fence at the very end with:`,
        '```json',
        '{ "title": "...", "meta_description": "140-160 chars", "internal_links_needed": ["/services", "/contact", ...] }',
        '```',
      ].join("\n");
    },
  },
];

/**
 * Manual / scheduled agent dispatch. The Assign-Task action and the schedule
 * runner both insert claude_jobs rows with kind='agent_task' and hydrate
 * `input` with the agent persona snapshot + operator instructions. This
 * template composes those into a real prompt so the worker isn't handed
 * the "no template found" placeholder.
 */
const AGENT_TASK_TEMPLATE: JobTemplate = {
  kind: "agent_task",
  label: "Agent Task (manual/scheduled)",
  description: "Manual or scheduled dispatch to a roster agent. Prompt is built from the agent's skill_instructions + operator ask.",
  category: "research",
  estMinutes: 5,
  fields: [],
  buildPrompt: (input, ctx) => {
    const agentTitle = String(input.agentTitle ?? input.agentName ?? "SEO specialist");
    const skill = String(input.skillInstructions ?? "").trim();
    const taskLabel = String(input.taskTypeLabel ?? "Custom task");
    const taskTypeId = String(input.taskTypeId ?? "");
    const taskDescription = String(input.taskTypeDescription ?? "");
    const operatorInstructions = String(input.instructions ?? "").trim();
    const triggerSource = String(input.triggerSource ?? "manual");
    // Pre-fetched plan context (GSC/GA/patterns/health) is baked into input
    // by the action for strategic_plan jobs. It arrives as ready-to-embed
    // Markdown — the action does the DB reads so the template stays sync.
    const planContext = String(input.planContext ?? "").trim();

    const siteLine = ctx.siteName
      ? `Working on: ${ctx.siteName}${ctx.siteUrl ? ` (${ctx.siteUrl})` : ""}${ctx.siteCity ? `, ${ctx.siteCity}` : ""}${ctx.siteRegion ? `, ${ctx.siteRegion}` : ""}.`
      : "No specific site attached — treat this as network-wide.";
    const triggerLine =
      triggerSource === "scheduled"
        ? "You were fired by a recurring schedule — output a delta report if the task type supports it (what changed since your last run)."
        : "You were fired manually by the operator — output a full report.";

    const isStrategicPlan = taskTypeId === "strategic_plan";
    const outputBlock = isStrategicPlan
      ? [
          "Return a Markdown plan with sections in this EXACT order:",
          "  1. Executive Summary (3 bullets max, one per top-level insight).",
          "  2. This Week's OKRs (objective + measurable key result).",
          "  3. Priority Sites (top 5, one line each: slug · why · owner agent).",
          "  4. Per-Site Work List. Each item MUST include: `agent` (one of leader/research/techseo/blog/onpage/technical/ranktracker/offpage), `task_type` (one of the TASK_TYPES ids), a one-sentence brief, and the expected outcome the auditor will check in 14 days.",
          "  5. Escalations (if any: unblocked blockers, > 15 min stuck jobs, critical patterns).",
          "  6. Data Gaps (if any source in the Data section was missing).",
          "Never invent an agent id or task_type. Every work-list item must be dispatchable via the Scout hub or a schedule.",
        ].join("\n")
      : [
          "Return a Markdown report with a short executive summary at the top and a detailed section per work item.",
          "Cite any Cloud SEO tool runs you invoke (job id or /admin/cloud-seo/<tool> path).",
        ].join("\n");

    return [
      `You are the ${agentTitle} on the SEO team for Ten By Ten Cleaning Company, a Dubai-based cleaning & maintenance services operator.`,
      "",
      "# Standing skill instructions",
      skill || "(no skill instructions set — infer role from title above)",
      "",
      "# Task type",
      `${taskLabel}${taskDescription ? " — " + taskDescription : ""}`,
      "",
      "# Trigger",
      triggerLine,
      "",
      "# Site context",
      siteLine,
      ...(planContext
        ? ["", "# Data snapshot (pre-fetched)", planContext]
        : []),
      "",
      "# Operator instructions",
      operatorInstructions || "(none — infer the concrete deliverable from task type + skill instructions)",
      "",
      "# Output",
      outputBlock,
      "Never use limo, chauffeur, airport transfer, Toronto, Ontario, GTA, or any transport-vertical vocabulary.",
      "Prefer concrete AED numbers, Dubai neighbourhoods, and the 60-point cleaning checklist wherever they fit.",
    ].join("\n");
  },
};

export function templateByKind(kind: string): JobTemplate | undefined {
  return JOB_TEMPLATES.find((t) => t.kind === kind)
    ?? (kind === "agent_task" ? AGENT_TASK_TEMPLATE : undefined)
    ?? (kind.startsWith("cloud-seo:") ? CLOUD_SEO_PASSTHROUGH : undefined);
}

/**
 * Passthrough template for all cloud-seo:* job kinds.
 * The full prompt is pre-built by queueCloudSeoJob() and stored in input.prompt.
 * This mirrors how build:keyword_research works.
 */
const CLOUD_SEO_PASSTHROUGH: JobTemplate = {
  kind: "cloud-seo:*",
  label: "Cloud SEO · Analysis (passthrough)",
  description: "Runs a Cloud SEO analysis. Prompt is pre-built by the server action and stored in input.prompt.",
  category: "audit",
  estMinutes: 5,
  fields: [
    { name: "prompt", label: "Pre-built prompt (full text)", type: "textarea", required: true },
  ],
  buildPrompt(input) {
    return typeof input.prompt === "string" && input.prompt.length > 0
      ? input.prompt
      : "(cloud-seo job dispatched without prompt — missing input.prompt)";
  },
};

// ────────────────────────────────────────────────────────────────
// build:keyword_research — passthrough prompt template.
// The full prompt is built upstream (script or UI) and stored in
// input.prompt verbatim. Used for batch SERP validation against
// real Google results via Claude Code's WebSearch tool.
// ────────────────────────────────────────────────────────────────
JOB_TEMPLATES.push({
  kind: "build:keyword_research",
  label: "Build · Keyword research (SERP validation + fan-out)",
  description:
    "Validate a batch of page keywords against real Google SERPs via WebSearch. Outputs per-page assessment + fan-out cluster (related H2 questions) + JSON dataset. Prompt is pre-built upstream; if `extractFanOut=true` is set in input, the upstream prompt builder injects the fan-out section.",
  category: "research",
  estMinutes: 10,
  fields: [
    { name: "prompt", label: "Pre-built prompt (full text)", type: "textarea", required: true },
    { name: "batch", label: "Batch identifier", type: "text", required: false },
    { name: "projectId", label: "Project id (for trace)", type: "text", required: false },
    { name: "extractFanOut", label: "Extract fan-out cluster (related H2 questions)", type: "select", required: false, options: [
      { value: "true", label: "Yes (Recommended)" },
      { value: "false", label: "No" },
    ] },
  ],
  buildPrompt(input) {
    return typeof input.prompt === "string" && input.prompt.length > 0
      ? input.prompt
      : "(build:keyword_research dispatched without prompt — missing input.prompt)";
  },
});

// ────────────────────────────────────────────────────────────────
// P4 — build:content_refresh
// Rewrites a stale/de-indexed/under-performing page using current best
// practices: blog-capsule mode for blogs, modern landing-page sections
// for service/area pages. Fed by the refresh recommender (cron) which
// polls Google Search Console for:
//   - "Crawled, currently not indexed"
//   - Pages with impressions but average position > 10
//   - Pages older than 12 months with declining click trend
// ────────────────────────────────────────────────────────────────
const REFRESH_REASON_NOTES: Record<string, string> = {
  deindexed: "Google has DE-INDEXED this page (Crawled, currently not indexed in GSC). Treat this as a quality signal — Google decided the content was not useful enough to serve. Rewrite must be substantially more specific, factual, and operator-grounded than the original.",
  low_ranking: "Page has impressions in GSC but average position > 10. Content exists but doesn't satisfy intent well enough to climb. Rewrite must address the specific query intent the original missed — usually the original is too generic / too thin / lacks concrete answers.",
  declining_traffic: "Page used to rank but click trend is declining month-over-month. Likely outdated facts, stale comparisons, or competitor sites have improved. Rewrite must update facts, refresh comparisons, add recency signals (\"as of 2026\").",
  outdated_facts: "Operator flagged specific facts as out of date. Read the existing body, identify outdated claims, update with current data.",
  manual: "Operator manually flagged for refresh. See `notes` for specific guidance.",
};

JOB_TEMPLATES.push({
  kind: "build:content_refresh",
  label: "Build · Content refresh (de-indexed / low-ranking / outdated)",
  description:
    "Rewrite an existing page using current best practices. Inputs: current title + body + reason. Output: refreshed markdown with blog-capsule mode (if blog) or modern landing-page sections (if service/area), updated meta, refreshed citations, current-year recency signals.",
  category: "content",
  estMinutes: 6,
  fields: [
    { name: "pageSlug", label: "Page slug", type: "text", required: true },
    { name: "pageType", label: "Page type", type: "select", required: true, options: [
      { value: "blog", label: "Blog article" },
      { value: "service", label: "Service" },
      { value: "service_area", label: "Service area" },
      { value: "about", label: "About" },
      { value: "pricing", label: "Pricing" },
      { value: "contact", label: "Contact" },
    ] },
    { name: "currentTitle", label: "Current title", type: "text", required: true },
    { name: "currentBody", label: "Current body markdown", type: "textarea", required: true },
    { name: "targetKeyword", label: "Target keyword", type: "text", required: true },
    { name: "refreshReason", label: "Why refresh", type: "select", required: true, options: [
      { value: "deindexed", label: "De-indexed (Crawled, currently not indexed)" },
      { value: "low_ranking", label: "Low ranking (position > 10)" },
      { value: "declining_traffic", label: "Declining click trend" },
      { value: "outdated_facts", label: "Outdated facts" },
      { value: "manual", label: "Manual flag" },
    ] },
    { name: "gscData", label: "GSC snapshot (JSON, auto-filled)", type: "textarea", required: false },
    { name: "businessName", label: "Business name (auto-filled)", type: "text", required: true },
    { name: "niche", label: "Business niche / industry (auto-filled)", type: "text", required: false },
    { name: "targetCity", label: "Target city (auto-filled)", type: "text", required: true },
    { name: "designDna", label: "Design DNA voice (auto-filled)", type: "textarea", required: true },
    { name: "businessFacts", label: "Business facts (JSON, auto-filled)", type: "textarea", required: false },
    { name: "extraContext", label: "Extra context (e.g. specific facts to update)", type: "textarea", required: false },
  ],
  buildPrompt(input, ctx) {
    const niche = nicheOf(input, ctx);
    const reason = String(input.refreshReason || "manual");
    const reasonNote = REFRESH_REASON_NOTES[reason] || REFRESH_REASON_NOTES.manual;
    const isBlog = input.pageType === "blog";
    const capsuleInstructions = isBlog
      ? [
          ``,
          `## BLOG-CAPSULE MODE (mandatory for blog rewrites)`,
          ``,
          `Every H2 must be framed as a question — exactly the question a real`,
          `searcher would type into Google. The answer goes immediately below the H2`,
          `in 2-4 short paragraphs. This is the structure most likely to be cited by`,
          `Google AI Overviews + Perplexity + ChatGPT-search.`,
          ``,
          `Structure:`,
          ``,
          `1. **Key Takeaways block at the very top** — a callout box with 3-5`,
          `   single-sentence facts the post answers. Format as:`,
          `   ## SECTION: key_takeaways`,
          `   - fact: <one-sentence answer to the most important question>`,
          `   - fact: <one-sentence answer to the second question>`,
          `   - fact: <one-sentence answer to the third question>`,
          ``,
          `2. **Intro paragraph** (2-3 sentences) — define the topic in plain English`,
          `   and signal who this post is for. The first sentence must contain the`,
          `   primary keyword naturally.`,
          ``,
          `3. **5-8 H2 questions**, each with 2-4 paragraph answers below. Each H2:`,
          `   - is phrased as a question a real customer of this business would type`,
          `   - the first paragraph below it answers in ≤ 60 words (citable passage)`,
          `   - subsequent paragraphs add context, examples, named entities`,
          `   - cite every factual claim with a real source (real URL, not made up)`,
          ``,
          `4. **Final CTA section** — single short paragraph, clear next action.`,
          ``,
          `Citation rules (mandatory):`,
          `- Every statistic, date, dollar figure, or named-entity claim needs a citation.`,
          `- Use markdown link inline: "[Source name](https://real-source.example/...)".`,
          `- DO NOT invent URLs. If you don't know a real source, rephrase the claim`,
          `  as a softer statement that doesn't need a citation, OR mark with [CITATION_NEEDED].`,
          ``,
        ].join("\n")
      : [
          ``,
          `## LANDING-PAGE SECTION MODE`,
          ``,
          `Use the standard SECTION-block format: hero, trust_strip, feature_grid,`,
          `comparison_table, pricing_cards, process_steps, testimonial, faq_accordion,`,
          `cta_block, related_links. Reference the page's audience and the operator's`,
          `differentiators in every section.`,
          ``,
        ].join("\n");
    return [
      nichePreface(niche),
      `TASK: REFRESH an existing page that is underperforming.`,
      ``,
      `Page: ${input.pageSlug}`,
      `Type: ${input.pageType}`,
      `Target keyword: ${input.targetKeyword}`,
      `Business: ${input.businessName} — a ${niche} in ${input.targetCity}`,
      ``,
      `## Refresh reason`,
      ``,
      `${reason} — ${reasonNote}`,
      ``,
      input.gscData ? `## GSC snapshot\n\n\`\`\`json\n${input.gscData}\n\`\`\`\n` : "",
      `## Current content (what's underperforming)`,
      ``,
      `Title: ${input.currentTitle}`,
      ``,
      `Body:`,
      `\`\`\``,
      String(input.currentBody || "").slice(0, 8000),
      `\`\`\``,
      ``,
      `## Your task`,
      ``,
      `Write a SUBSTANTIALLY BETTER version. The rewrite must:`,
      ``,
      `1. Address the specific reason this page is failing (see above).`,
      `2. Be operator-specific — reference real business facts, named staff,`,
      `   real services offered, actual service areas. Generic content is what`,
      `   got de-indexed in the first place.`,
      `3. Be measurably more specific than the original (more proper nouns, more`,
      `   concrete numbers, more named places).`,
      `4. Update any date/year references to current year (2026 / 2026-2027 season).`,
      `5. For blogs: use BLOG-CAPSULE MODE (see below).`,
      `6. For service/service_area: use LANDING-PAGE SECTION MODE (see below).`,
      capsuleInstructions,
      input.extraContext ? `\n## Extra context\n${input.extraContext}\n` : "",
      ``,
      `## Output format`,
      ``,
      `Return a JSON object with these keys:`,
      ``,
      `\`\`\`json`,
      `{`,
      `  "meta_title": "...",`,
      `  "meta_description": "...",`,
      `  "h1": "...",`,
      `  "body_markdown": "## SECTION: key_takeaways\\n...",`,
      `  "schema_json": [ { ... } ],`,
      `  "refresh_summary": "1-2 sentences explaining what changed and why this`,
      `    version is substantially better. The operator reads this in the diff view."`,
      `}`,
      `\`\`\``,
      ``,
      `Design DNA voice (use this for tone, NOT for layout):`,
      ``,
      String(input.designDna || "").slice(0, 4000),
      ``,
      input.businessFacts ? `Real-world business facts (cite verbatim):\n${input.businessFacts}\n` : "",
    ].filter(Boolean).join("\n");
  },
});

// ────────────────────────────────────────────────────────────────
// P3 — build:refresh_recommender
// Cron-fired weekly. Connects to GSC, identifies pages needing refresh,
// populates content_refresh_queue. Output is a markdown digest the operator
// reads to decide which to actually rewrite this week.
// ────────────────────────────────────────────────────────────────
JOB_TEMPLATES.push({
  kind: "build:refresh_recommender",
  label: "Build · Refresh recommender (GSC poll)",
  description:
    "Weekly cron: poll Google Search Console for de-indexed + under-ranking pages. Populate content_refresh_queue with priority + reason. Output: operator digest with 'fix this week' shortlist.",
  category: "research",
  estMinutes: 8,
  fields: [
    { name: "projectId", label: "Project id", type: "text", required: true },
    { name: "siteUrl", label: "Site URL (for GSC lookup)", type: "url", required: true },
    { name: "lookbackDays", label: "Lookback window (days)", type: "text", required: false, placeholder: "28" },
  ],
  buildPrompt(input) {
    const lookback = input.lookbackDays || "28";
    return [
      nichePreface(),
      `TASK: GSC-driven content refresh recommendation.`,
      ``,
      `Project: ${input.projectId}`,
      `Site: ${input.siteUrl}`,
      `Lookback: last ${lookback} days`,
      ``,
      `## Your task`,
      ``,
      `1. Pull GSC data for this site over the last ${lookback} days. Identify:`,
      `   - Pages with "Crawled, currently not indexed" status (highest priority refresh)`,
      `   - Pages with impressions ≥ 50 but average position > 10 (medium priority)`,
      `   - Pages with declining click trend month-over-month ≥ 20% drop (medium)`,
      `   - Pages last published > 12 months ago with no recent updates (low)`,
      ``,
      `2. For each candidate, classify the refresh reason:`,
      `   - deindexed | low_ranking | declining_traffic | outdated_facts | manual`,
      ``,
      `3. Score priority 1-5 (1 = fix this week). Use this rubric:`,
      `   - Priority 1: De-indexed AND used to have impressions`,
      `   - Priority 2: Position 11-20 with ≥ 100 impressions`,
      `   - Priority 3: Position 21-50 with ≥ 50 impressions OR de-indexed with no history`,
      `   - Priority 4: Declining trend on previously-stable page`,
      `   - Priority 5: Old (12+ months) with no engagement`,
      ``,
      `## Output format (mandatory JSON block at end)`,
      ``,
      `Per-page narrative section in markdown, then this JSON:`,
      ``,
      `\`\`\`json`,
      `{`,
      `  "lookback_days": ${lookback},`,
      `  "candidates": [`,
      `    {`,
      `      "page_url": "/blog/...",`,
      `      "page_id": null,`,
      `      "reason": "deindexed",`,
      `      "priority": 1,`,
      `      "gsc_snapshot": {`,
      `        "impressions_28d": 0,`,
      `        "clicks_28d": 0,`,
      `        "avg_position_28d": null,`,
      `        "indexation_state": "Crawled, currently not indexed",`,
      `        "last_crawled": "2026-04-12"`,
      `      },`,
      `      "rationale": "Was getting ~200 impressions/month before April; Google`,
      `        de-indexed it during the spring quality update. Content is generic`,
      `        and lacks operator-specific facts. Rewrite with capsule mode + real names."`,
      `    }`,
      `  ],`,
      `  "summary": {`,
      `    "total_candidates": 0,`,
      `    "priority_1_count": 0,`,
      `    "deindexed_count": 0`,
      `  }`,
      `}`,
      `\`\`\``,
      ``,
      `Use WebSearch and/or GSC integration. If GSC creds not yet connected,`,
      `note that explicitly in the rationale and return an empty candidates array.`,
    ].join("\n");
  },
});

// ────────────────────────────────────────────────────────────────
// Phase 2 — generate-from-brief prompt block.
//
// generateFromBriefAction serializes the APPROVED ContentBriefPlan into
// input.briefPayload (JSON). This helper turns it into a hard instruction
// block that pins the generated page to the brief: outline, word-count band,
// chosen headline + meta title, schema plan, AI-Overview answer block, geo
// entities, internal-link targets, vertical angle, and the explicit
// "needs business fact" gaps the writer must NOT invent around.
//
// Returns "" when no brief is attached (legacy free-form path unchanged).
// ────────────────────────────────────────────────────────────────
interface BriefPromptPayload {
  pageType?: string;
  targetKeyword?: string;
  intent?: string;
  vertical?: string;
  wordCountTarget?: { min?: number; max?: number };
  chosenHeadline?: string;
  chosenMetaTitle?: string;
  headlineOptions?: string[];
  metaTitleOptions?: string[];
  outline?: Array<{ h2?: string; h3?: string[]; purpose?: string; pillarsCovered?: string[] }>;
  schemaPlan?: { types?: string[]; notes?: string[]; avoid?: string[] };
  aiOverviewBlock?: string;
  geoEntities?: string[];
  internalLinkTargets?: string[];
  needsBusinessFacts?: string[];
}

export function buildBriefBlock(raw: string | undefined): string {
  if (!raw || typeof raw !== "string") return "";
  let b: BriefPromptPayload;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return "";
    b = parsed as BriefPromptPayload;
  } catch {
    return "";
  }

  const lines: string[] = [];
  lines.push(``);
  lines.push(`╔════════════════════════════════════════════════════════════════════════════╗`);
  lines.push(`║ APPROVED CONTENT BRIEF — this page MUST follow the structure below          ║`);
  lines.push(`╚════════════════════════════════════════════════════════════════════════════╝`);
  lines.push(``);
  lines.push(`An editor approved a structured brief for this page. Treat it as the spec.`);
  lines.push(`Map each outline H2/H3 below onto the SECTION blocks in the output schema`);
  lines.push(`(hero, feature_grid, comparison_table, faq_accordion, etc.) — the meaning of`);
  lines.push(`each section must match the brief's heading + purpose. Do not drop sections,`);
  lines.push(`do not add unrelated ones.`);
  lines.push(``);

  if (b.wordCountTarget?.min || b.wordCountTarget?.max) {
    lines.push(`Word-count band (defensible — do not pad or thin): ${b.wordCountTarget.min ?? "?"}–${b.wordCountTarget.max ?? "?"} words.`);
  }
  if (b.intent) lines.push(`Search intent: ${b.intent}.`);
  if (b.vertical) lines.push(`Business vertical: ${b.vertical}.`);
  if (b.chosenHeadline) lines.push(`Use this approved H1 (editor's pick): "${b.chosenHeadline}".`);
  if (b.chosenMetaTitle) lines.push(`Use this approved meta_title (editor's pick): "${b.chosenMetaTitle}".`);
  lines.push(``);

  if (Array.isArray(b.outline) && b.outline.length > 0) {
    lines.push(`--- REQUIRED OUTLINE (one page section per H2, in this order) ---`);
    b.outline.forEach((sec, i) => {
      lines.push(`${i + 1}. H2: ${sec.h2 ?? "(untitled)"}`);
      if (sec.purpose) lines.push(`   purpose: ${sec.purpose}`);
      if (Array.isArray(sec.h3) && sec.h3.length) lines.push(`   H3s: ${sec.h3.join(" · ")}`);
      if (Array.isArray(sec.pillarsCovered) && sec.pillarsCovered.length) {
        lines.push(`   pillars: ${sec.pillarsCovered.join(", ")}`);
      }
    });
    lines.push(`--- END OUTLINE ---`);
    lines.push(``);
  }

  if (b.aiOverviewBlock && b.aiOverviewBlock.trim()) {
    lines.push(`--- AI-OVERVIEW ANSWER BLOCK (answer-first, ~40-60 words) ---`);
    lines.push(`Open the page (in the hero subhead or the first content section) with an`);
    lines.push(`answer-first passage built from this brief direction. Keep it tight and`);
    lines.push(`citable; do NOT invent facts to fill it:`);
    lines.push(b.aiOverviewBlock.trim());
    lines.push(`--- END ANSWER BLOCK ---`);
    lines.push(``);
  }

  if (Array.isArray(b.geoEntities) && b.geoEntities.length > 0) {
    lines.push(`Grounded geo entities to weave in (REAL places only — these are the only`);
    lines.push(`place names you may use unless business_facts supplies more): ${b.geoEntities.join(", ")}.`);
    lines.push(``);
  }

  if (Array.isArray(b.internalLinkTargets) && b.internalLinkTargets.length > 0) {
    lines.push(`Internal-link targets for the related_links section (use these slugs): ${b.internalLinkTargets.join(", ")}.`);
    lines.push(``);
  }

  if (b.schemaPlan?.types?.length) {
    lines.push(`Schema plan — emit JSON-LD for: ${b.schemaPlan.types.join(", ")}.`);
    if (b.schemaPlan.avoid?.length) lines.push(`Do NOT emit: ${b.schemaPlan.avoid.join(", ")} (retired / spam-flag risk).`);
    if (b.schemaPlan.notes?.length) {
      for (const n of b.schemaPlan.notes) lines.push(`  · ${n}`);
    }
    lines.push(``);
  }

  if (Array.isArray(b.needsBusinessFacts) && b.needsBusinessFacts.length > 0) {
    lines.push(`⚠ MISSING BUSINESS FACTS — the site has NOT supplied these yet:`);
    for (const gap of b.needsBusinessFacts) lines.push(`  · ${gap}`);
    lines.push(`Write AROUND these gaps. Do NOT invent values for them. Where the outline`);
    lines.push(`needs a missing fact (a price, a license #, a review count), use a neutral`);
    lines.push(`placeholder or omit the specific claim — never fabricate. The editor will`);
    lines.push(`fill these in review.`);
    lines.push(``);
  }

  return lines.join("\n");
}

// ────────────────────────────────────────────────────────────────
// P1 — Blog-capsule mode prompt extension
// Exported helper used by upstream code that pre-builds page_generate prompts:
// if pageType === "blog", inject the blog-capsule instructions block.
// ────────────────────────────────────────────────────────────────
export function blogCapsuleInstructions(): string {
  return [
    ``,
    `## BLOG-CAPSULE MODE (mandatory for pageType=blog)`,
    ``,
    `Every H2 must be framed as a QUESTION — exactly the question a real searcher`,
    `would type into Google. The answer goes immediately below the H2 in 2-4 short`,
    `paragraphs. The first paragraph below each H2 must answer in ≤ 60 words`,
    `(this is the "citable passage" that Google AI Overviews and Perplexity quote).`,
    ``,
    `### Required structure`,
    ``,
    `1. **\`## SECTION: key_takeaways\` block FIRST** — 3-5 single-sentence facts:`,
    `   \`\`\``,
    `   ## SECTION: key_takeaways`,
    `   - fact: <one-sentence answer to question 1>`,
    `   - fact: <one-sentence answer to question 2>`,
    `   - fact: <one-sentence answer to question 3>`,
    `   \`\`\``,
    ``,
    `2. **Intro paragraph block** (\`## SECTION: intro\`):`,
    `   - 2-3 sentences plain English`,
    `   - Primary keyword in first sentence`,
    `   - Signals who this post is for`,
    ``,
    `3. **5-8 \`## SECTION: faq_question\` blocks**, each:`,
    `   \`\`\``,
    `   ## SECTION: faq_question`,
    `   question: <the H2 phrased as a question>`,
    `   answer_summary: <≤ 60 words, the citable passage>`,
    `   answer_detail: <2-3 more paragraphs with examples, named entities, numbers>`,
    `   citations:`,
    `     - source: <real URL>`,
    `     - source: <real URL>`,
    `   \`\`\``,
    ``,
    `4. **\`## SECTION: cta_block\`** at end — single short paragraph + clear CTA.`,
    ``,
    `### Citation discipline (mandatory)`,
    ``,
    `- Every statistic, date, dollar figure, or named-entity claim needs a citation.`,
    `- Use real URLs only — government, academic, established trade publications,`,
    `  manufacturers' / authorities' own sites, etc. DO NOT invent URLs.`,
    `- If you don't know a real source for a claim, soften it ("most providers"`,
    `  instead of "73% of providers") or mark with \`[CITATION_NEEDED]\` so the`,
    `  critic catches it.`,
    `- Cap at 3 citations per H2 — quality over quantity.`,
    ``,
    `### Why this format`,
    ``,
    `Google AI Overviews + Perplexity + ChatGPT-search pull the first 60-word`,
    `paragraph under a question-formatted H2 as the citation source. The key`,
    `takeaways block is what shows up in featured snippets. This is not stylistic`,
    `preference — it is the documented format that gets quoted by AI engines.`,
    ``,
  ].join("\n");
}

// ────────────────────────────────────────────────────────────────
// RESEARCH FOR NEW DESIGN (Phase 1 backend)
//
// Three job kinds power the "find high-performing reference sites →
// break into sections → replicate a section into a build project" flow.
// All three are preferWorker:"mac" — the dashboard only queues; the Mac
// worker (Claude Code subscription) runs them. ZERO Anthropic API.
//
//  · research:design_sites   — LLM web-research (find + vet ~10 sites)
//  · research:capture_sections — NOT an LLM job; runs in the worker's
//      DIRECT_HANDLERS as a Playwright server step (see worker +
//      src/lib/design-capture.ts). Template is here only so the queue
//      has a label + buildPrompt fallback; the worker never feeds the
//      prompt to `claude` for this kind.
//  · research:build_section  — LLM replication of one section's LAYOUT
// ────────────────────────────────────────────────────────────────

/**
 * Turn the niches input (a JSON array, comma-list, or single string the operator
 * typed — e.g. "dental clinic", "law firm") into a human phrase for the research
 * prompt. Niche-agnostic: any value passes through verbatim.
 */
function nichePhrasing(raw: string | undefined): string {
  if (!raw) return "local service business";
  let keys: string[] = [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) keys = parsed.filter((s) => typeof s === "string");
    else if (typeof parsed === "string") keys = [parsed];
  } catch {
    keys = raw.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return keys.length > 0 ? keys.join(", ") : "local service business";
}

JOB_TEMPLATES.push({
  kind: "research:design_sites",
  label: "Research · Find high-performing design references",
  description:
    "Web-research ~10 HIGH-PERFORMING sites in the business's niche for a market, vetting on design quality + market prominence. Returns STRICT JSON the postprocess turns into design_reference_sites rows. Runs on the Mac worker (no API).",
  category: "research",
  estMinutes: 12,
  fields: [
    { name: "runId", label: "Run id (for trace + postprocess routing)", type: "text", required: true },
    { name: "market", label: "Market (e.g. 'Miami, FL' or 'anywhere')", type: "text", required: true, placeholder: "anywhere" },
    { name: "niches", label: "Niche(s) — what the business does (auto-filled)", type: "textarea", required: true },
  ],
  buildPrompt(input) {
    const market = input.market && input.market !== "anywhere"
      ? input.market
      : "various big cities/states (find independent LOCAL operators across different metros — NOT global brands)";
    const niches = nichePhrasing(input.niches);
    return [
      nichePreface(niches),
      `TASK: Find ~10 HIGH-PERFORMING websites to use as DESIGN references for a new`,
      `${niches} site. We are studying their VISUAL DESIGN + structure to`,
      `replicate the best patterns — not copying their copy or photos.`,
      ``,
      `Market: ${market}`,
      `Niche(s) we care about: ${niches}`,
      ``,
      `WHO WE ARE TARGETING — read carefully, this is the whole point:`,
      `We run MID-TIER LOCAL operator sites (single-city or a few service areas, roughly`,
      `20-40 area/service pages — local-SEO sites, the same shape as ours). We want to`,
      `study sites JUST LIKE THAT: independent local/regional operators in a big city or`,
      `state who rank well and pull real traffic IN THEIR OWN MARKET. Those are our peers`,
      `and the realistic benchmark.`,
      ``,
      `❌ HARD EXCLUDE — do NOT return any of these (they are NOT our target):`,
      `  • Global / national / multi-country brands and marketplaces — e.g. Blacklane,`,
      `    Savoya, Carey, Empire CLS, Shofur, GroundLink, Wheely, Addison Lee, Uber/Lyft,`,
      `    or anything operating across many cities/countries.`,
      `  • Venture-backed aggregators, booking marketplaces, franchises, directories,`,
      `    Yelp/Google listings, and dead/parked domains.`,
      `  • Anything with a huge site (hundreds of pages) or a recognizable worldwide brand.`,
      `If a candidate operates in more than ~2-3 metros or reads as a national brand, DROP IT.`,
      ``,
      `Use WebSearch + WebFetch. Vet every candidate on TWO axes:`,
      `  1. DESIGN QUALITY — modern, distinctive, conversion-focused layout (not a`,
      `     generic 2012 template). Strong hero, clear fleet/services presentation,`,
      `     trust signals, a real booking/quote flow.`,
      `  2. LOCAL TRAFFIC / PERFORMANCE — an independent LOCAL operator that clearly does`,
      `     well in ITS OWN market: ranks for "<service> <city>" terms, has area/service`,
      `     pages, looks actively maintained and like it generates real local business`,
      `     (NOT global prominence — local-market traction is what counts).`,
      ``,
      `Prefer a SPREAD across the requested niches and across different cities/states, so`,
      `we see how strong INDEPENDENT LOCAL operators (like us) design their sites.`,
      ``,
      `For each site, note the KEY SECTIONS visible on the homepage (hero, services,`,
      `features, testimonials, pricing, about, cta, gallery, footer) so the next step knows`,
      `what to screenshot.`,
      ``,
      `OUTPUT: a single STRICT JSON array and NOTHING else (no prose, no markdown fence`,
      `commentary outside the code block). Shape:`,
      "```json",
      `[`,
      `  {`,
      `    "url": "https://example.com",`,
      `    "name": "Example Business",`,
      `    "market": "Miami, FL",`,
      `    "niche": "${niches}",`,
      `    "whyHighPerforming": "1-2 sentences on design + market evidence",`,
      `    "designNotes": "specific design moves worth replicating",`,
      `    "designDna": {`,
      `      "palette": ["#0a0a0a", "#c9a227", "#f5f5f0"],`,
      `      "fonts": ["Playfair Display", "Inter"],`,
      `      "layoutStyle": "editorial hero, full-bleed services grid, sticky CTA bar"`,
      `    },`,
      `    "keySections": ["hero", "services", "features", "testimonials", "cta", "footer"]`,
      `  }`,
      `]`,
      "```",
      ``,
      `Return 8-12 objects. Use real, reachable URLs (you fetched them). Set "niche" to`,
      `the business's niche (the value passed in above).`,
    ].join("\n");
  },
});

JOB_TEMPLATES.push({
  kind: "build:sharpen_headlines",
  label: "Content · Sharpen section headlines",
  description:
    "Rewrite a content brief's section H2s into stronger modern local-SEO headlines using the page's harvested keywords + city. Returns STRICT JSON {headlines:[…]} with the same count/order. Runs on the Mac worker (Claude Code subscription, no API).",
  category: "research",
  estMinutes: 2,
  fields: [
    { name: "pageType", label: "Page type", type: "text", required: true },
    { name: "targetKeyword", label: "Target keyword", type: "text", required: true },
    { name: "city", label: "City (optional)", type: "text", required: false },
    { name: "headlines", label: "Current H2s (JSON array)", type: "textarea", required: true },
    { name: "keywords", label: "Harvested keywords (JSON object)", type: "textarea", required: false },
  ],
  buildPrompt(input, ctx) {
    const city = input.city || ctx?.siteCity || "";
    let current: string[] = [];
    try { current = JSON.parse(input.headlines || "[]"); } catch { current = []; }
    let kw: Record<string, string[]> = {};
    try { kw = JSON.parse(input.keywords || "{}"); } catch { kw = {}; }
    const kwLines = Object.entries(kw)
      .filter(([, v]) => Array.isArray(v) && v.length)
      .map(([k, v]) => `- ${k}: ${v.slice(0, 12).join(", ")}`)
      .join("\n");
    return [
      nichePreface(ctx?.niche),
      `TASK: Rewrite the section headlines (H2s) below for a "${input.pageType}" page targeting`,
      `"${input.targetKeyword}"${city ? ` in ${city}` : ""}. Make each one a STRONG, modern local-SEO H2:`,
      `  • specific + benefit/answer-led — never generic ("Our Process", "What we offer", "Our services")`,
      `  • weave in the target keyword, a related/LSI term, OR the city — naturally, only where it fits`,
      `  • question-form for FAQ/informational sections; crisp value for commercial/transactional`,
      `  • Title Case, ~3–9 words, no clickbait, no fabricated numbers/claims`,
      `Return EXACTLY the same number of headlines, in the same order (1-to-1 replacement). Don't add or drop any.`,
      ``,
      `Keywords harvested for this page (prefer these; do not invent facts):`,
      kwLines || "(none harvested — rely on the target keyword + city)",
      ``,
      `Current headlines to rewrite:`,
      current.map((h, i) => `${i + 1}. ${h}`).join("\n"),
      ``,
      `OUTPUT: a single STRICT JSON object and NOTHING else (no prose):`,
      "```json",
      `{ "headlines": [${current.map(() => '"…"').join(", ")}] }`,
      "```",
      `The "headlines" array MUST contain exactly ${current.length} strings, in the original order.`,
    ].join("\n");
  },
});

JOB_TEMPLATES.push({
  kind: "build:classify_sections",
  label: "Research · Classify reference sections (AI)",
  description:
    "Re-label captured design-reference sections: read each section's heading + text and pick the SINGLE dominant type + a short human label. Fixes heuristic mislabels (e.g. an about/reviews block mentioning 'our fleet' once). Returns STRICT JSON {sections:[{id,type,label}]}. Mac worker, no API.",
  category: "research",
  estMinutes: 2,
  fields: [
    { name: "sections", label: "Sections (JSON array)", type: "textarea", required: true },
  ],
  buildPrompt(input) {
    let secs: Array<{ id: string; site?: string; order?: number; heading?: string; summary?: string; imgs?: number; inputs?: number }> = [];
    try { secs = JSON.parse(input.sections || "[]"); } catch { secs = []; }
    const TYPES =
      "hero, services, features, process, areas, faq, stats, partners, testimonials, pricing, about, contact, cta, gallery, footer, other";
    const lines = secs
      .map(
        (s) =>
          `- id ${s.id} [site: ${s.site || "?"}, order ${s.order ?? "?"}, ${s.imgs ?? 0} imgs, ${s.inputs ?? 0} form fields]\n` +
          `  heading: ${s.heading || "(none)"}\n` +
          `  text: ${(s.summary || "").replace(/\s+/g, " ").slice(0, 320)}`,
      )
      .join("\n");
    return [
      "You label captured website sections for a design-reference library (any local service business).",
      "For EACH section below, choose the SINGLE best type for its PRIMARY purpose, plus a short human label (≤6 words).",
      `Allowed types (use exactly one, lowercase): ${TYPES}.`,
      "",
      "Judgement rules:",
      "- Label by the DOMINANT content, never an incidental phrase. A ratings/reviews band is 'testimonials' even if its paragraph mentions a service once.",
      "- 'hero' = the top banner / primary booking hero only. 'cta' = a booking/quote conversion band lower on the page.",
      "- 'features' = why-choose-us / benefits; 'process' = how-it-works / steps; 'areas' = service areas / coverage / cities; 'stats' = a numbers band (years, jobs, ratings count); 'partners' = logo wall / accreditations; 'about' = company story; 'contact' = contact info / map / hours; 'services' = the list of services offered; 'pricing' = rates/packages.",
      "- If a section truly mixes topics, pick the type a designer would file it under and reflect the mix in the LABEL (e.g. 'Reviews + Company Intro').",
      "- Label is human-facing Title Case describing what the section IS: 'Customer Reviews', 'Our Services', 'How It Works', 'Service Areas'.",
      "",
      "Sections:",
      lines || "(none)",
      "",
      "OUTPUT: a single STRICT JSON object and NOTHING else (no prose, no markdown outside the fence):",
      "```json",
      `{ "sections": [ { "id": "…", "type": "…", "label": "…" } ] }`,
      "```",
      `Return EXACTLY one entry per input section (${secs.length} total), each keyed by the given id.`,
    ].join("\n");
  },
});

JOB_TEMPLATES.push({
  kind: "research:capture_sections",
  label: "Research · Capture reference sections (Playwright)",
  description:
    "NON-LLM. The Mac worker runs Playwright: full-page screenshot + per-section screenshots (DOM: section/header/footer + large main>div) with a type guess + dom_summary + bounding box. Handled by the worker's DIRECT_HANDLERS, not the claude CLI.",
  category: "research",
  estMinutes: 6,
  fields: [
    { name: "runId", label: "Run id", type: "text", required: true },
  ],
  buildPrompt(input) {
    // This kind is dispatched to the worker's DIRECT_HANDLERS (Playwright),
    // so the prompt is never fed to Claude. Provide a sane fallback string.
    return `research:capture_sections is a server-run Playwright step (run id ${input.runId}); it does not use an LLM prompt.`;
  },
});

JOB_TEMPLATES.push({
  kind: "audit:section_watch",
  label: "Audit · Section watch (canonical sections, $0 vision)",
  description:
    "NON-LLM template. The Mac worker captures one representative page per page-type, runs $0 Claude Code vision to detect which sections each page has, compares against the canonical REQUIRED_SECTIONS, and ingests the missing-section findings into the Health dashboard. Handled by the worker's DIRECT_HANDLERS (Playwright + Claude Code vision), not the claude CLI here.",
  category: "audit",
  estMinutes: 6,
  fields: [
    { name: "siteId", label: "Site id", type: "text", required: true },
  ],
  buildPrompt(input) {
    // Dispatched to the worker's DIRECT_HANDLERS (Playwright + $0 vision), so
    // the prompt is never fed to a server-side Claude. Sane fallback string.
    return `audit:section_watch is a Mac-worker step (site ${input.siteId}); it does not use a server LLM prompt.`;
  },
});

JOB_TEMPLATES.push({
  kind: "research:build_section",
  label: "Research · Rebuild a reference section",
  description:
    "Replicate the LAYOUT/STRUCTURE of one captured reference section — not its text or images — as production HTML + scoped CSS, with fresh copy for the target business. Runs on the Mac worker (no API). Postprocess writes it into the target build project.",
  category: "design",
  estMinutes: 6,
  fields: [
    { name: "selectionId", label: "Selection id (for postprocess routing)", type: "text", required: true },
    { name: "sectionType", label: "Section type", type: "text", required: true },
    { name: "targetBusiness", label: "Target business name", type: "text", required: true },
    { name: "niche", label: "Business niche / industry", type: "text", required: false, placeholder: "dental clinic" },
    { name: "targetCity", label: "Target city", type: "text", required: false },
    { name: "brandPalette", label: "Brand palette (or 'use-own' to keep the section's palette)", type: "text", required: false },
    { name: "domSummary", label: "Section DOM summary (auto-filled)", type: "textarea", required: false },
    { name: "designDna", label: "Reference design DNA (JSON, auto-filled)", type: "textarea", required: false },
    { name: "screenshotRef", label: "Screenshot reference URL/path (auto-filled)", type: "text", required: false },
  ],
  buildPrompt(input) {
    const useOwn = (input.brandPalette ?? "").trim().toLowerCase() === "use-own";
    const paletteLine = useOwn
      ? `Use the REFERENCE SECTION'S OWN palette (from the design DNA below) — the operator chose to keep its look.`
      : input.brandPalette
        ? `Use the target brand palette: ${input.brandPalette}`
        : `Use a tasteful palette consistent with the design DNA below.`;
    return [
      nichePreface(input.niche),
      `TASK: Rebuild this ${input.sectionType} section. Replicate the LAYOUT and STRUCTURE`,
      `ONLY — the grid, the composition, the visual hierarchy, the component pattern.`,
      `Do NOT copy the original text or images.`,
      ``,
      `Write FRESH copy for: ${input.targetBusiness}${input.targetCity ? ` (${input.targetCity})` : ""}.`,
      paletteLine,
      ``,
      input.designDna ? `--- REFERENCE DESIGN DNA (JSON) ---\n${input.designDna}\n--- END ---\n` : ``,
      input.domSummary ? `--- REFERENCE SECTION DOM SUMMARY ---\n${input.domSummary}\n--- END ---\n` : ``,
      input.screenshotRef ? `Reference screenshot (for layout only): ${input.screenshotRef}\n` : ``,
      ``,
      `Requirements:`,
      `  · Output PRODUCTION HTML for the section + a <style> block with SCOPED CSS`,
      `    (prefix every selector with a unique wrapper class so it can't leak).`,
      `  · Mobile-responsive. Real, specific copy for the business's niche (no lorem, no hedges`,
      `    like "world-class" — use concrete numbers/places where plausible).`,
      `  · Accessible: semantic tags, alt text on image placeholders, 44px tap targets.`,
      `  · Use placeholder image refs (e.g. /assets/${input.sectionType}-1.jpg) — do NOT`,
      `    hotlink the reference site's images.`,
      ``,
      `Output a JSON code block (and nothing else) with this exact shape:`,
      "```json",
      `{`,
      `  "section_type": "${input.sectionType}",`,
      `  "html": "<section class=\\"...\\">…</section>",`,
      `  "css": "<style>.wrapper-xyz { … }</style>",`,
      `  "copy_notes": "1-2 sentences on the voice/angle you used"`,
      `}`,
      "```",
      ``,
      `Output ONLY the JSON code block. No preamble.`,
    ].join("\n");
  },
});
