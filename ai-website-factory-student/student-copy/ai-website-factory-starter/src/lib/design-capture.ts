/**
 * Design-research section capture — the NON-LLM half of the "Research for new
 * design" feature.
 *
 * For every `design_reference_sites` row in a run, this opens the page in
 * headless Chromium (Playwright), captures a full-page screenshot, then walks
 * the DOM for top-level layout blocks (`section`, `header`, `footer`, and large
 * `main > div` blocks), screenshots each one, guesses a section type from its
 * headings / class names, and writes a `design_reference_sections` row with the
 * shot + a DOM text summary + the bounding box.
 *
 * Reuses the exact Playwright launch path from `build-screenshot-capture.ts`
 * (system-chromium on Alpine via PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, own
 * download on dev) and the on-disk screenshot storage convention.
 *
 * Bot-walls / timeouts are handled gracefully: a failing site is marked
 * `capture_failed` and the loop continues to the next one. When all sites are
 * processed the run flips to `ready`.
 *
 * NO LLM / NO Anthropic API is touched here — pure Playwright + DOM.
 *
 * Disk layout (under SCREENSHOT_STORAGE_PATH/design-research/):
 *   <runId>/<siteId>/full.png
 *   <runId>/<siteId>/section-<order>.png
 * Served via /api/design-research/screenshot/[...path] (added in Phase 2 UI).
 */

import { mkdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  designReferenceSections,
  designReferenceSites,
  designResearchRuns,
} from "@/db/schema";
import { segmentFullPageByVision } from "@/lib/design-vision";

const STORAGE_BASE = process.env.SCREENSHOT_STORAGE_PATH
  ?? path.join(process.cwd(), ".data", "screenshots");
const SUBDIR = "design-research";

/** Lazy-load Playwright so the module imports even when the package is absent. */
async function loadPlaywright(): Promise<{ chromium: unknown } | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod = (await import("playwright" as any)) as { chromium: unknown };
    return { chromium: mod.chromium };
  } catch (err) {
    console.warn("[design-capture] playwright not installed:", err);
    return null;
  }
}

// ─────────── Storage helpers ───────────

export function siteDir(runId: string, siteId: string): string {
  return path.join(STORAGE_BASE, SUBDIR, runId, siteId);
}

/** Relative path stored in the DB (under SCREENSHOT_STORAGE_PATH/design-research/). */
function relPath(runId: string, siteId: string, file: string): string {
  return `${runId}/${siteId}/${file}`;
}

export function publicUrlForPath(relativePath: string): string {
  return `/api/design-research/screenshot/${relativePath.split("/").map(encodeURIComponent).join("/")}`;
}

// ─────────── Section type guessing ───────────

const SECTION_TYPES = [
  "hero",
  "services",
  "fleet",
  "features", // "why choose us" / benefits / differentiators
  "process", // "how it works" / steps
  "areas", // service areas / coverage / locations
  "faq",
  "stats", // numbers band (years, trips, 5-star count)
  "partners", // logo wall / "as seen in" / accreditations
  "testimonials",
  "cta",
  "about",
  "contact",
  "footer",
  "gallery",
  "pricing",
  "other",
] as const;
export type SectionType = (typeof SECTION_TYPES)[number];

/**
 * Best-effort section type from a block's tag, class names, and heading text.
 * Pure + exported so it can be unit-tested without a browser.
 */
