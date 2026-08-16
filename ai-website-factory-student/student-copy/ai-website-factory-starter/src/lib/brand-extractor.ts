import Anthropic from "@anthropic-ai/sdk";
import { getLLMClient } from "./llm";

/**
 * Brand extractor — sniffs a customer site's homepage to infer a
 * usable SiteTheme without a headless browser.
 *
 * The strategy is deliberately conservative:
 *   1. Read `<meta name="theme-color">` if present — this is what the
 *      site author already told the OS / browser about the brand.
 *   2. Sniff inline `<style>` blocks for CSS custom properties named
 *      like `--brand`, `--accent`, `--primary` (Tailwind / design-system
 *      conventions).
 *   3. Look at the first hero-region <button> / link with class
 *      hints (`btn-primary`, `cta`, `button`, `primary`) and grab any
 *      `style="background-color:..."` it has inline.
 *   4. Sniff inline `<style>` for the explicit body-bg + body-color
 *      declarations.
 *   5. Pick a font family from the first `<h1>` / `<body>` rule, falling
 *      back to whatever Google Fonts the page imports.
 *   6. If everything fails, return safe neutral defaults that won't clash
 *      with anything: white surface, navy text, single brand-accent
 *      colour to be chosen by the admin.
 *
 * Output is a SiteTheme + an `extractionMeta` blob explaining what came
 * from where, for the admin review screen.
 */
import { crawlPage } from "./seo-crawler";

export interface ExtractedTheme {
  primary: string;
  primary_text: string;
  surface: string;
  surface_text: string;
  accent: string;
  border: string;
  font_family_body: string;
  font_family_heading: string;
  border_radius_px: number;
  mode: "light" | "dark" | "auto";
  source: "agent_extracted" | "agent_vision" | "fallback_default";
  extraction_meta: {
    notes: string[];
    found_theme_color?: string;
    found_brand_vars?: Record<string, string>;
    found_body_bg?: string;
    found_body_color?: string;
    found_button_bg?: string;
    found_fonts?: { heading?: string; body?: string };
    sources_used: string[];
    vision_used?: boolean;
    vision_image_url?: string;
    vision_model?: string;
    vision_tokens?: number;
  };
}

const SAFE_DEFAULT: Omit<ExtractedTheme, "extraction_meta"> = {
  primary: "#0B1E3F",
  primary_text: "#FFFFFF",
  surface: "#FFFFFF",
  surface_text: "#0B1E3F",
  accent: "#C9A961",
  border: "rgba(11,30,63,0.12)",
  font_family_body: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  font_family_heading: "Georgia, 'Times New Roman', serif",
  border_radius_px: 8,
  mode: "light",
  source: "fallback_default",
};

/**
 * Public entry — runs deterministic extraction first, then falls back
 * to a vision-LLM pass when the deterministic confidence is too low.
 *
 * Callers don't have to think about the two-stage logic; they just get
 * the best theme we can produce for the domain.
 */
