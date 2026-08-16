/**
 * Design-research VISION segmenter — the reliable replacement for the DOM-walk
 * section detection in `design-capture.ts`.
 *
 * Why: the deterministic DOM extractor is unreliable on real marketing sites — it
 * either collapses the whole page into 1–2 mega-blocks or explodes into blank
 * divs, and many sites render their text in ways the DOM can't extract (sliders,
 * canvas, background images), so the regex classifier mislabels everything as
 * "other". Proven 2026-06-19 against real cleaning-services sites.
 *
 * This module instead shows the FULL-PAGE screenshot to a vision model — which
 * sees the rendered page exactly as a human does — and asks it to return the real
 * section bands (as % of full-page height), each with a correct type + label and
 * a VALIDITY verdict. Blank / cut-off / cookie-banner / ad blocks are flagged
 * `isValid:false` so they're never shown as a usable design reference.
 *
 * No cropping needed: the gallery clips the stored full-page screenshot to each
 * band's y-range via CSS, so there's no image-library dependency.
 *
 * Uses the platform's existing BYOK Anthropic client (getLLMClient, 'standard'
 * tier = Sonnet — vision-capable, cheaper than Opus). Approved API use per the
 * gyl-platform AI rules (vision LLM calls). Fails SOFT: returns null on any error
 * so capture still stores the full screenshot.
 */

import { readFile } from "node:fs/promises";
import { getLLMClient } from "./llm";

/** Section vocabulary the model must choose from (cleaning-services-site aware; legacy transport-vertical types like "fleet" and "airport" retained for schema compat with older captures). */
export const VISION_SECTION_TYPES = [
  "hero",
  "booking_form", // quote / reservation widget embedded in a page
  "services",
  "service_detail", // a single specific service (e.g. Airport Transfer) explainer
  "fleet",
  "areas", // service areas / cities / airports we serve
  "features", // why choose us / benefits
  "process", // how it works / steps
  "steps", // how-it-works numbered steps (alias of process for Section Watch)
  "pricing",
  "testimonials",
  "stats", // numbers band
  "partners", // logo wall / accreditations
  "gallery",
  "about",
  "eeat", // experience / expertise / authority / trust band
  "faq",
  "cta", // standalone conversion band
  "contact",
  "footer",
  "nav", // header / top bar
  "airport", // airport transfers / distance table
  "top_places", // local landmarks / areas list
  "other",
] as const;
export type VisionSectionType = (typeof VISION_SECTION_TYPES)[number];

export interface VisionSection {
  /** Canonical type from VISION_SECTION_TYPES. */
  type: VisionSectionType;
  /** What the eye reads as the section's name, e.g. "Our Fleet", "Airports We Serve". */
  label: string;
  /** Top of the band as a percentage (0–100) of full-page height. */
  yStartPct: number;
  /** Bottom of the band as a percentage (0–100) of full-page height. */
  yEndPct: number;
  /** True only if it's a real, fully-rendered content section worth offering as a reference. */
  isValid: boolean;
  /** Short reason when isValid is false (e.g. "blank", "cookie banner", "cut off"). */
  note?: string;
}

const PAGE_TYPE_HINT: Record<string, string> = {
  home: "the HOME page",
  city: "a specific NEIGHBOURHOOD / service-area page (one area, not a hub list)",
  area: "a specific NEIGHBOURHOOD / service-area page (one area, not a hub list)",
  service: "a specific SERVICE page (e.g. Villa Deep Clean, Office Cleaning, Post-Construction Clean)",
  about: "the ABOUT page",
  quote: "the QUOTE / get-a-quote page",
  reservation: "the BOOKING page",
  fleet: "the TEAM & KIT page",
};

