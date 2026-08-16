/**
 * P6 + A1 — Prompt library helpers.
 *
 * Every prompt is NICHE-AGNOSTIC: the operator types their industry once
 * (e.g. "dental clinic", "law firm", "HVAC contractor") and the same
 * templates adapt via the {niche} variable. `nichePreface(niche)` builds the
 * standard opening every prompt shares; `LIMO_PREFACE` is kept as a generic
 * default (niche = "local service business") so existing references stay valid.
 *
 * The agent treats these as ground-truth voice + structure. Override any
 * slot via /admin/prompts to tune voice site-by-site.
 */
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { promptTemplates } from "../db/schema";

/**
 * Standard industry preface — every prompt opens with this. Driven by the
 * operator's niche so the whole factory adapts to ANY business type.
 */
export function nichePreface(niche?: string | null): string {
  const n = (niche && niche.trim()) || "local service business";
  return [
    `You are working on the website for a ${n}.`,
    "",
    "Conventions you MUST respect:",
    `- Tone: professional, trustworthy, and appropriate for a ${n}. Match how a discerning customer of this kind of business expects to be spoken to. Never spammy, never "we hustle harder" marketing-speak.`,
    `- Audience: the real customers a ${n} serves. Speak to their actual needs, questions, and decision criteria.`,
    "- Visual: clean, credible, on-brand for the industry. Use the site's own palette and typography; avoid neon, garish multi-color gradients, or comic-style clip art unless the brand calls for it.",
    `- Imagery: photography and motifs that genuinely fit a ${n} — real settings, real outcomes, real people where appropriate. Avoid imagery from unrelated industries.`,
    "- Conversion: make the primary action obvious. A way to contact or book (tappable phone / form / CTA) must be reachable above the fold.",
    "- Trust signals: experience, credentials, licensing/insurance where relevant, real reviews/testimonials, guarantees — whatever this industry's customers look for.",
    "- Never invent facts. No fabricated prices, stats, awards, reviews, years-in-business, or claims. Use only verified business facts or omit.",
    "",
  ].join("\n");
}

export interface PromptSlot {
  slot: string;
  label: string;
  description: string;
  default: string;
  placeholders: string[];
  /** Category for the prompts UI grouping. */
  category: "seo" | "content" | "research" | "design" | "qa" | "chat";
}

/**
 * Generic default preface (niche = "local service business"). Kept as a
 * constant so the static PROMPT_SLOTS defaults below remain valid. The build
 * pipeline uses `nichePreface(niche)` with the operator's real niche.
 */
export const LIMO_PREFACE = nichePreface();