export async function extractTheme(siteDomain: string): Promise<ExtractedTheme> {
  const html = await extractThemeDeterministic(siteDomain);
  if (html.source === "agent_extracted") return html;
  // Deterministic returned fallback_default — try the vision pass on the
  // homepage's og:image, since most marketing sites have one and it's
  // usually the brand-defining hero shot.
  try {
    const visionResult = await extractThemeViaVision(siteDomain, html);
    if (visionResult) return visionResult;
  } catch (err) {
    html.extraction_meta.notes.push(
      `Vision fallback failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  return html;
}

async function extractThemeDeterministic(siteDomain: string): Promise<ExtractedTheme> {
  const base = siteDomain.startsWith("http") ? siteDomain : `https://${siteDomain}`;
  const home = await crawlPage(base + "/");
  if (!home) {
    return {
      ...SAFE_DEFAULT,
      extraction_meta: { notes: ["Could not crawl homepage; using defaults."], sources_used: [] },
    };
  }
  const html = home.rawHtml;
  const meta: ExtractedTheme["extraction_meta"] = { notes: [], sources_used: [] };

  // 1. <meta name="theme-color">
  const themeColor = matchAttr(html, /<meta\s+[^>]*name=["']theme-color["'][^>]*>/i, "content");
  if (themeColor) {
    meta.found_theme_color = themeColor;
    meta.sources_used.push("meta-theme-color");
  }

  // 2. Brand-named CSS custom properties from inline <style> blocks.
  const brandVars: Record<string, string> = {};
  const styleBlocks = Array.from(html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)).map((m) => m[1]);
  const cssText = styleBlocks.join("\n");
  for (const m of cssText.matchAll(
    /--([a-z][\w-]*(?:brand|primary|accent|highlight|cta|theme)[\w-]*)\s*:\s*([^;}\n]+)/gi,
  )) {
    const k = m[1].toLowerCase().trim();
    const v = m[2].trim();
    if (!brandVars[k]) brandVars[k] = v;
  }
  if (Object.keys(brandVars).length > 0) {
    meta.found_brand_vars = brandVars;
    meta.sources_used.push("css-custom-properties");
  }

  // 3. First hero-region button with an inline background-color.
  const buttonBg = findFirstButtonColor(html);
  if (buttonBg) {
    meta.found_button_bg = buttonBg;
    meta.sources_used.push("hero-button-inline");
  }

  // 4. Body bg + colour from inline <style>.
  const bodyMatch = cssText.match(/(?:^|[\s,{}])body\s*\{([^}]*)\}/i);
  if (bodyMatch) {
    const bg = matchCssDecl(bodyMatch[1], "background-color") ?? matchCssDecl(bodyMatch[1], "background");
    const color = matchCssDecl(bodyMatch[1], "color");
    if (bg) { meta.found_body_bg = bg; meta.sources_used.push("body-css"); }
    if (color) { meta.found_body_color = color; }
  }

  // 5. Fonts — try <h1>/<h2> rules first, fall back to Google Fonts import.
  const headingMatch = cssText.match(/(?:^|[\s,{}])h1\s*\{([^}]*)\}/i);
  const headingFont = headingMatch ? matchCssDecl(headingMatch[1], "font-family") : null;
  const bodyFontRule = bodyMatch ? matchCssDecl(bodyMatch[1], "font-family") : null;
  const googleFontsMatch = html.match(/fonts\.googleapis\.com\/css2?\?family=([^"'&]+)/);
  let importedFont: string | null = null;
  if (googleFontsMatch) {
    importedFont = decodeURIComponent(googleFontsMatch[1]).split(":")[0].replace(/\+/g, " ");
  }
  meta.found_fonts = {
    heading: headingFont ?? importedFont ?? undefined,
    body: bodyFontRule ?? importedFont ?? undefined,
  };
  if (headingFont || bodyFontRule || importedFont) meta.sources_used.push("font-stack");

  // 6. Decide each slot.
  const candidatePrimary =
    pickColor(themeColor) ??
    pickColor(brandVars["--brand"]) ??
    pickColor(brandVars["--brand-primary"]) ??
    pickColor(brandVars["--primary"]) ??
    pickColor(brandVars["--cta"]) ??
    pickColor(buttonBg) ??
    SAFE_DEFAULT.primary;

  const candidateAccent =
    pickColor(brandVars["--accent"]) ??
    pickColor(brandVars["--brand-accent"]) ??
    pickColor(brandVars["--highlight"]) ??
    candidatePrimary;

  const candidateSurface = pickColor(meta.found_body_bg) ?? SAFE_DEFAULT.surface;
  const candidateSurfaceText = pickColor(meta.found_body_color) ?? readableText(candidateSurface);
  const candidatePrimaryText = readableText(candidatePrimary);
  const candidateBorder = mixWithSurface(candidateSurfaceText, candidateSurface, 0.12);

  const fontHeading = sanitizeFont(meta.found_fonts.heading) ?? SAFE_DEFAULT.font_family_heading;
  const fontBody = sanitizeFont(meta.found_fonts.body) ?? SAFE_DEFAULT.font_family_body;

  const mode: "light" | "dark" = isDarkColor(candidateSurface) ? "dark" : "light";

  // We're only confident enough to claim "agent_extracted" if at least two
  // sources matched. Otherwise leave it as fallback_default so the review
  // UI flags it for human attention.
  const source: ExtractedTheme["source"] = meta.sources_used.length >= 2 ? "agent_extracted" : "fallback_default";

  meta.notes.push(
    source === "agent_extracted"
      ? `Extracted from ${meta.sources_used.length} signal${meta.sources_used.length === 1 ? "" : "s"}.`
      : "Not enough signal — using conservative defaults; admin should review.",
  );

  return {
    primary: candidatePrimary,
    primary_text: candidatePrimaryText,
    surface: candidateSurface,
    surface_text: candidateSurfaceText,
    accent: candidateAccent,
    border: candidateBorder,
    font_family_body: fontBody,
    font_family_heading: fontHeading,
    border_radius_px: SAFE_DEFAULT.border_radius_px,
    mode,
    source,
    extraction_meta: meta,
  };
}

// ─── helpers ───────────────────────────────────────────────────────────

function matchAttr(html: string, tagRe: RegExp, name: string): string | null {
  const m = html.match(tagRe);
  if (!m) return null;
  const attrRe = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  const inner = m[0].match(attrRe);
  return (inner?.[2] ?? inner?.[3] ?? inner?.[4] ?? "").trim() || null;
}

function matchCssDecl(declBlock: string, prop: string): string | null {
  const re = new RegExp(`(?:^|[;\\n])\\s*${prop}\\s*:\\s*([^;\\n]+)`, "i");
  const m = declBlock.match(re);
  return m?.[1]?.trim() ?? null;
}

function findFirstButtonColor(html: string): string | null {
  // Look at the first <button> / role=button / <a class=btn> in the hero
  // region (first 8 KB of body content).
  const bodyMatch = html.match(/<body\b[^>]*>([\s\S]*)<\/body>/i);
  const body = bodyMatch ? bodyMatch[1].slice(0, 8000) : html.slice(0, 8000);
  const candidates = Array.from(body.matchAll(/<(?:button|a)\b[^>]*\bclass=["'][^"']*\b(?:btn|cta|button|primary)\b[^"']*["'][^>]*>/gi));
  for (const m of candidates) {
    const tag = m[0];
    const style = tag.match(/style=("([^"]*)"|'([^']*)')/i);
    const inline = style?.[2] ?? style?.[3];
    if (inline) {
      const bg = inline.match(/background(?:-color)?\s*:\s*([^;]+)/i);
      if (bg) {
        const v = bg[1].trim();
        if (looksLikeColor(v)) return v;
      }
    }
  }
  return null;
}

function looksLikeColor(s: string | undefined | null): s is string {
  if (!s) return false;
  if (/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(s)) return true;
  if (/^rgba?\(\s*\d+\s*,/i.test(s)) return true;
  if (/^hsla?\(/i.test(s)) return true;
  return false;
}

function pickColor(v: string | null | undefined): string | null {
  if (!v) return null;
  const trimmed = v.trim();
  return looksLikeColor(trimmed) ? trimmed : null;
}

function sanitizeFont(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const t = raw.trim();
  if (!t) return null;
  // Always end with a generic fallback so we don't ship `font-family: GarageGrotesk`
  // and watch it fall back to Times on the customer's render.
  if (!/serif|sans-serif|monospace|cursive|system-ui/i.test(t)) {
    return `${t}, system-ui, sans-serif`;
  }
  return t;
}

function isDarkColor(c: string): boolean {
  const rgb = toRgb(c);
  if (!rgb) return false;
  // Standard luma calc.
  const lum = 0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b;
  return lum < 128;
}

function readableText(bg: string): string {
  return isDarkColor(bg) ? "#FFFFFF" : "#0B1E3F";
}

function mixWithSurface(text: string, surface: string, ratio: number): string {
  const t = toRgb(text);
  const s = toRgb(surface);
  if (!t || !s) return "rgba(11,30,63,0.12)";
  const r = Math.round(t.r * ratio + s.r * (1 - ratio));
  const g = Math.round(t.g * ratio + s.g * (1 - ratio));
  const b = Math.round(t.b * ratio + s.b * (1 - ratio));
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Vision-LLM fallback. Reads the customer's og:image (or the first
 * meaningful hero <img> on the homepage) and asks Claude to identify
 * the brand palette + typography mood from that image.
 *
 * No headless browser — we just fetch the image URL the site itself
 * declares as canonical and pass it to the Anthropic API by URL. Most
 * marketing WP sites have og:image; if not, we walk the homepage's
 * largest <img> as a fallback.
 */
async function extractThemeViaVision(
  siteDomain: string,
  deterministic: ExtractedTheme,
): Promise<ExtractedTheme | null> {
  const base = siteDomain.startsWith("http") ? siteDomain : `https://${siteDomain}`;
  const home = await crawlPage(base + "/");
  if (!home) return null;

  // Find an image URL we can pass to the vision model.
  const ogImage = matchAttr(home.rawHtml, /<meta\s+[^>]*property=["']og:image["'][^>]*>/i, "content")
    ?? matchAttr(home.rawHtml, /<meta\s+[^>]*name=["']twitter:image["'][^>]*>/i, "content");
  let imageUrl = ogImage?.trim();
  if (imageUrl && !/^https?:\/\//.test(imageUrl)) {
    imageUrl = new URL(imageUrl, base + "/").toString();
  }
  if (!imageUrl) {
    // Take the first non-tiny <img> from the rendered hero region.
    const imgs = home.images.filter((i) => i.src && !i.src.startsWith("data:"));
    imageUrl = imgs[0]?.src;
  }
  if (!imageUrl) return null;

  // Fetch + base64-encode (vision input requires base64 for non-public URLs;
  // even when public, base64 is safer because some CDNs block Anthropic's IP
  // range). Cap at 4 MB to stay under Anthropic's per-request limit.
  let mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif" = "image/png";
  let b64: string | null = null;
  try {
    const res = await fetch(imageUrl, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength === 0 || buf.byteLength > 4_000_000) return null;
    const ct = (res.headers.get("content-type") ?? "").toLowerCase();
    if (ct.includes("jpeg") || ct.includes("jpg")) mediaType = "image/jpeg";
    else if (ct.includes("webp")) mediaType = "image/webp";
    else if (ct.includes("gif")) mediaType = "image/gif";
    else mediaType = "image/png";
    b64 = buf.toString("base64");
  } catch {
    return null;
  }
  if (!b64) return null;

  // Run the vision prompt. Opus 4.7 — vision needs the better model.
  const { client } = await getLLMClient();
  const useModel = "claude-opus-4-7";
  const userPrompt = [
    `You're looking at the brand hero image for the customer site ${siteDomain}.`,
    ``,
    `Output a JSON object describing the brand. The booking widget will be styled with these values to feel native on this site:`,
    `{`,
    `  "primary":      "#hex",   // primary CTA / button background — the most prominent brand colour`,
    `  "primary_text": "#hex",   // readable on top of primary (typically white or near-black)`,
    `  "surface":      "#hex",   // form card background — usually white or a brand off-white`,
    `  "surface_text": "#hex",   // body text on the card (high contrast against surface)`,
    `  "accent":       "#hex",   // secondary accent — links, focus rings, small highlights`,
    `  "border":       "#hex or rgba",   // subtle dividers — usually a 10–20% mix of text on surface`,
    `  "mood":         "luxe|playful|corporate|warm|tech|wellness"`,
    `}`,
    ``,
    `Rules:`,
    `- Use real hex codes you see in the image, not generic words.`,
    `- All six colour slots must be present.`,
    `- "primary_text" must have >= 4.5:1 contrast against "primary".`,
    `- "surface_text" must have >= 4.5:1 contrast against "surface".`,
    `- If unsure, prefer a conservative navy/charcoal text on a white/cream surface.`,
    ``,
    `Output JSON only, no prose.`,
  ].join("\n");

  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model: useModel,
      max_tokens: 600,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: b64 } },
            { type: "text", text: userPrompt },
          ],
        },
      ],
    });
  } catch {
    return null;
  }

  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  const raw = textBlock?.text?.trim() ?? "";
  const parsed = safeParseJson(raw);
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;

  const primary = pickColor(typeof obj.primary === "string" ? obj.primary : null);
  const primaryText = pickColor(typeof obj.primary_text === "string" ? obj.primary_text : null);
  const surface = pickColor(typeof obj.surface === "string" ? obj.surface : null);
  const surfaceText = pickColor(typeof obj.surface_text === "string" ? obj.surface_text : null);
  const accent = pickColor(typeof obj.accent === "string" ? obj.accent : null);
  const border = pickColor(typeof obj.border === "string" ? obj.border : null);

  if (!primary || !surface) return null; // need at least these two

  const result: ExtractedTheme = {
    ...deterministic,
    primary,
    primary_text: primaryText ?? readableText(primary),
    surface,
    surface_text: surfaceText ?? readableText(surface),
    accent: accent ?? primary,
    border: border ?? mixWithSurface(surfaceText ?? readableText(surface), surface, 0.12),
    mode: isDarkColor(surface) ? "dark" : "light",
    source: "agent_vision",
    extraction_meta: {
      ...deterministic.extraction_meta,
      vision_used: true,
      vision_image_url: imageUrl,
      vision_model: useModel,
      vision_tokens: response.usage.input_tokens + response.usage.output_tokens,
      notes: [
        ...deterministic.extraction_meta.notes,
        `Vision-LLM identified palette from ${imageUrl}.`,
      ],
      sources_used: [...deterministic.extraction_meta.sources_used, "vision-llm"],
    },
  };
  return result;
}

function safeParseJson(raw: string): unknown {
  if (!raw) return null;
  const stripped = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  try {
    return JSON.parse(stripped);
  } catch {
    const m = stripped.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try { return JSON.parse(m[0]); } catch { return null; }
  }
}

function toRgb(c: string): { r: number; g: number; b: number } | null {
  const t = c.trim();
  if (t.startsWith("#")) {
    const h = t.replace("#", "");
    if (h.length === 3) {
      return { r: parseInt(h[0] + h[0], 16), g: parseInt(h[1] + h[1], 16), b: parseInt(h[2] + h[2], 16) };
    }
    if (h.length === 6 || h.length === 8) {
      return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
    }
    return null;
  }
  const m = t.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i);
  if (m) return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };
  return null;
}
