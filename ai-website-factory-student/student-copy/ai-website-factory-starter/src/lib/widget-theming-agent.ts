/**
 * Booking-widget theming agent.
 *
 * Wraps the existing brand-extractor + site-themes table + /seo-apply
 * plugin push so the chat agent can drive the entire per-site widget
 * theming workflow:
 *
 *   1. Audit the current widget vs the host site (vision-LLM diff + score)
 *   2. Extract a base theme + propose 3 variants with preview screenshots
 *   3. Apply the chosen variant to the live site via signed plugin push
 *   4. Optionally override per-page via the PDO blob
 *
 * The variant generator is deterministic — given the extracted base theme
 * it derives an "exact match", "premium serif", and "dark luxury" variant.
 * Each variant gets its own preview rendered via /api/preview/widget-theme
 * + captured to disk via Playwright, so the chat can render the three side
 * by side as inline Markdown images.
 */

import type Anthropic from "@anthropic-ai/sdk";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { sites, siteThemes } from "@/db/schema";
import type { ExtractedTheme } from "./brand-extractor";
import { captureUrlAtViewports, previewStoragePath } from "./url-preview-capture";
import { callPlugin, WpPluginError } from "./wp-plugin-client";

// ────────── Variant generation ──────────

export type VariantLabel = "exact" | "premium" | "dark_luxury";

export interface ThemeVariant {
  label: VariantLabel;
  display_name: string;
  rationale: string;
  theme: ExtractedTheme;
}

/** When a site exposes no real accent color (e.g. primary == accent), we
 * fall back to industry-appropriate champagne so the call-to-action remains
 * visible. The extractor itself returns whatever it found — variant
 * generation is where we re-add visual contrast.
 */
const LUXURY_ACCENT_FALLBACKS = {
  champagne: "#C9A961",
  gold: "#D4AF37",
  cream: "#F5E6CC",
} as const;

/** True if two hex/rgb strings represent the same color (case-insensitive, ignores whitespace). */
function sameColor(a: string, b: string): boolean {
  return a.replace(/\s/g, "").toLowerCase() === b.replace(/\s/g, "").toLowerCase();
}