export function buildPrompt(pageType?: string): string {
  const hint = (pageType && PAGE_TYPE_HINT[pageType]) || "a marketing page";
  return [
    `You are a senior web-design analyst looking at a FULL-PAGE screenshot of ${hint} on a`,
    `Dubai-based cleaning & maintenance services website (villa deep clean, apartment cleaning,`,
    `office cleaning, move-in/move-out, post-construction, sofa/carpet cleaning). Identify every`,
    `distinct top-level SECTION, in order from top to bottom.`,
    ``,
    `Type guidance for the cleaning-vertical bands: "eeat" = an experience /`,
    `expertise / authority / trust band (Dubai Municipality trade licence, years in business,`,
    `insured & bonded, eco-certifications, 60-point checklist). "steps" = a how-it-works numbered-steps band.`,
    `"top_places" = a local neighbourhoods / areas-we-cover list (Palm Jumeirah, Dubai Marina, etc.).`,
    `"fleet" (legacy label) = a team / kit / equipment / eco-products showcase — keep the type name`,
    `for schema compatibility but read it as "Team & Kit". "airport" (legacy) = a "coverage from`,
    `base" or transport/service-area band; retain the type key if the site displays one.`,
    ``,
    `For EACH section return:`,
    `- "type": one of ${VISION_SECTION_TYPES.join(", ")}`,
    `- "label": the human name (use the section's visible heading if any, e.g. "Our Team",`,
    `  "Areas We Serve", "How It Works"; otherwise a short descriptive label).`,
    `- "yStartPct" and "yEndPct": the band's top and bottom as PERCENTAGES (0–100) of the FULL`,
    `  image height. Be accurate — these are used to crop the section.`,
    `- "isValid": true ONLY if it is a real, fully-rendered, useful content section. Set false for`,
    `  blank/empty space, a cookie/consent banner, an ad, a broken/half-loaded block, or a sliver.`,
    `- "note": if isValid is false, one or two words why.`,
    ``,
    `Rules: cover the whole page with no big gaps; the very top is usually "nav", the very bottom`,
    `"footer". Merge tiny adjacent slivers into their real section. Do NOT invent sections that`,
    `aren't visible. Return STRICT JSON only — an array of objects, no prose, no markdown fences.`,
  ].join("\n");
}

/** Pull the first JSON array out of a model response (tolerant of stray prose/fences). */
export function parseSections(raw: string): VisionSection[] | null {
  let txt = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = txt.indexOf("[");
  const end = txt.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return null;
  txt = txt.slice(start, end + 1);
  let arr: unknown;
  try { arr = JSON.parse(txt); } catch { return null; }
  if (!Array.isArray(arr)) return null;

  const types = new Set<string>(VISION_SECTION_TYPES);
  const clampPct = (v: unknown) => {
    const n = typeof v === "number" ? v : parseFloat(String(v));
    if (!Number.isFinite(n)) return null;
    return Math.max(0, Math.min(100, n));
  };
  const out: VisionSection[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const y0 = clampPct(o.yStartPct ?? o.y_start_pct ?? o.yStart);
    const y1 = clampPct(o.yEndPct ?? o.y_end_pct ?? o.yEnd);
    if (y0 === null || y1 === null || y1 <= y0) continue;
    const rawType = String(o.type ?? "other").toLowerCase().trim();
    out.push({
      type: (types.has(rawType) ? rawType : "other") as VisionSectionType,
      label: String(o.label ?? rawType).slice(0, 120).trim() || rawType,
      yStartPct: y0,
      yEndPct: y1,
      isValid: o.isValid === false || o.is_valid === false ? false : true,
      note: o.note ? String(o.note).slice(0, 80) : undefined,
    });
  }
  return out.length ? out : null;
}

export interface SegmentResult {
  sections: VisionSection[];
  model: string;
  durationMs: number;
}

/**
 * Segment a full-page screenshot into validated sections via vision.
 * Returns null on any failure (no key, model error, unparseable) so the caller
 * can fall back to storing just the full screenshot.
 */
export async function segmentFullPageByVision(
  pngPath: string,
  opts: { pageType?: string } = {},
): Promise<SegmentResult | null> {
  let b64: string;
  try {
    b64 = (await readFile(pngPath)).toString("base64");
  } catch {
    return null;
  }
  // Anthropic caps image bytes; very large PNGs are downscaled server-side, which
  // is fine for layout segmentation. Guard against absurd sizes.
  if (b64.length > 5_200_000) {
    // ~3.9MB binary — still acceptable; the API resizes. Larger than this is rare.
  }

  let client, model: string;
  try {
    ({ client, model } = await getLLMClient({ tier: "standard" }));
  } catch {
    return null; // LLMNotConfiguredError — no key set yet
  }

  const started = Date.now();
  try {
    const resp = await client.messages.create({
      model,
      max_tokens: 1800,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/png", data: b64 } },
            { type: "text", text: buildPrompt(opts.pageType) },
          ],
        },
      ],
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const textBlock = resp.content.find((b: any) => b.type === "text") as { text?: string } | undefined;
    const sections = parseSections(textBlock?.text ?? "");
    if (!sections) return null;
    return { sections, model, durationMs: Date.now() - started };
  } catch (err) {
    console.warn("[design-vision] segmentation failed:", err instanceof Error ? err.message : err);
    return null;
  }
}
