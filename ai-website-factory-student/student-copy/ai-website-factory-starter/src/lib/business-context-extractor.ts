/**
 * P8 — Business context Markdown extractor.
 *
 * Replaces the "Business Facts" wizard form with a single Markdown upload.
 * The operator pastes whatever they have — a Google Doc dump, notes from a
 * discovery call, a competitor analysis with handwritten annotations — and
 * Haiku 4.5 (cheap, fast) extracts structured `business_facts` JSON
 * conforming to the platform's existing schema.
 *
 * The extractor is tuned for **Dubai cleaning & maintenance services**
 * businesses. Fields for the legacy transport vertical are preserved in the
 * schema for backwards compatibility with existing rows, but the LLM prompt
 * instructs the model to leave them empty and populate the cleaning-specific
 * fields instead.
 *
 * Schema matches what `build:page_generate` reads from
 * `site_build_projects.business_facts`:
 *   - contact_phone, contact_email, address
 *   - founding_year
 *   - services_offered[] (villa deep clean, apartment maintenance, sofa/carpet, etc.)
 *   - checklist_points (e.g. "60-point checklist")
 *   - team_size (number of cleaners on staff)
 *   - service_areas[] (Dubai neighborhoods + adjacent emirates)
 *   - trade_licence (Dubai Municipality / DED registration)
 *   - languages_supported[] (English, Arabic, Hindi, Urdu, Tagalog, etc.)
 *   - hourly_rates_aed (per service class in AED)
 *   - minimum_hours
 *   - differentiators[]
 *   - service_areas_summary
 *   - aggregate_rating { value, count, source }
 *   - associations[] (industry memberships, quality marks)
 *   - Legacy transport-vertical fields (fleet_size, fleet_classes, drivers,
 *     licenses, fleet_inspection_cadence) — retained for schema compatibility
 *     with older `site_build_projects` rows; the LLM omits them for
 *     cleaning-vertical extractions.
 *
 * The extraction is intentionally CONSERVATIVE: if Haiku isn't sure about
 * a value, the field is omitted rather than fabricated. The wizard step
 * shows the operator a side-by-side preview and lets them edit each field
 * before saving.
 */

import { getLLMClient } from "./llm";
import type Anthropic from "@anthropic-ai/sdk";

/** Structured business facts — must match what page_generate consumes. */
export interface BusinessFacts {
  /** Phone in display form: "+971 4 555 0123" — null if not in source. */
  contact_phone?: string | null;
  contact_email?: string | null;
  address?: string | null;
  about_url?: string | null;
  /** Year operator was founded (e.g. 2020). null if unknown. */
  founding_year?: number | null;

  // ── Cleaning-vertical fields (primary target) ──────────────────────

  /** Service categories offered ("villa deep clean", "sofa cleaning", ...). */
  services_offered?: string[];
  /** Total points in the audited cleaning checklist (e.g. 60). */
  checklist_points?: number;
  /** Number of trained cleaners on staff. */
  team_size?: number;
  /** Dubai neighborhoods + adjacent emirates covered. */
  service_areas?: string[];
  /** Dubai Municipality / DED trade licence number. */
  trade_licence?: string | null;
  /** Customer-facing languages: English, Arabic, Hindi, Urdu, Tagalog, etc. */
  languages_supported?: string[];
  /** Per-service AED hourly rates ("villa_deep_clean": 350). */
  hourly_rates_aed?: Record<string, number>;
  /** Minimum booking length in hours. */
  minimum_hours?: number;
  /** Concrete differentiators (not marketing hedges). */
  differentiators?: string[];
  /** Plain-English service area summary. */
  service_areas_summary?: string;
  /** Real aggregate review rating — only fill if source includes specific numbers. */
  aggregate_rating?: { value: number; count: number; source?: string };
  /** Industry associations / memberships / quality marks. */
  associations?: Array<{ name: string; since?: number }>;

  // ── Legacy transport-vertical fields (schema compatibility only) ───
  // Retained so older site_build_projects rows still deserialize. The
  // extractor prompt tells the LLM to leave these empty for cleaning
  // businesses. Do not add new features that read them.

  /** @deprecated legacy — not populated for cleaning vertical. */
  fleet_size?: number | null;
  /** @deprecated legacy — not populated for cleaning vertical. */
  fleet_classes?: Array<{
    class: "sedan" | "suv" | "sprinter_van" | "stretch_limo" | "party_bus" | "executive_van" | "specialty";
    count: number;
    notes?: string;
  }>;
  /** @deprecated legacy — not populated for cleaning vertical. */
  drivers?: Array<{
    name: string;
    years_experience?: number;
    languages?: string;
    specialties?: string;
  }>;
  /** @deprecated legacy — not populated for cleaning vertical. */
  licenses?: Array<{ kind: string; number?: string }>;
  /** @deprecated legacy — use `hourly_rates_aed` instead. */
  hourly_rates?: Record<string, number>;
  /** @deprecated legacy — not populated for cleaning vertical. */
  fleet_inspection_cadence?: string;
}