export const PROMPT_SLOTS: PromptSlot[] = [
  // ───────── SEO ─────────
  {
    slot: "seo_meta_title",
    label: "SEO — Meta title rewrite",
    category: "seo",
    description: "30-60 char meta title for a page.",
    placeholders: ["{{site_name}}", "{{city}}", "{{page_title}}", "{{focus_keyword}}"],
    default:
      LIMO_PREFACE +
      "TASK: Rewrite the page title to a 30-60 character meta title.\n\n" +
      "Site: {{site_name}} — in {{city}}.\n" +
      "Page subject: {{page_title}}.\n" +
      "Focus keyword: {{focus_keyword}}.\n\n" +
      "Rules:\n" +
      "- 30-60 characters total\n" +
      "- Include the focus keyword once if natural\n" +
      "- Always mention the city\n" +
      "- Use Title Case for main words\n" +
      "- Use the industry's natural, professional phrasing customers actually search for\n" +
      "- No emojis, no clickbait punctuation, no all-caps shouting\n\n" +
      "Return only the title text, nothing else.",
  },
  {
    slot: "seo_meta_description",
    label: "SEO — Meta description rewrite",
    category: "seo",
    description: "140-160 char meta description.",
    placeholders: ["{{site_name}}", "{{city}}", "{{page_title}}", "{{focus_keyword}}"],
    default:
      LIMO_PREFACE +
      "TASK: Write a compelling 140-160 character meta description.\n\n" +
      "Site: {{site_name}} ({{city}})\n" +
      "Page: {{page_title}}\n" +
      "Focus keyword: {{focus_keyword}}\n\n" +
      "Rules:\n" +
      "- Exactly 140-160 chars\n" +
      "- End with a clear, professional CTA (Book today. · Call for a quote. · Get started. — never 'CLICK NOW' or fake urgency)\n" +
      "- Mention {{city}} naturally\n" +
      "- Emphasize whatever this industry's customers value most (quality, expertise, responsiveness, availability)\n" +
      "- No hyperbole, no emojis, no exclamation marks\n\n" +
      "Return only the description text.",
  },

  // ───────── Content ─────────
  {
    slot: "content_brief_draft",
    label: "Content — Draft from brief",
    category: "content",
    description: "Blog draft from a brief, in the business's niche.",
    placeholders: ["{{brief_markdown}}", "{{site_name}}", "{{target_keyword}}", "{{tone}}"],
    default:
      LIMO_PREFACE +
      "TASK: Write a publishable Markdown draft from the brief below.\n\n" +
      "Site: {{site_name}}\n" +
      "Target keyword: {{target_keyword}}\n" +
      "Tone: {{tone}} (but always professional + industry-appropriate)\n\n" +
      "Brief:\n{{brief_markdown}}\n\n" +
      "Structure rules:\n" +
      "- H1 title that mentions the target keyword once naturally\n" +
      "- Opening paragraph establishing the context (city, service, audience)\n" +
      "- Body sections aligned with the brief's outline\n" +
      "- Concrete, industry-specific details a real customer of this business would care about\n" +
      "- Local references (the city, nearby areas, relevant local landmarks/context)\n" +
      "- Internal links to the booking/contact, services, and service-area pages where natural\n" +
      "- Closing CTA: 'Get a quote' or 'Book now' with a link to the booking/contact page\n" +
      "- 800-1500 words for service pages, 1500-2500 for guide/how-to posts\n" +
      "- Short paragraphs (2-3 sentences). No fluff. No 'in today's fast-paced world'.\n" +
      "- Trust language grounded in this industry's real signals (credentials, guarantees, experience) — never fabricated.\n",
  },

  // ───────── Research ─────────
  {
    slot: "research_market_audit",
    label: "Research — Market audit for a city",
    category: "research",
    description: "Survey of competitors + positioning in a city, for the business's niche.",
    placeholders: ["{{city}}", "{{region}}"],
    default:
      LIMO_PREFACE +
      "TASK: Audit the market for this business's niche in {{city}}, {{region}}.\n\n" +
      "Research and return as structured Markdown:\n\n" +
      "1. **Market size signals** — population, local demand drivers, and any seasonal/event factors that drive demand for this kind of business.\n\n" +
      "2. **Top 10 competitors** — for each:\n" +
      "   - Company name + website URL\n" +
      "   - Scope of services\n" +
      "   - Positioning angle (e.g. 'premium', 'specialist', 'budget')\n" +
      "   - 1-line differentiator\n\n" +
      "3. **Common positioning angles in this market** — what does everyone claim? What's the saturation noise?\n\n" +
      "4. **White space** — what's underserved? (specific niches or angles no competitor owns)\n\n" +
      "5. **Trust signals customers expect** — what credentials/licensing/certifications must be visible for this industry?\n\n" +
      "6. **Local SEO patterns** — what cities/neighborhoods/landmarks should service-area pages cover?\n\n" +
      "Browse competitor URLs to verify claims. Cite sources for any external claims with [name](url) inline.",
  },
  {
    slot: "research_competitor_teardown",
    label: "Research — Single competitor teardown",
    category: "research",
    description: "Deep teardown of one competitor site.",
    placeholders: ["{{competitor_url}}", "{{our_site_url}}"],
    default:
      LIMO_PREFACE +
      "TASK: Tear down {{competitor_url}} and compare to {{our_site_url}}.\n\n" +
      "Browse both sites. For the competitor, document:\n\n" +
      "**Above-the-fold**: hero copy, CTA, primary phone number, value prop.\n\n" +
      "**Offering**: which services/products shown, photo style (studio / on-location / stock), pricing transparency.\n\n" +
      "**Booking/contact flow**: form fields asked upfront, friction (account required? payment required?), confirmation experience.\n\n" +
      "**Trust signals**: experience, credentials, insurance/licensing, testimonials shown, awards/certifications.\n\n" +
      "**Service areas**: cities + neighborhoods + landmarks called out.\n\n" +
      "**SEO**: title patterns, schema markup present (Yes/No: LocalBusiness, FAQPage, Review), blog cadence.\n\n" +
      "**Visual**: palette, typography, photo style, mobile-first?.\n\n" +
      "**What they do BETTER than us** — concrete elements we should adopt.\n\n" +
      "**What WE do better** — confirm our advantages.\n\n" +
      "**3 actions to take this week** — prioritized.",
  },

  // ───────── Design ─────────
  {
    slot: "design_dna_synthesis",
    label: "Design — Synthesize Design DNA",
    category: "design",
    description: "From research + brand, output the per-site Design DNA.",
    placeholders: ["{{site_name}}", "{{city}}", "{{market_audit}}", "{{brand_audit}}", "{{audience}}"],
    default:
      LIMO_PREFACE +
      "TASK: Produce a unique Design DNA for {{site_name}} ({{city}}).\n\n" +
      "Inputs:\n" +
      "- Market audit: {{market_audit}}\n" +
      "- Brand audit (existing site): {{brand_audit}}\n" +
      "- Audience: {{audience}}\n\n" +
      "Output Markdown with these sections:\n\n" +
      "**Positioning** — one sentence that anchors everything else. Must be DIFFERENT from at least 7 of the competitors in the market audit.\n\n" +
      "**Palette** — 5 colors with hex codes + role (primary / accent / surface / text / muted). Choose colors that fit this industry and stand apart from the local competitors.\n\n" +
      "**Typography** — display font + body font (Google-fonts-named). Justify each choice against the positioning.\n\n" +
      "**Photo style** — describe the imagery direction: lighting / framing / subjects appropriate to this niche. Specify what to AVOID (e.g. generic, off-industry stock).\n\n" +
      "**Microcopy voice** — 3 example CTAs in the voice + 1 hero headline + 1 form intro.\n\n" +
      "**Motifs** — 2-3 small repeatable patterns (e.g. 'thin rule under every section header', 'card hover lifts 4px with subtle shadow').\n\n" +
      "**Reference gallery** — 10 specific page URLs of best-in-class sites in THIS niche. For each: URL + 1 sentence on what to learn from it.\n\n" +
      "**Anti-patterns** — list 5 things this site MUST NOT look like (e.g. 'generic dark hero with red CTA buttons').",
  },
  {
    slot: "design_variant_brief",
    label: "Design — Generate variant for a section",
    category: "design",
    description: "Produce HTML+CSS for a single page section, constrained to DNA.",
    placeholders: ["{{section}}", "{{intent}}", "{{design_dna}}", "{{site_url}}", "{{viewport}}"],
    default:
      LIMO_PREFACE +
      "TASK: Generate ONE variant of the {{section}} section for {{site_url}}.\n\n" +
      "Intent: {{intent}}\n\n" +
      "Design DNA (must obey):\n{{design_dna}}\n\n" +
      "Target viewport for primary design: {{viewport}}\n\n" +
      "Constraints:\n" +
      "- Phone number must be tappable (tel: link) and visible without scroll on mobile\n" +
      "- Primary CTA must read 'Book Now' / 'Get a Quote' / 'Contact Us' as fits the industry — never fake urgency\n" +
      "- If a price is shown, it must be ranged ('From $XX') or 'Get a quote'\n" +
      "- Tap targets ≥ 44×44 px on mobile\n" +
      "- No marquee scrolling text, no auto-play video with sound, no chat-popup over hero\n\n" +
      "Output:\n" +
      "1. **HTML** (semantic, accessible, ARIA labels on buttons + form fields)\n" +
      "2. **CSS** (scoped to this section via a unique parent class — no global resets)\n" +
      "3. **Rationale** — 3 bullet points on why this variant is distinct from competitors\n" +
      "4. **Mobile-first responsive notes** — what breakpoints + transformations\n\n" +
      "Generate genuinely distinct creative — not a minor tweak of the existing layout.",
  },

  // ───────── QA ─────────
  {
    slot: "qa_failure_summary",
    label: "QA — Summarize a failed check",
    category: "qa",
    description: "Plain-English explanation of a QA failure for the admin.",
    placeholders: ["{{check}}", "{{url}}", "{{viewport}}", "{{evidence}}"],
    default:
      "A Quality-Assurance check failed on a business website.\n\n" +
      "Check: {{check}}\n" +
      "URL: {{url}}\n" +
      "Viewport: {{viewport}}\n" +
      "Evidence:\n{{evidence}}\n\n" +
      "Explain in 2 short sentences what's wrong, why a customer would notice it, and the single recommended fix. " +
      "Be specific (mention exact element, not generic 'fix the layout'). End with one of: 'Fix in CSS', 'Fix in HTML', 'Fix in plugin config', 'Fix in WP admin'.",
  },

  // ───────── Chat ─────────
  {
    slot: "agent_chat_system",
    label: "Chat — Assistant system prompt",
    category: "chat",
    description: "System prompt for the /admin/chat read-only assistant.",
    placeholders: ["{{user_role}}", "{{visibility_scope}}"],
    default:
      LIMO_PREFACE +
      "You are the AI Website Factory assistant for a {{user_role}}.\n\n" +
      "Visibility scope: {{visibility_scope}}\n\n" +
      "Behavior:\n" +
      "- Read-only. NEVER suggest writes — direct the user to the relevant /admin page if they want to act.\n" +
      "- Concise. Single paragraphs. No marketing fluff.\n" +
      "- When discussing SEO, frame advice in terms of the business's own niche and local market.\n" +
      "- When discussing design, reference the industry's conventions and what its customers expect.\n" +
      "- If asked something outside your scope, say so plainly.",
  },
  {
    slot: "weekly_report_polish",
    label: "Weekly report — LLM polish",
    category: "content",
    description: "Optional polish pass over the auto-generated weekly report markdown.",
    placeholders: ["{{markdown_body}}"],
    default:
      "Polish this auto-generated weekly report markdown for a website-network operator. " +
      "Keep all numbers exactly as-is. Improve readability of section transitions. " +
      "Keep the same structure. Frame insights in each site's own niche terms when relevant.\n\n" +
      "{{markdown_body}}",
  },
];

/** Resolve the active prompt for a slot — falling back to the default. */
export async function getActivePrompt(slot: string): Promise<{ body: string; version: number | null; source: "db" | "default" }> {
  const def = PROMPT_SLOTS.find((s) => s.slot === slot);
  const [row] = await db()
    .select({ body: promptTemplates.body, version: promptTemplates.version })
    .from(promptTemplates)
    .where(and(eq(promptTemplates.slot, slot), eq(promptTemplates.isActive, true)))
    .orderBy(desc(promptTemplates.version))
    .limit(1);
  if (row) return { body: row.body, version: row.version, source: "db" };
  return { body: def?.default ?? "", version: null, source: "default" };
}

/** Render a prompt by replacing `{{placeholder}}` tokens. */
export function renderPrompt(body: string, vars: Record<string, string>): string {
  return body.replace(/\{\{([a-z_]+)\}\}/g, (_, key) => vars[key] ?? "");
}