export function guessSectionType(input: {
  tag: string;
  className: string;
  id: string;
  headingText: string;
  order: number;
}): SectionType {
  // Heading text is the strongest signal — weight it first, then class/id.
  const head = input.headingText.toLowerCase();
  const hay = `${input.className} ${input.id} ${input.headingText}`.toLowerCase();
  const tag = input.tag.toLowerCase();
  const b = (re: RegExp) => re.test(head) || re.test(hay);

  if (tag === "footer" || /\bfooter\b/.test(hay)) return "footer";
  if (tag === "header" || /\b(nav|navbar|topbar|masthead)\b/.test(hay)) {
    if (/\b(hero|banner|jumbotron)\b/.test(hay) || input.order === 0) return "hero";
  }
  if (/\b(hero|banner|jumbotron|masthead|intro-?banner)\b/.test(hay)) return "hero";
  if (input.order === 0) return "hero";
  // Named sections, most-specific first.
  if (b(/frequently asked|faqs?\b|common questions/)) return "faq";
  if (b(/how it works|our process|the process|booking process|step.?by.?step|easy steps|getting started/)) return "process";
  if (b(/service areas?|areas we (serve|cover)|coverage|cities we serve|locations we serve|neighbou?rhoods/)) return "areas";
  if (b(/\b(fleet|vehicles?|cars?|sedan|suv|sprinter|limo(usine)?|coach|town car|party bus|our team|meet the team|cleaners?|kit|equipment|eco.?products?|checklist|60.?point)\b/)) return "fleet";
  if (b(/why (choose|book|us|go with|trust)|the .{0,20}difference|what (sets|makes) us|our advantage|benefits|reasons to/)) return "features";
  if (b(/\b(service|offerings?|what-?we-?do|solutions?)\b/)) return "services";
  if (b(/testimonial|reviews?|rating|what-?(our-)?clients?|quotes?-?from|trustpilot|yelp/)) return "testimonials";
  if (b(/\b(pricing|rates?|plans?|packages?|tariff|fares?)\b/)) return "pricing";
  if (b(/\b(gallery|photos?|portfolio|carousel|slider)\b/)) return "gallery";
  if (b(/\b(about|who-?we-?are|story|mission|since \d{4})\b/)) return "about";
  if (b(/\b(contact-?us|get-?in-?touch|our-?location|opening hours|business hours)\b/)) return "contact";
  if (b(/\b(cta|call-?to-?action|book|reserve|get-?(a-)?quote|sign-?up|get-?started)\b/)) return "cta";
  return "other";
}

// ─────────── In-page section extraction ───────────

/**
 * Runs INSIDE the browser. Returns one descriptor per top-level layout block:
 * every <section>, <header>, <footer>, and any large `main > div` (or
 * body-level `div`) that is at least a third of the viewport tall. Skips
 * invisible / zero-height blocks. Capped to keep capture bounded.
 */