/**
 * Result of an extraction pass — the structured facts plus debug context.
 */
export interface ExtractionResult {
  facts: BusinessFacts;
  /** Fields that were CONFIDENT (>= 80% sure). */
  confident_fields: string[];
  /** Fields the model UNSURE about — flagged for operator review. */
  uncertain_fields: Array<{ field: string; suspected_value: unknown; reason: string }>;
  /** Topics in the source that the model couldn't map to schema. */
  unmapped_topics: string[];
  /** Token usage for cost transparency. */
  tokens_input: number;
  tokens_output: number;
  /** Model used. */
  model: string;
}

const EXTRACTOR_SYSTEM = `You are a careful structured-data extractor for a Dubai-based cleaning & maintenance services business management platform.

INPUT: free-form Markdown notes about a Dubai cleaning-services operator. Could be discovery-call notes, a business plan dump, competitor analysis, or just a memory dump. Quality and structure vary wildly.

OUTPUT: a single JSON object matching the BusinessFacts schema. Be CONSERVATIVE — if you can't find a value with high confidence, OMIT the field. NEVER invent phone numbers, trade licence numbers, founding years, or AED rates. NEVER guess at things like "they probably offer villa cleaning" — only include what's explicitly in the source.

EXTRACTION RULES:
1. Phone: only extract if it looks like a real UAE phone (+971 4 xxx xxxx, +971 5x xxx xxxx, or 04-xxxxxxx / 05x-xxxxxxx local format). Ignore placeholders.
2. Founding year: only extract if explicitly stated ("since 2020", "founded 2018", "we've been operating for 5 years" implies founding year — compute from current year 2026).
3. services_offered: extract from statements like "we offer villa deep cleaning, sofa cleaning, and post-construction cleans". Canonical service names: villa deep clean, apartment maintenance, move-in / move-out cleaning, post-construction cleaning, sofa cleaning, carpet cleaning, curtain cleaning, mattress cleaning, office cleaning, kitchen deep clean, bathroom deep clean, disinfection.
4. checklist_points: extract if source mentions "60-point checklist" or "audited against N items".
5. team_size: extract if a specific staff count is given.
6. service_areas: extract Dubai neighbourhoods + emirates mentioned. Canonical Dubai areas: Palm Jumeirah, Emirates Hills, Dubai Marina, Downtown Dubai, DIFC, JBR, Business Bay, Jumeirah, Al Barsha, Dubai Hills, Arabian Ranches, JVC, Silicon Oasis, Meadows, The Springs, The Greens, Damac Hills, Mirdif, Al Quoz.
7. trade_licence: extract Dubai Municipality or DED trade licence number if present ("DED 123456", "trade licence 555321").
8. languages_supported: extract customer-facing languages ("English, Arabic, Hindi"). Never assume — only extract if stated.
9. hourly_rates_aed: extract only if specific AED numbers given ("AED 350 per villa", "AED 95/hour"). "Premium pricing" doesn't count.
10. Differentiators: extract concrete claims ("60-point written audit sheet shared before booking", "same-day fixed AED quote"), NOT marketing hedges ("world-class", "premium service", "exceptional").
11. Aggregate rating: only if source has specific star count + review count from a named source (Google, Trustpilot, etc.).
12. Legacy transport fields (fleet_size, fleet_classes, drivers, licenses, fleet_inspection_cadence, hourly_rates): LEAVE EMPTY. These belong to a previous vertical and do not apply.
13. ANYTHING you're <80% sure about goes in uncertain_fields with the suspected value + reason — operator decides.

Output STRICT JSON. No explanation outside the JSON.`;

const EXTRACTOR_OUTPUT_SHAPE = `Return EXACTLY this shape (omit any field you can't extract confidently):

{
  "facts": {
    "contact_phone": "+971 4 555 0123" | null,
    "contact_email": "hello@example.ae" | null,
    "address": "Office 305, Al Barsha Business Centre, Dubai" | null,
    "founding_year": 2020 | null,
    "services_offered": [
      "villa deep clean",
      "apartment maintenance",
      "move-in / move-out cleaning",
      "sofa cleaning"
    ],
    "checklist_points": 60,
    "team_size": 14,
    "service_areas": [
      "Palm Jumeirah",
      "Dubai Marina",
      "Downtown Dubai",
      "Business Bay",
      "Emirates Hills"
    ],
    "trade_licence": "DED 555321" | null,
    "languages_supported": ["English", "Arabic", "Hindi"],
    "hourly_rates_aed": {
      "villa_deep_clean": 350,
      "apartment_maintenance": 95,
      "sofa_cleaning": 180
    },
    "minimum_hours": 3,
    "differentiators": [
      "Written 60-point checklist shared before booking",
      "Same-day fixed AED quote"
    ],
    "service_areas_summary": "All Dubai residential communities plus Sharjah on request",
    "aggregate_rating": { "value": 4.8, "count": 247, "source": "Google" },
    "associations": [{ "name": "Dubai Chamber of Commerce", "since": 2020 }]
  },
  "confident_fields": ["contact_phone", "founding_year", "services_offered"],
  "uncertain_fields": [
    { "field": "minimum_hours", "suspected_value": 4, "reason": "Source says '4-hour minimum' but also '3 hours flexible' elsewhere — unclear which is current policy." }
  ],
  "unmapped_topics": ["competitor pricing analysis", "future expansion to Abu Dhabi"]
}`;