/** Generate 3 deterministic variants from a base extracted theme. */
export function proposeThemeVariants(base: ExtractedTheme): ThemeVariant[] {
  // Detect "no real accent" — common when the extractor reads brand vars
  // that happen to share the primary value (e.g. site has only one brand
  // color defined). Substitute a champagne so the CTA stays visible.
  const accentCollides = sameColor(base.primary, base.accent);
  const repairedAccent = accentCollides ? LUXURY_ACCENT_FALLBACKS.champagne : base.accent;

  const exact: ThemeVariant = {
    label: "exact",
    display_name: "Exact match",
    rationale: accentCollides
      ? `Uses the extracted palette but adds a champagne ${LUXURY_ACCENT_FALLBACKS.champagne} accent for the CTA — the site only exposed one brand color, so the widget needs contrast for the submit button.`
      : "Uses the extracted palette + fonts verbatim. Safest if the host site already has a clear identity — the widget reads as part of the page rather than a foreign component.",
    theme: { ...base, accent: repairedAccent, border_radius_px: base.border_radius_px },
  };

  // Premium serif: extracted palette but heading font swapped for a premium
  // serif. Adds 4-px softening to radius. Good when the host site uses sans
  // headings but the brand wants to feel more editorial / hotel-grade
  // (think Kinfolk / Vogue Arabia rather than a Groupon banner).
  const premiumHeading =
    base.font_family_heading.toLowerCase().includes("serif") ||
    base.font_family_heading.toLowerCase().includes("garamond") ||
    base.font_family_heading.toLowerCase().includes("playfair")
      ? base.font_family_heading
      : "'Cormorant Garamond', 'Playfair Display', Georgia, serif";
  const premium: ThemeVariant = {
    label: "premium",
    display_name: "Premium serif",
    rationale: accentCollides
      ? `Repairs the missing accent (champagne ${LUXURY_ACCENT_FALLBACKS.champagne}) + swaps the heading font to an editorial hotel-grade serif. Radius softened by 4px.`
      : "Same colors as the host site, but heading font replaced with an editorial hotel-grade serif (Cormorant Garamond / Playfair Display). Radius softened by 4px. Use when the site palette is good but the typography feels generic.",
    theme: {
      ...base,
      accent: repairedAccent,
      font_family_heading: premiumHeading,
      border_radius_px: Math.max(0, base.border_radius_px) + 4,
    },
  };

  // Dark luxury: inverts the palette. Surface goes dark (using primary),
  // and the CTA becomes a luxury gold accent. Skip inversion if the base
  // is already dark.
  // When the source had no real accent (collision), we ALWAYS use the
  // luxury gold fallback so the dark variant has a real visible CTA.
  const darkAccent = accentCollides ? LUXURY_ACCENT_FALLBACKS.gold : base.accent;
  const darkPalette =
    base.mode === "dark"
      ? { ...base, primary: darkAccent }
      : {
          ...base,
          mode: "dark" as const,
          surface: base.primary,
          surface_text: base.primary_text,
          primary: darkAccent,
          primary_text: base.surface,
          accent: darkAccent,
          border: "rgba(255,255,255,0.14)",
        };
  const darkLuxury: ThemeVariant = {
    label: "dark_luxury",
    display_name: "Dark luxury",
    rationale: `Inverts the palette — surface goes dark (${darkPalette.surface}), the CTA becomes ${darkAccent} for visible contrast, radius drops to 0 for a sharp luxury look. Use when the host site is light/airy but the operator wants the widget to feel like a high-end concierge desk.`,
    theme: {
      ...darkPalette,
      border_radius_px: 0,
    },
  };

  return [exact, premium, darkLuxury];
}

// ────────── Preview rendering ──────────