const IN_PAGE_EXTRACTOR = `(() => {
  const minH = Math.max(140, window.innerHeight * 0.20);
  const minW = 240;

  function vis(el) {
    const s = window.getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden') return false;
    return el.getBoundingClientRect().width >= minW;
  }
  function blocks(el) {
    return Array.from(el.children).filter((c) => c.nodeType === 1 && vis(c));
  }

  // 1) UNWRAP: many sites (page builders, SPA shells) wrap the whole page in one
  //    or more full-height <div>s (e.g. body > div#root > div.app > [sections]).
  //    Descend through any single dominant-height child so we land on the element
  //    whose OWN children are the real top-level sections — otherwise we'd capture
  //    the whole page as one giant "section".
  let host = document.querySelector('main') || document.body;
  for (let i = 0; i < 8; i++) {
    const kids = blocks(host);
    if (kids.length === 0) break;
    const hostH = host.getBoundingClientRect().height || 1;
    const dominant = kids.filter((k) => k.getBoundingClientRect().height >= hostH * 0.75);
    // Single child, or one child that holds ~all the height with only a stray sibling.
    if (kids.length === 1 || (dominant.length === 1 && kids.length <= 2)) {
      host = dominant[0] || kids[0];
    } else {
      break;
    }
  }

  // 2) Section candidates = the host's direct block children that are tall enough.
  let cands = blocks(host).filter((el) => el.getBoundingClientRect().height >= minH);

  // 3) If we still found only a handful of coarse wrapper blocks, descend into them
  //    (up to 3 passes) — some single-page sites nest hero/services/fleet two levels
  //    deep inside wrapper divs. Expand any block holding 2-8 tall children; the
  //    upper bound avoids exploding a card grid into many tiny tiles.
  for (let pass = 0; pass < 3 && cands.length <= 4; pass++) {
    const expanded = [];
    let changed = false;
    for (const c of cands) {
      const sub = blocks(c).filter((el) => el.getBoundingClientRect().height >= minH);
      if (sub.length >= 2 && sub.length <= 8) {
        expanded.push.apply(expanded, sub);
        changed = true;
      } else {
        expanded.push(c);
      }
    }
    if (!changed) break;
    cands = expanded;
  }

  // 4) Make sure the footer + any semantic <section>/<header> landmarks are present.
  ['header', 'footer'].forEach((sel) => {
    const el = document.querySelector(sel);
    if (el && vis(el) && cands.indexOf(el) === -1) cands.push(el);
  });
  document.querySelectorAll('section').forEach((el) => {
    if (vis(el) && el.getBoundingClientRect().height >= minH && cands.indexOf(el) === -1) cands.push(el);
  });

  // 5) Dedup + drop page-wrappers and empty spacer blocks.
  //    A single real section is never taller than ~55% of the whole page — a
  //    block that big is a layout wrapper (it would screenshot as "the whole
  //    page", the #1 garbage card). And a block with no heading, no media and
  //    almost no text is a spacer/wrapper, not a section.
  const docH = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight, 1);
  const maxSecH = docH * 0.55;
  function hasContent(el) {
    if (el.querySelector('h1,h2,h3,h4')) return true;
    if (el.querySelectorAll('img,svg,video,picture,form').length) return true;
    const wc = (el.innerText || '').trim().split(/\\s+/).filter(Boolean).length;
    return wc >= 8;
  }
  const kept = [];
  // Consider larger blocks first so an inner duplicate is dropped, not the parent.
  cands.sort((a, b) => b.getBoundingClientRect().height - a.getBoundingClientRect().height);
  for (const el of cands) {
    const hgt = el.getBoundingClientRect().height;
    if (hgt < minH) continue;                            // too small
    if (!hasContent(el)) continue;                       // blank spacer / wrapper div
    // Drop a COARSE wrapper that swallows 2+ other real candidates — keep its
    // children instead (otherwise the whole page becomes one "section" card).
    // A merely-tall standalone block (e.g. a full-height hero) is NOT a wrapper
    // and is kept — the capture step caps its screenshot height.
    const swallows = cands.filter((o) => o !== el && el.contains(o) && o.getBoundingClientRect().height >= minH).length;
    if (hgt > maxSecH && swallows >= 2) continue;
    if (kept.some((k) => k !== el && k.contains(el))) continue;
    kept.push(el);
  }
  // Order top-to-bottom and cap.
  kept.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
  const chosen = kept.slice(0, 16);

  // Classify section TYPE. The section's OWN HEADING is the most reliable signal
  // (an H2 almost always names the section: "Our Fleet", "How It Works",
  // "Service Areas", "Frequently Asked Questions", "Why Choose Us"), so we test
  // the heading FIRST and only fall back to body text + class-name guessing.
  // Ordered most-specific → least so a section that mentions several topics still
  // lands on its primary one. Returns one of the allowed SectionTypes.
  function classify(el, i, n) {
    const tag = (el.tagName || '').toLowerCase();
    if (tag === 'footer') return 'footer';
    if (i === 0) return 'hero';

    const hEl = el.querySelector('h1, h2, h3');
    const head = (hEl ? (hEl.innerText || '') : '').toLowerCase();
    const txt = (el.innerText || '').toLowerCase();
    const meta = ((typeof el.className === 'string' ? el.className : '') + ' ' + (el.id || '')).toLowerCase();
    const hay = txt + ' ' + meta;
    const imgs = el.querySelectorAll('img').length;
    const inputs = el.querySelectorAll('input, select, textarea').length;
    const links = el.querySelectorAll('a').length;
    const prices = (txt.match(/\\$\\s?\\d|per hour|\\/\\s?hr\\b|hourly rate|per day|flat rate/g) || []).length;
    const bigNums = (txt.match(/\\b\\d[\\d,]*\\+|\\b\\d+\\s?(years|yrs|trips|rides|clients|cars|vehicles|cities)\\b|24\\/7/g) || []).length;
    const wordCount = txt.split(/\\s+/).filter(Boolean).length;

    // h() = match the heading only; b() = match heading OR body/meta.
    const h = (re) => re.test(head);
    const b = (re) => re.test(head) || re.test(hay);

    // 1) Strongly-named sections (heading-first).
    if (b(/frequently asked|faqs?\\b|common questions|questions answered|q&a/)) return 'faq';
    if (b(/how it works|how (we|it) work|our process|the process|booking process|easy steps|step.by.step|getting started|3 steps|how to book/)) return 'process';
    if (b(/service areas?|areas we (serve|cover)|where we (serve|operate)|coverage area|cities we serve|neighbou?rhoods we|locations we serve|proudly serving/)) return 'areas';
    if (b(/our fleet|the fleet|our vehicles|browse (the |our )?fleet|fleet (gallery|options)|our team|meet the team|our cleaners?|the cleaners?|team gallery|kit|eco.?products?|checklist/) || (imgs >= 3 && b(/\\bfleet\\b|sedan|suv|sprinter|stretch limo|town car|motorcoach|party bus|cleaners?|team|kit/))) return 'fleet';
    if (b(/our services|services we (offer|provide)|what we offer|services offered|service menu/) || (el.querySelectorAll('h3, h4').length >= 3 && b(/airport (transfer|limo)|wedding|corporate|prom|wine tour|night out|point.to.point|hourly (charter|service)|villa (deep )?clean|apartment cleaning|move.in|move.out|post.construction|sofa cleaning|carpet cleaning|office cleaning|maid service|deep clean/))) return 'services';
    if (b(/why (choose|book|us|go with|trust)|the .{0,20}difference|what (sets|makes) us|our advantage|why we|benefits of|reasons to (choose|book)|what you get/)) return 'features';
    if (b(/testimonial|what (our )?clients say|customer (reviews|stories)|client reviews|\\b5.star|google reviews?|trustpilot|yelp|rated \\d|hear from/)) return 'testimonials';
    if (prices >= 2 || b(/\\bpricing\\b|\\brates\\b|\\bpackages\\b|hourly rate|our prices|fare estimate|price list/)) return 'pricing';
    if (b(/about (us|our company)?|our story|who we are|the leader in|since \\d{4}|years of (experience|service)|family.owned|established (in )?\\d{4}|for over (a )?decade/)) return 'about';
    if (imgs >= 4 && b(/gallery|photo gallery|our work|portfolio|in pictures/)) return 'gallery';
    if (b(/contact (us)?|get in touch|reach (out|us)|our location|email us|find us|opening hours|business hours|call us today/)) return 'contact';

    // 2) Layout-shape sections (no obvious naming).
    //    Stats band: short, number-dense ("500+ rides · 12 years · 24/7").
    if (bigNums >= 2 && wordCount < 60) return 'stats';
    //    Logo / partner wall: many images, almost no prose, few headings.
    if (imgs >= 4 && wordCount < 30) return 'partners';
    //    Conversion band: a real form, or an explicit booking/quote CTA.
    if (inputs >= 2 || b(/book now|reserve now|get a (free )?quote|request a quote|instant quote|booking form|book your (ride|trip|limo|clean|cleaner)|get started today|whatsapp us/)) return 'cta';

    // 3) Last resorts.
    if (i === n - 1 && tag !== 'section') return 'footer';
    return 'other';
  }

  const out = [];
  chosen.forEach((el, i) => {
    // Tag the real element so the capture step screenshots IT (scrolled into view,
    // lazy images loaded) instead of a stale coordinate clip.
    try { el.setAttribute('data-gyl-sec', String(i)); } catch (e) {}
    const rect = el.getBoundingClientRect();
    const heading = el.querySelector('h1, h2, h3');
    const text = (el.innerText || '').replace(/\\s+/g, ' ').trim();
    out.push({
      idx: i,
      type: classify(el, i, chosen.length),
      tag: el.tagName.toLowerCase(),
      className: typeof el.className === 'string' ? el.className.slice(0, 200) : '',
      id: el.id || '',
      headingText: heading ? (heading.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 120) : '',
      domSummary: text.slice(0, 400),
      box: {
        x: Math.round(rect.x + window.scrollX),
        y: Math.round(rect.y + window.scrollY),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
    });
  });
  return out;
})()`;