/**
 * Run the extraction. Uses Haiku 4.5 (cheap, fast) — entire extraction is
 * one API call returning ~1-3kB of structured JSON.
 */
export async function extractBusinessFacts(input: {
  markdown: string;
  /** Optional hint: the operator's business name (helps the model disambiguate). */
  businessName?: string;
  /** Optional hint: city — helps locate addresses + phone area codes. */
  targetCity?: string;
  client?: Anthropic;
}): Promise<ExtractionResult> {
  const client = input.client ?? (await getLLMClient({ tier: "cheap" })).client;
  const model = "claude-haiku-4-5";

  const userPrompt = [
    input.businessName ? `Business name: ${input.businessName}` : ``,
    input.targetCity ? `Target city: ${input.targetCity}` : ``,
    ``,
    `Source notes (extract structured facts from this):`,
    ``,
    `--- BEGIN SOURCE ---`,
    input.markdown,
    `--- END SOURCE ---`,
    ``,
    EXTRACTOR_OUTPUT_SHAPE,
  ].filter(Boolean).join("\n");

  const response = await client.messages.create({
    model,
    max_tokens: 4096,
    system: EXTRACTOR_SYSTEM,
    messages: [{ role: "user", content: userPrompt }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  const rawText = textBlock && "text" in textBlock ? textBlock.text : "";
  if (!rawText) {
    throw new Error("Extractor returned empty response");
  }

  // The model usually returns ```json ... ``` — strip the fence if present.
  const jsonMatch = rawText.match(/```json\s*([\s\S]*?)\s*```/) || rawText.match(/(\{[\s\S]*\})/);
  const jsonStr = jsonMatch ? jsonMatch[1] : rawText;

  let parsed: {
    facts: BusinessFacts;
    confident_fields?: string[];
    uncertain_fields?: Array<{ field: string; suspected_value: unknown; reason: string }>;
    unmapped_topics?: string[];
  };
  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    throw new Error(`Extractor returned invalid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!parsed.facts || typeof parsed.facts !== "object") {
    throw new Error("Extractor response missing 'facts' object");
  }

  // Strip out any null fields — they pollute the JSONB column.
  const cleanFacts: BusinessFacts = {};
  for (const [k, v] of Object.entries(parsed.facts)) {
    if (v === null || v === undefined) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 0) continue;
    (cleanFacts as Record<string, unknown>)[k] = v;
  }

  return {
    facts: cleanFacts,
    confident_fields: parsed.confident_fields ?? [],
    uncertain_fields: parsed.uncertain_fields ?? [],
    unmapped_topics: parsed.unmapped_topics ?? [],
    tokens_input: response.usage.input_tokens,
    tokens_output: response.usage.output_tokens,
    model,
  };
}

/**
 * Merge the extractor result into an existing BusinessFacts row. Used when
 * the operator runs the extractor multiple times against different sources
 * (e.g. first the discovery-call notes, then a competitor doc, then an
 * existing About page). Conservative merge — existing values are NOT
 * overwritten unless the new value is non-null and has more detail.
 */
export function mergeBusinessFacts(
  existing: BusinessFacts | null | undefined,
  extracted: BusinessFacts,
): BusinessFacts {
  if (!existing) return extracted;
  const merged: BusinessFacts = { ...existing };
  for (const [k, v] of Object.entries(extracted)) {
    if (v === null || v === undefined) continue;
    const existingVal = (existing as Record<string, unknown>)[k];
    // Array fields: union by simple stringify-then-uniq
    if (Array.isArray(v)) {
      if (!Array.isArray(existingVal)) {
        (merged as Record<string, unknown>)[k] = v;
      } else {
        const seen = new Set<string>(existingVal.map((x) => JSON.stringify(x)));
        const additions = v.filter((x) => !seen.has(JSON.stringify(x)));
        (merged as Record<string, unknown>)[k] = [...existingVal, ...additions];
      }
      continue;
    }
    // Object fields: shallow merge
    if (typeof v === "object" && existingVal && typeof existingVal === "object") {
      (merged as Record<string, unknown>)[k] = { ...existingVal, ...v };
      continue;
    }
    // Primitives: only overwrite if existing is empty
    if (!existingVal) {
      (merged as Record<string, unknown>)[k] = v;
    }
  }
  return merged;
}