/** Pure HTML for the widget mockup, with theme injected as CSS vars. */
export function renderWidgetPreviewHtml(theme: ExtractedTheme): string {
  // Inline the same CSS-variable contract the plugin uses, plus a stripped
  // version of the booking-form markup that mirrors what the WP shortcode
  // emits. Self-contained — no external font imports unless we know the
  // font name is on Google Fonts.
  const fontLinks: string[] = [];
  const wantsGoogleFont = (f: string): string | null => {
    const m = f.match(/['"]?([A-Z][A-Za-z\s]+?)['"]?(?:,|$)/);
    if (!m) return null;
    const fam = m[1].trim();
    if (
      ["system-ui", "Apple System", "BlinkMacSystemFont", "-apple-system", "Helvetica Neue", "Helvetica", "Arial", "Georgia", "Times New Roman"].includes(fam)
    ) return null;
    return fam;
  };
  const heading = wantsGoogleFont(theme.font_family_heading);
  const body = wantsGoogleFont(theme.font_family_body);
  for (const fam of [heading, body].filter(Boolean) as string[]) {
    fontLinks.push(
      `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(fam).replace(/%20/g, "+")}:wght@400;500;600;700&display=swap" crossorigin>`,
    );
  }

  // Note: the colors come straight from the theme — no escaping needed
  // because they're either hex or rgba/var refs from our own pipeline.
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Widget preview</title>
${fontLinks.join("\n")}
<style>
:root {
  --gyl-accent: ${theme.accent};
  --gyl-accent-contrast: ${theme.primary_text};
  --gyl-bg: ${theme.surface};
  --gyl-bg-soft: ${theme.surface};
  --gyl-text: ${theme.surface_text};
  --gyl-muted: ${theme.surface_text}b3;
  --gyl-border: ${theme.border};
  --gyl-border-strong: ${theme.surface_text};
  --gyl-radius: ${theme.border_radius_px}px;
  --gyl-font-body: ${theme.font_family_body};
  --gyl-font-heading: ${theme.font_family_heading};
}
html, body {
  margin: 0; padding: 0;
  background: ${theme.surface};
  font-family: var(--gyl-font-body);
}
.preview-frame {
  padding: 40px;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24px;
}
.preview-title {
  font-family: var(--gyl-font-heading);
  color: ${theme.surface_text};
  font-size: 28px;
  font-weight: 700;
  margin: 0 0 4px 0;
  letter-spacing: -0.01em;
}
.preview-subtitle {
  color: var(--gyl-muted);
  font-size: 14px;
  margin: 0;
}
.gyl-bookings-quick {
  background: var(--gyl-bg);
  color: var(--gyl-text);
  border: 1px solid var(--gyl-border);
  border-radius: var(--gyl-radius);
  padding: 24px;
  width: 100%;
  max-width: 720px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.08);
  font-family: var(--gyl-font-body);
}
.gyl-bookings-fieldset { border: none; padding: 0; margin: 0 0 18px 0; }
.gyl-bookings-legend {
  font-family: var(--gyl-font-heading);
  font-weight: 600;
  margin-bottom: 8px;
  display: block;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--gyl-muted);
}
.gyl-bookings-trip-type {
  display: flex; gap: 8px; flex-wrap: wrap;
}
.gyl-bookings-pill {
  display: inline-flex;
  align-items: center;
  padding: 8px 16px;
  border: 1px solid var(--gyl-border);
  border-radius: 999px;
  font-size: 13px;
  cursor: pointer;
  background: var(--gyl-bg);
  color: var(--gyl-text);
}
.gyl-bookings-pill[data-active="true"] {
  background: var(--gyl-accent);
  color: var(--gyl-accent-contrast);
  border-color: var(--gyl-accent);
  font-weight: 600;
}
.gyl-bookings-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; }
.gyl-bookings-field { display: flex; flex-direction: column; gap: 6px; }
.gyl-bookings-label { font-size: 12px; font-weight: 600; color: var(--gyl-muted); }
.gyl-bookings-input {
  padding: 10px 12px;
  border: 1px solid var(--gyl-border);
  border-radius: calc(var(--gyl-radius) - 2px);
  background: var(--gyl-bg);
  color: var(--gyl-text);
  font-size: 14px;
  font-family: inherit;
}
.gyl-bookings-submit {
  width: 100%;
  margin-top: 8px;
  padding: 14px 18px;
  background: var(--gyl-accent);
  color: var(--gyl-accent-contrast);
  border: none;
  border-radius: var(--gyl-radius);
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  font-family: var(--gyl-font-body);
  letter-spacing: 0.02em;
}
</style>
</head>
<body>
<div class="preview-frame">
  <div style="text-align:center">
    <h1 class="preview-title">Get a quote</h1>
    <p class="preview-subtitle">24/7 booking · flat rates · meet & greet included</p>
  </div>
  <div class="gyl-bookings-quick">
    <fieldset class="gyl-bookings-fieldset">
      <span class="gyl-bookings-legend">Service</span>
      <div class="gyl-bookings-trip-type">
        <span class="gyl-bookings-pill" data-active="true">Deep clean</span>
        <span class="gyl-bookings-pill">Standard clean</span>
        <span class="gyl-bookings-pill">Move-in / out</span>
        <span class="gyl-bookings-pill">Post-construction</span>
      </div>
    </fieldset>
    <div class="gyl-bookings-row">
      <div class="gyl-bookings-field">
        <span class="gyl-bookings-label">Property</span>
        <input class="gyl-bookings-input" value="3-bedroom villa">
      </div>
      <div class="gyl-bookings-field">
        <span class="gyl-bookings-label">Area</span>
        <input class="gyl-bookings-input" value="Palm Jumeirah">
      </div>
    </div>
    <div class="gyl-bookings-row">
      <div class="gyl-bookings-field">
        <span class="gyl-bookings-label">Date &amp; time</span>
        <input class="gyl-bookings-input" value="Sat, Jun 14 · 7:30 PM">
      </div>
      <div class="gyl-bookings-field">
        <span class="gyl-bookings-label">Passengers</span>
        <input class="gyl-bookings-input" value="3">
      </div>
    </div>
    <button class="gyl-bookings-submit" type="button">Get my quote →</button>
  </div>