interface RawBlock {
  idx: number;
  type: SectionType;
  tag: string;
  className: string;
  id: string;
  headingText: string;
  domSummary: string;
  box: { x: number; y: number; width: number; height: number };
}

// ─────────── Capture driver ───────────

export interface CaptureRunResult {
  total: number;
  captured: number;
  failed: number;
  skipped: number;
  sections: number;
  results: Array<{
    siteId: string;
    url: string;
    status: "captured" | "capture_failed" | "skipped";
    sectionCount: number;
    error?: string;
  }>;
}

/**
 * Capture full-page + per-section screenshots for every site in a run.
 * Flips each site row to 'captured' | 'capture_failed', inserts
 * `design_reference_sections` rows, and finally flips the run to 'ready'.
 */
export async function captureRunSections(
  runId: string,
  opts: { force?: boolean; timeoutMs?: number; viewportWidth?: number; viewportHeight?: number } = {},
): Promise<CaptureRunResult> {
  const empty: CaptureRunResult = { total: 0, captured: 0, failed: 0, skipped: 0, sections: 0, results: [] };

  const sites = await db()
    .select()
    .from(designReferenceSites)
    .where(eq(designReferenceSites.runId, runId));
  if (sites.length === 0) {
    // Nothing to capture — still flip the run forward so it doesn't hang.
    await db().update(designResearchRuns).set({ status: "ready" }).where(eq(designResearchRuns.id, runId));
    return empty;
  }

  const pw = await loadPlaywright();
  if (!pw) {
    // Can't capture — mark every site failed but don't wedge the run.
    for (const s of sites) {
      await db()
        .update(designReferenceSites)
        .set({ status: "capture_failed" })
        .where(eq(designReferenceSites.id, s.id));
    }
    await db().update(designResearchRuns).set({ status: "ready", summary: "Capture skipped — Playwright not installed." }).where(eq(designResearchRuns.id, runId));
    return { ...empty, total: sites.length, failed: sites.length };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chromium = pw.chromium as any;
  const execPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  const browser = await chromium.launch({
    headless: true,
    ...(execPath ? { executablePath: execPath } : {}),
    args: execPath ? ["--no-sandbox", "--disable-dev-shm-usage"] : undefined,
  });

  const out: CaptureRunResult = { ...empty, total: sites.length, results: [] };

  try {
    for (const site of sites) {
      // Idempotency: skip already-captured sites unless force.
      if (!opts.force && site.status === "captured" && site.fullScreenshotPath) {
        out.skipped += 1;
        out.results.push({ siteId: site.id, url: site.url, status: "skipped", sectionCount: 0 });
        continue;
      }

      await db().update(designReferenceSites).set({ status: "capturing" }).where(eq(designReferenceSites.id, site.id));

      const dir = siteDir(runId, site.id);
      const context = await browser.newContext({
        viewport: { width: opts.viewportWidth ?? 1440, height: opts.viewportHeight ?? 900 },
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        deviceScaleFactor: 1,
      });
      const page = await context.newPage();
      try {
        // `domcontentloaded` (not `networkidle`) — production marketing sites keep
        // long-lived connections open (chat widgets, analytics, video) so networkidle
        // frequently never fires and times out. DCL is reliable; we then settle.
        await page.goto(site.url, { waitUntil: "domcontentloaded", timeout: opts.timeoutMs ?? 45_000 });
        // Best-effort wait for the network to quiet down, but never let it fail the capture.
        await page.waitForLoadState("networkidle", { timeout: 6_000 }).catch(() => {});
        await page.waitForTimeout(1200); // let hero animations + font swaps settle

        // Scroll the whole page once to trigger lazy-loaded images/sections, so both
        // the full shot AND the per-section element shots capture real content.
        await page
          .evaluate(async () => {
            await new Promise<void>((resolve) => {
              let y = 0;
              const step = Math.max(400, window.innerHeight * 0.9);
              const timer = setInterval(() => {
                window.scrollTo(0, y);
                y += step;
                if (y >= document.body.scrollHeight) {
                  clearInterval(timer);
                  window.scrollTo(0, 0);
                  resolve();
                }
              }, 60);
            });
          })
          .catch(() => {});
        await page.waitForTimeout(600);

        mkdirSync(dir, { recursive: true });

        // Full-page shot.
        const fullPath = path.join(dir, "full.png");
        await page.screenshot({ path: fullPath, fullPage: true, timeout: 60_000, animations: "disabled" });
        const fullRel = relPath(runId, site.id, "full.png");

        // Detect + shoot sections. Replace any prior sections for this site (idempotent on force/re-run).
        await db().delete(designReferenceSections).where(eq(designReferenceSections.siteId, site.id));

        let sectionCount = 0;

        // PRIMARY: deterministic DOM extraction + PER-ELEMENT screenshots.
        // Each section row gets its OWN tightly-cropped PNG of the real element
        // (Playwright `locator.screenshot()` on the tagged node, scrolled into
        // view with lazy images loaded). The gallery then shows that image WHOLE
        // — so every card is EXACTLY one section: no drifting band, no blank
        // gap, no neighbouring section bleeding in. This is the reliable path;
        // an LLM eyeballing y-percentages on a full-page shot is not.
        const blocks = ((await page.evaluate(IN_PAGE_EXTRACTOR)) as RawBlock[] | undefined) ?? [];
        for (let i = 0; i < blocks.length; i++) {
          const b = blocks[i];
          const file = `section-${i}.png`;
          const shotPath = path.join(dir, file);
          let shotRel: string | null = null;
          // Cap any abnormally-tall block (full-height hero, parallax band) to its
          // top portion so the card shows the SECTION, not a whole-page strip.
          const capPx = Math.round((opts.viewportHeight ?? 900) * 1.5);
          try {
            const loc = page.locator(`[data-gyl-sec="${b.idx}"]`).first();
            await loc.scrollIntoViewIfNeeded({ timeout: 5_000 }).catch(() => {});
            if (b.box && b.box.height > capPx) {
              // Temporarily clamp the element's rendered height, shoot, then restore.
              await loc.evaluate((el: HTMLElement, h: number) => {
                el.dataset.gylPrevMaxH = el.style.maxHeight || "";
                el.dataset.gylPrevOv = el.style.overflow || "";
                el.style.maxHeight = h + "px";
                el.style.overflow = "hidden";
              }, capPx).catch(() => {});
              await loc.screenshot({ path: shotPath, timeout: 15_000, animations: "disabled" });
              await loc.evaluate((el: HTMLElement) => {
                el.style.maxHeight = el.dataset.gylPrevMaxH || "";
                el.style.overflow = el.dataset.gylPrevOv || "";
              }).catch(() => {});
            } else {
              await loc.screenshot({ path: shotPath, timeout: 15_000, animations: "disabled" });
            }
            shotRel = relPath(runId, site.id, file);
          } catch {
            // Detached/zero-size element — keep the section row sans shot.
            shotRel = null;
          }

          // Prefer the content-based type computed in-page; fall back to the heuristic.
          const sectionType: SectionType =
            b.type ??
            guessSectionType({
              tag: b.tag,
              className: b.className,
              id: b.id,
              headingText: b.headingText,
              order: i,
            });

          await db().insert(designReferenceSections).values({
            siteId: site.id,
            sectionType,
            label: b.headingText || sectionType,
            order: i,
            screenshotPath: shotRel,        // a tight crop of THIS section — shown whole
            domSummary: b.domSummary || null,
            boundingBox: b.box,
            source: "dom",
            isValid: shotRel != null,       // a section with no shot is dropped by the gallery
          });
          sectionCount += 1;
        }

        // FALLBACK: only if the DOM walk found NOTHING (heavily-canvased / SPA shell),
        // fall back to vision band segmentation against the full screenshot.
        if (sectionCount === 0) {
          const vision = await segmentFullPageByVision(fullPath, { pageType: "home" });
          if (vision && vision.sections.length) {
            for (let i = 0; i < vision.sections.length; i++) {
              const v = vision.sections[i];
              await db().insert(designReferenceSections).values({
                siteId: site.id,
                sectionType: v.type,
                label: v.label || v.type,
                order: i,
                screenshotPath: fullRel,        // gallery CSS-clips the full shot to [yStartPct, yEndPct]
                domSummary: null,
                boundingBox: null,
                source: "vision",
                yStartPct: v.yStartPct,
                yEndPct: v.yEndPct,
                isValid: v.isValid,
                validationNote: v.note ?? null,
              });
              sectionCount += 1;
            }
          }
        }

        await db()
          .update(designReferenceSites)
          .set({ status: "captured", fullScreenshotPath: fullRel })
          .where(eq(designReferenceSites.id, site.id));

        out.captured += 1;
        out.sections += sectionCount;
        out.results.push({ siteId: site.id, url: site.url, status: "captured", sectionCount });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await db()
          .update(designReferenceSites)
          .set({ status: "capture_failed" })
          .where(eq(designReferenceSites.id, site.id));
        out.failed += 1;
        out.results.push({ siteId: site.id, url: site.url, status: "capture_failed", sectionCount: 0, error: msg.slice(0, 300) });
      } finally {
        await page.close().catch(() => {});
        await context.close().catch(() => {});
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }

  // Flip the run to ready regardless of per-site failures (partial success is fine).
  const summary = `${out.captured}/${out.total} site(s) captured · ${out.sections} section(s) · ${out.failed} failed.`;
  await db().update(designResearchRuns).set({ status: "ready", summary }).where(eq(designResearchRuns.id, runId));

  return out;
}

/**
 * Ad-hoc single-URL full-page capture — returns PNG bytes for ONE live URL,
 * without touching the design-research run model. Used by Section Watch (the
 * worker POSTs a page URL, gets the screenshot back, then runs $0 vision on
 * it). Reuses the same Playwright launch + scroll-to-settle approach as
 * captureRunSections. Returns null if Playwright is unavailable.
 */
export async function captureUrlFullPagePng(
  url: string,
  opts: { viewportWidth?: number; viewportHeight?: number; timeoutMs?: number } = {},
): Promise<Buffer | null> {
  const pw = await loadPlaywright();
  if (!pw) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chromium = pw.chromium as any;
  const execPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  const browser = await chromium.launch({
    headless: true,
    ...(execPath ? { executablePath: execPath } : {}),
    args: execPath ? ["--no-sandbox", "--disable-dev-shm-usage"] : undefined,
  });
  try {
    const context = await browser.newContext({
      viewport: { width: opts.viewportWidth ?? 1440, height: opts.viewportHeight ?? 900 },
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: opts.timeoutMs ?? 45_000 });
    await page.waitForLoadState("networkidle", { timeout: 6_000 }).catch(() => {});
    await page.waitForTimeout(1200);
    await page
      .evaluate(async () => {
        await new Promise<void>((resolve) => {
          let y = 0;
          const step = Math.max(400, window.innerHeight * 0.9);
          const timer = setInterval(() => {
            window.scrollTo(0, y);
            y += step;
            if (y >= document.body.scrollHeight) {
              clearInterval(timer);
              window.scrollTo(0, 0);
              resolve();
            }
          }, 60);
        });
      })
      .catch(() => {});
    await page.waitForTimeout(600);
    const buf = (await page.screenshot({ fullPage: true, timeout: 60_000, animations: "disabled" })) as Buffer;
    return buf;
  } finally {
    await browser.close().catch(() => {});
  }
}

/** Resolve a screenshot's bytes from a stored relative path (Phase 2 serving route). */
export function screenshotAbsolutePath(relativePath: string): string {
  // Guard against traversal — only allow forward path under the subdir.
  const cleaned = relativePath.replace(/\\/g, "/");
  if (cleaned.split("/").some((seg) => seg === "..")) {
    throw new Error("Refusing path containing '..'");
  }
  const abs = path.join(STORAGE_BASE, SUBDIR, cleaned);
  if (existsSync(abs)) statSync(abs); // touch to surface ENOENT consistently
  return abs;
}
