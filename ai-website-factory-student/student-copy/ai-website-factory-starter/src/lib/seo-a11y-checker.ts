/**
 * Accessibility + image-optimization checker — Phase 5.
 *
 * Deterministic rule-based scan. No LLM calls — these checks are
 * objective enough that an agent would just slow us down and burn
 * tokens. The agent re-enters the loop only for the "what should the
 * fix be" question, which Phase 5 punts on: findings only.
 *
 * Detection is HTML-only (no headless browser). Rules:
 *   - heading-order: h3/h4 used before any h2; multiple h1s
 *   - missing-lang: <html> has no lang attribute
 *   - missing-noopener: target="_blank" without rel="noopener"
 *   - input-missing-label: form <input> with no aria-label and no
 *                          associated <label for=…>
 *   - img-missing-dimensions: <img> without width or height (causes CLS)
 *   - img-missing-lazy: <img> below the first 1024px without loading="lazy"
 *                       (we can't measure pixels server-side, so we use
 *                       "any img after the 5th" as a proxy)
 *   - link-no-text: <a> with no visible text and no aria-label
 *
 * Findings are written to seo_findings (severity ranges info→high).
 * The auto-fix tier ships in a follow-up — for now everything is "for
 * your review".
 */

export interface A11yFinding {
  code: string;
  severity: "info" | "low" | "medium" | "high";
  summary: string;
  detail?: Record<string, unknown>;
}

interface ScanInput {
  html: string;
  url: string;
}

export function scanHtmlForA11y(input: ScanInput): A11yFinding[] {
  const out: A11yFinding[] = [];
  const html = input.html;

  // ── 1. <html lang="..."> ─────────────────────────────────────────
  const htmlTag = html.match(/<html\b[^>]*>/i);
  if (htmlTag && !/\blang\s*=\s*["']/.test(htmlTag[0])) {
    out.push({
      code: "missing-lang",
      severity: "medium",
      summary: "<html> has no lang attribute — screen readers can't choose pronunciation",
    });
  }

  // ── 2. Heading order ─────────────────────────────────────────────
  const headings = Array.from(html.matchAll(/<h([1-6])\b/gi)).map((m) => Number(m[1]));
  let h1Count = 0;
  let sawH2 = false;
  let orderViolation = false;
  for (const lvl of headings) {
    if (lvl === 1) h1Count += 1;
    if (lvl === 2) sawH2 = true;
    if ((lvl === 3 || lvl === 4) && !sawH2) orderViolation = true;
  }
  if (h1Count === 0) {
    out.push({ code: "h1-missing", severity: "high", summary: "Page has no <h1>" });
  } else if (h1Count > 1) {
    out.push({ code: "h1-multiple", severity: "medium", summary: `Page has ${h1Count} <h1> tags — there should be exactly one`, detail: { count: h1Count } });
  }
  if (orderViolation) {
    out.push({ code: "heading-order", severity: "low", summary: "h3/h4 used before any h2 — heading hierarchy is out of order" });
  }

  // ── 3. target="_blank" without rel="noopener" ────────────────────
  const blankLinks = Array.from(html.matchAll(/<a\s+[^>]*target\s*=\s*["']_blank["'][^>]*>/gi));
  let unsafeBlanks = 0;
  for (const m of blankLinks) {
    if (!/\brel\s*=\s*["'][^"']*noopener/i.test(m[0])) unsafeBlanks += 1;
  }
  if (unsafeBlanks > 0) {
    out.push({
      code: "missing-noopener",
      severity: "low",
      summary: `${unsafeBlanks} link${unsafeBlanks === 1 ? "" : "s"} with target="_blank" missing rel="noopener" — minor security/perf issue`,
      detail: { count: unsafeBlanks },
    });
  }

  // ── 4. <input> with no label ─────────────────────────────────────
  const inputs = Array.from(html.matchAll(/<input\b[^>]*>/gi));
  let unlabeled = 0;
  for (const m of inputs) {
    const tag = m[0];
    const type = (tag.match(/type\s*=\s*["']([^"']+)["']/i)?.[1] ?? "text").toLowerCase();
    if (type === "hidden" || type === "submit" || type === "button" || type === "image") continue;
    if (/aria-label\s*=\s*["']/i.test(tag)) continue;
    if (/aria-labelledby\s*=\s*["']/i.test(tag)) continue;
    const id = tag.match(/\bid\s*=\s*["']([^"']+)["']/i)?.[1];
    if (id && new RegExp(`<label\\s+[^>]*for\\s*=\\s*["']${escapeRegex(id)}["']`, "i").test(html)) continue;
    unlabeled += 1;
  }
  if (unlabeled > 0) {
    out.push({
      code: "input-missing-label",
      severity: "high",
      summary: `${unlabeled} <input> field${unlabeled === 1 ? "" : "s"} have no label — screen-reader users can't tell what to enter`,
      detail: { count: unlabeled },
    });
  }

  // ── 5. <a> with no accessible text ───────────────────────────────
  const anchors = Array.from(html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi));
  let emptyLinks = 0;
  for (const m of anchors) {
    const tag = m[0];
    const inner = m[1] ?? "";
    const text = inner.replace(/<[^>]+>/g, "").trim();
    if (text.length > 0) continue;
    if (/aria-label\s*=\s*["']/i.test(tag)) continue;
    // Allow links that wrap an image with alt text.
    if (/<img\s+[^>]*alt\s*=\s*["'][^"']{2,}/i.test(inner)) continue;
    emptyLinks += 1;
  }
  if (emptyLinks > 0) {
    out.push({
      code: "link-no-text",
      severity: "medium",
      summary: `${emptyLinks} link${emptyLinks === 1 ? "" : "s"} have no accessible text or aria-label`,
      detail: { count: emptyLinks },
    });
  }

  // ── 6. <img> missing width/height ────────────────────────────────
  const imgs = Array.from(html.matchAll(/<img\b[^>]*>/gi));
  let noDimensions = 0;
  let noLazy = 0;
  imgs.forEach((m, idx) => {
    const tag = m[0];
    const hasWidth = /\bwidth\s*=\s*["']?\d/i.test(tag);
    const hasHeight = /\bheight\s*=\s*["']?\d/i.test(tag);
    if (!hasWidth || !hasHeight) noDimensions += 1;
    if (idx > 4 && !/\bloading\s*=\s*["']lazy/i.test(tag)) noLazy += 1;
  });
  if (noDimensions > 0) {
    out.push({
      code: "img-missing-dimensions",
      severity: "medium",
      summary: `${noDimensions} <img>${noDimensions === 1 ? "" : "s"} missing width or height — causes layout shift (CLS)`,
      detail: { count: noDimensions },
    });
  }
  if (noLazy > 0) {
    out.push({
      code: "img-missing-lazy",
      severity: "low",
      summary: `${noLazy} below-fold image${noLazy === 1 ? "" : "s"} not using loading="lazy"`,
      detail: { count: noLazy },
    });
  }

  return out;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