</div>
</body>
</html>`;
}

/** Deterministic hash of the theme for the preview URL / storage path. */
export function themeHash(theme: ExtractedTheme): string {
  const stable = JSON.stringify({
    p: theme.primary,
    pt: theme.primary_text,
    s: theme.surface,
    st: theme.surface_text,
    a: theme.accent,
    b: theme.border,
    fb: theme.font_family_body,
    fh: theme.font_family_heading,
    r: theme.border_radius_px,
    m: theme.mode,
  });
  return createHash("sha1").update(stable).digest("hex").slice(0, 16);
}

/**
 * Generate the preview URL (served by our own platform — /api/preview/widget-theme)
 * and capture a screenshot via the existing url-preview-capture flow.
 *
 * Returns the public screenshot URL the chat agent can render inline.
 */
export async function captureVariantPreview(
  variant: ThemeVariant,
  opts: { force?: boolean } = {},
): Promise<{ preview_url: string; screenshot_url: string | null; bytes: number | null; error: string | null }> {
  const baseUrl = process.env.PUBLIC_BASE_URL?.replace(/\/$/, "") ?? "http://localhost:3001";
  const encoded = encodeURIComponent(JSON.stringify(variant.theme));
  const previewUrl = `${baseUrl}/api/preview/widget-theme?t=${encoded}`;

  const { results } = await captureUrlAtViewports(previewUrl, ["desktop"], { force: opts.force });
  const r = results[0];
  return {
    preview_url: previewUrl,
    screenshot_url: r.publicUrl,
    bytes: r.bytes,
    error: r.error,
  };
}

// ────────── Brand-match audit (vision LLM) ──────────

export interface BrandMatchAudit {
  match_score: number; // 0-100
  verdict: "match" | "close" | "off" | "mismatch";
  what_widget_looks_like: string;
  what_site_looks_like: string;
  recommendation: string;
  site_screenshot_url: string | null;
  error?: string;
}

const AUDIT_SYSTEM = `
You compare a "host site" screenshot to a "booking widget" screenshot and judge
whether the widget reads as the SAME BRAND as the site, or as a foreign component
glued onto it.

Score 0-100:
  - 90-100: identical brand language — palette, fonts, radius, mood all align
  - 70-89:  close match — minor mismatch but cohesive
  - 40-69:  off — recognizably the same company but tonal mismatch
  - 0-39:   mismatch — looks like a different product entirely

Output STRICTLY valid JSON ONLY:
{
  "match_score": <0..100>,
  "verdict": "match" | "close" | "off" | "mismatch",
  "what_widget_looks_like": "<1 sentence — palette, fonts, mood>",
  "what_site_looks_like": "<1 sentence — palette, fonts, mood>",
  "recommendation": "<1-2 sentences — what to change in the widget theme>"
}
`.trim();

export async function auditWidgetBrandMatch(
  client: Anthropic,
  model: string,
  opts: { siteDomain: string },
): Promise<BrandMatchAudit> {
  const baseUrl = opts.siteDomain.startsWith("http") ? opts.siteDomain : `https://${opts.siteDomain}`;

  // Capture the live site
  const { results } = await captureUrlAtViewports(baseUrl, ["desktop"], { force: false });
  const siteShot = results[0];
  if (!siteShot.publicUrl) {
    return {
      match_score: 0,
      verdict: "mismatch",
      what_widget_looks_like: "",
      what_site_looks_like: "",
      recommendation: "Could not capture the live site for comparison.",
      site_screenshot_url: null,
      error: siteShot.error ?? "site capture failed",
    };
  }

  // For the widget side, capture the booking widget rendered with the CURRENT theme
  // for the site (or fallback if none).
  const [siteRow] = await db().select().from(sites).where(eq(sites.domain, opts.siteDomain.replace(/^https?:\/\//, "").replace(/\/$/, ""))).limit(1);
  let currentTheme: ExtractedTheme | null = null;
  if (siteRow) {
    const [stored] = await db().select().from(siteThemes).where(eq(siteThemes.siteId, siteRow.id)).limit(1);
    if (stored) {
      currentTheme = {
        primary: stored.primaryColor,
        primary_text: stored.primaryText,
        surface: stored.surface,
        surface_text: stored.surfaceText,
        accent: stored.accent,
        border: stored.border,
        font_family_body: stored.fontFamilyBody,
        font_family_heading: stored.fontFamilyHeading,
        border_radius_px: stored.borderRadiusPx,
        mode: (stored.mode as "light" | "dark" | "auto") ?? "light",
        source: (stored.source as ExtractedTheme["source"]) ?? "fallback_default",
        extraction_meta: { notes: [], sources_used: [] },
      };
    }
  }
  if (!currentTheme) {
    // Use the same fallback the brand-extractor uses
    currentTheme = {
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
      extraction_meta: { notes: ["No stored theme — using platform default"], sources_used: [] },
    };
  }

  // Render the widget preview using current theme + capture
  const widgetPreview = await captureVariantPreview(
    {
      label: "exact",
      display_name: "current",
      rationale: "",
      theme: currentTheme,
    },
    { force: false },
  );
  if (!widgetPreview.screenshot_url) {
    return {
      match_score: 0,
      verdict: "mismatch",
      what_widget_looks_like: "",
      what_site_looks_like: "",
      recommendation: "Could not capture the booking widget preview.",
      site_screenshot_url: siteShot.publicUrl,
      error: widgetPreview.error ?? "widget capture failed",
    };
  }

  // Read the captured PNGs from disk + base64-encode them. The screenshot
  // route is admin-gated, so we can't pass URLs to Anthropic — they'd hit
  // the login redirect. Inline base64 sidesteps the auth problem entirely
  // and keeps customer screenshots off the public internet.
  const siteImg = await readFile(previewStoragePath(baseUrl, "desktop"));
  // For the widget, the preview URL is /api/preview/widget-theme?t=... so the
  // captured screenshot lives under the same hash scheme as any other URL.
  const widgetPreviewUrl = `${process.env.PUBLIC_BASE_URL?.replace(/\/$/, "") ?? "http://localhost:3001"}/api/preview/widget-theme?t=${encodeURIComponent(JSON.stringify(currentTheme))}`;
  const widgetImg = await readFile(previewStoragePath(widgetPreviewUrl, "desktop"));
  const siteB64 = siteImg.toString("base64");
  const widgetB64 = widgetImg.toString("base64");

  let parsed: BrandMatchAudit;
  try {
    const response = await client.messages.create({
      model,
      max_tokens: 1024,
      system: AUDIT_SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: `Host site (${opts.siteDomain}):` },
            {
              type: "image",
              source: { type: "base64", media_type: "image/png", data: siteB64 },
            },
            { type: "text", text: "Booking widget as it would render with the current platform theme for this site:" },
            {
              type: "image",
              source: { type: "base64", media_type: "image/png", data: widgetB64 },
            },
            { type: "text", text: "Compare them. Output the JSON only." },
          ],
        },
      ],
    });
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
    const obj = JSON.parse(cleaned) as Record<string, unknown>;
    parsed = {
      match_score: typeof obj.match_score === "number" ? obj.match_score : 0,
      verdict:
        obj.verdict === "match" || obj.verdict === "close" || obj.verdict === "off" || obj.verdict === "mismatch"
          ? (obj.verdict as BrandMatchAudit["verdict"])
          : "mismatch",
      what_widget_looks_like: typeof obj.what_widget_looks_like === "string" ? obj.what_widget_looks_like : "",
      what_site_looks_like: typeof obj.what_site_looks_like === "string" ? obj.what_site_looks_like : "",
      recommendation: typeof obj.recommendation === "string" ? obj.recommendation : "",
      site_screenshot_url: siteShot.publicUrl,
    };
  } catch (err) {
    return {
      match_score: 0,
      verdict: "mismatch",
      what_widget_looks_like: "",
      what_site_looks_like: "",
      recommendation: "Vision LLM call failed.",
      site_screenshot_url: siteShot.publicUrl,
      error: err instanceof Error ? err.message : String(err),
    };
  }
  return { ...parsed, site_screenshot_url: siteShot.publicUrl };
}

// ────────── Apply theme to plugin ──────────

export async function applyThemeToPlugin(
  siteId: string,
  theme: ExtractedTheme,
): Promise<{ ok: boolean; appliedAt?: Date; error?: string }> {
  try {
    const resp = await callPlugin<{ ok: boolean; error?: string }>(siteId, {
      method: "POST",
      path: "/seo-apply",
      body: {
        kind: "theme_apply",
        theme: {
          primary: theme.primary,
          primary_text: theme.primary_text,
          surface: theme.surface,
          surface_text: theme.surface_text,
          accent: theme.accent,
          border: theme.border,
          font_family_body: theme.font_family_body,
          font_family_heading: theme.font_family_heading,
          border_radius_px: theme.border_radius_px,
          mode: theme.mode,
          source: theme.source,
        },
      },
    });
    if (!resp.ok) return { ok: false, error: resp.error ?? "plugin returned ok:false" };
    return { ok: true, appliedAt: new Date() };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof WpPluginError ? `${err.reason}: ${err.message}` : err instanceof Error ? err.message : String(err),
    };
  }
}

/** Save the theme to site_themes table (upsert) + return the row. */
export async function saveThemeRow(siteId: string, theme: ExtractedTheme) {
  const values = {
    siteId,
    primaryColor: theme.primary,
    primaryText: theme.primary_text,
    surface: theme.surface,
    surfaceText: theme.surface_text,
    accent: theme.accent,
    border: theme.border,
    fontFamilyBody: theme.font_family_body,
    fontFamilyHeading: theme.font_family_heading,
    borderRadiusPx: theme.border_radius_px,
    mode: theme.mode,
    source: theme.source,
    extractionMeta: theme.extraction_meta,
    updatedAt: new Date(),
  };
  await db()
    .insert(siteThemes)
    .values(values)
    .onConflictDoUpdate({ target: siteThemes.siteId, set: values });
}

// ────────── Per-page widget overrides via PDO ──────────

/**
 * Push a page-design blob to the plugin so the booking widget renders with
 * different CSS vars ONLY on the specified page. Reuses the existing PDO
 * infrastructure (selectors scoped under body.page-id-<N>).
 */
export async function setPageScopedWidgetTheme(
  siteId: string,
  pageId: number,
  vars: Record<string, string>,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const resp = await callPlugin<{ ok: boolean; error?: string }>(siteId, {
      method: "POST",
      path: "/seo-apply",
      body: {
        kind: "page_design",
        page_id: pageId,
        blob: {
          // Map theme overrides to the gyl-* CSS variables the widget reads
          vars,
          rules: [],
          custom_css: "",
        },
      },
    });
    return resp.ok ? { ok: true } : { ok: false, error: resp.error ?? "ok:false" };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof WpPluginError ? `${err.reason}: ${err.message}` : err instanceof Error ? err.message : String(err),
    };
  }
}
