/**
 * A2 — Design QA runner.
 *
 * Loads Playwright dynamically. For each (site × viewport × URL), runs the
 * applicable QA checks and persists results to qa_runs + qa_checks.
 *
 * Install deps on the VPS:
 *   npm install --save-dev playwright
 *   npx playwright install chromium
 *
 * Usage:
 *   npm run qa:run                          # nightly full-network run
 *   npm run qa:run -- --site=slug           # single site
 *   npm run qa:run -- --site=slug --page=/  # single page
 *   npm run qa:run -- --run-id=<uuid>       # claim an existing pending run
 */
import { and, eq, sql } from "drizzle-orm";
import { db, ensureSchema } from "../db/client";
import { orgSettings, qaChecks, qaRuns, sitePages, sites } from "../db/schema";
import {
  QA_CHECKS,
  QA_VIEWPORTS,
  checksForIndustry,
  type QaCheckDef,
  type QaResult,
  type QaViewport,
} from "../lib/qa-checks";

const SCREENSHOT_DIR = process.env.SCREENSHOT_STORAGE_PATH ?? "/app/.data/screenshots";

function arg(name: string): string | undefined {
  const flag = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(flag));
  return hit ? hit.slice(flag.length) : undefined;
}

interface PlaywrightModule {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  chromium: any;
}

async function loadPlaywright(): Promise<PlaywrightModule | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod = (await import("playwright" as any)) as PlaywrightModule;
    return mod;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// Check implementations
// ─────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Page = any;

async function check_text_overflow(page: Page): Promise<QaResult> {
  const overflowing = await page.evaluate(() => {
    const offenders: Array<{ tag: string; cls: string; text: string; scrollW: number; clientW: number }> = [];
    document.querySelectorAll("body *").forEach((el) => {
      const e = el as HTMLElement;
      if (e.scrollWidth > e.clientWidth + 1 && e.clientWidth > 0) {
        // Only count if the element actually contains text
        const text = (e.textContent ?? "").trim();
        if (text.length > 0 && text.length < 200) {
          offenders.push({
            tag: e.tagName.toLowerCase(),
            cls: e.className.toString().slice(0, 60),
            text: text.slice(0, 80),
            scrollW: e.scrollWidth,
            clientW: e.clientWidth,
          });
        }
      }
    });
    return offenders.slice(0, 5);
  });
  if (overflowing.length === 0) return { status: "pass" };
  return {
    status: "fail",
    severity: "high",
    message: `${overflowing.length} element(s) overflow horizontally — text running off-screen.`,
    evidence: { offenders: overflowing },
  };
}

async function check_horizontal_scroll(page: Page): Promise<QaResult> {
  const overflow = await page.evaluate(() => {
    const d = document.documentElement;
    return { scrollW: d.scrollWidth, clientW: d.clientWidth };
  });
  if (overflow.scrollW > overflow.clientW + 1) {
    return {
      status: "fail",
      severity: "critical",
      message: `Page scrolls horizontally — body is ${overflow.scrollW}px on a ${overflow.clientW}px viewport.`,
      evidence: overflow,
    };
  }
  return { status: "pass" };
}

async function check_tap_target_size(page: Page): Promise<QaResult> {
  const tooSmall = await page.evaluate(() => {
    const offenders: Array<{ tag: string; text: string; w: number; h: number }> = [];
    document.querySelectorAll("a, button, input[type=button], input[type=submit], [role=button]").forEach((el) => {
      const e = el as HTMLElement;
      const r = e.getBoundingClientRect();
      const v = window.getComputedStyle(e);
      if (v.display === "none" || v.visibility === "hidden") return;
      if (r.width > 0 && r.height > 0 && (r.width < 44 || r.height < 44)) {
        offenders.push({
          tag: e.tagName.toLowerCase(),
          text: (e.textContent ?? "").trim().slice(0, 50),
          w: Math.round(r.width),
          h: Math.round(r.height),
        });
      }
    });
    return offenders.slice(0, 10);
  });
  if (tooSmall.length === 0) return { status: "pass" };
  return {
    status: tooSmall.length > 3 ? "fail" : "warn",
    severity: tooSmall.length > 3 ? "high" : "medium",
    message: `${tooSmall.length} tap target(s) smaller than 44 × 44 px on mobile.`,
    evidence: { offenders: tooSmall },
  };
}

async function check_tap_target_spacing(page: Page): Promise<QaResult> {
  const tooClose = await page.evaluate(() => {
    const els = Array.from(
      document.querySelectorAll("a, button, input[type=button], [role=button]"),
    ) as HTMLElement[];
    const visible = els.filter((e) => {
      const v = window.getComputedStyle(e);
      const r = e.getBoundingClientRect();
      return v.display !== "none" && v.visibility !== "hidden" && r.width > 0 && r.height > 0;
    });
    const collisions: Array<{ a: string; b: string; gap: number }> = [];
    for (let i = 0; i < visible.length; i++) {
      const A = visible[i].getBoundingClientRect();
      for (let j = i + 1; j < visible.length; j++) {
        const B = visible[j].getBoundingClientRect();
        // Adjacent (overlapping or near) horizontally and vertically aligned
        const overlapY = !(A.bottom < B.top || B.bottom < A.top);
        const gapX = Math.max(0, Math.min(Math.abs(A.right - B.left), Math.abs(B.right - A.left)));
        if (overlapY && gapX > 0 && gapX < 8) {
          collisions.push({
            a: (visible[i].textContent ?? "").trim().slice(0, 40),
            b: (visible[j].textContent ?? "").trim().slice(0, 40),
            gap: Math.round(gapX),
          });
        }
      }
    }
    return collisions.slice(0, 5);
  });
  if (tooClose.length === 0) return { status: "pass" };
  return {
    status: "warn",
    severity: "medium",
    message: `${tooClose.length} adjacent tap-target pair(s) less than 8 px apart.`,
    evidence: { collisions: tooClose },
  };
}

async function check_buttons_visible_enabled(page: Page): Promise<QaResult> {
  const problems = await page.evaluate(() => {
    const issues: Array<{ tag: string; text: string; reason: string }> = [];
    document.querySelectorAll("button, input[type=submit], [role=button]").forEach((el) => {
      const e = el as HTMLButtonElement;
      const v = window.getComputedStyle(e);
      if (v.display === "none" || v.visibility === "hidden") return;
      const text = (e.textContent ?? e.value ?? e.getAttribute("aria-label") ?? "").trim();
      if (!text) {
        issues.push({ tag: e.tagName.toLowerCase(), text: "(empty)", reason: "no_label" });
      }
      if (e.disabled && !e.hasAttribute("aria-disabled")) {
        issues.push({ tag: e.tagName.toLowerCase(), text: text.slice(0, 40), reason: "disabled_no_aria" });
      }
    });
    return issues.slice(0, 10);
  });
  if (problems.length === 0) return { status: "pass" };
  return {
    status: "warn",
    severity: "low",
    message: `${problems.length} button(s) without label or with disabled state issues.`,
    evidence: { problems },
  };
}

async function check_broken_images(page: Page): Promise<QaResult> {
  const broken = await page.evaluate(() => {
    const offenders: string[] = [];
    document.querySelectorAll("img").forEach((img) => {
      const i = img as HTMLImageElement;
      if (i.complete && i.naturalWidth === 0 && i.src) {
        offenders.push(i.src);
      }
    });
    return offenders;
  });
  if (broken.length === 0) return { status: "pass" };
  return {
    status: "fail",
    severity: "high",
    message: `${broken.length} broken image(s).`,
    evidence: { broken },
  };
}

async function check_lcp_cls(page: Page): Promise<{ lcp: QaResult; cls: QaResult }> {
  const perf = await page.evaluate(() => {
    return new Promise<{ lcp: number; cls: number }>((resolve) => {
      let cls = 0;
      const obs = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === "layout-shift" && !(entry as unknown as { hadRecentInput?: boolean }).hadRecentInput) {
            cls += (entry as unknown as { value: number }).value;
          }
        }
      });
      obs.observe({ type: "layout-shift", buffered: true });
      const lcpObs = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const last = entries[entries.length - 1];
        if (last) {
          resolve({ lcp: last.startTime, cls });
        }
      });
      lcpObs.observe({ type: "largest-contentful-paint", buffered: true });
      setTimeout(() => resolve({ lcp: -1, cls }), 5000);
    });
  });
  const lcp: QaResult =
    perf.lcp < 0
      ? { status: "skipped", message: "LCP not observable", evidence: perf }
      : perf.lcp <= 2500
        ? { status: "pass", evidence: { ms: Math.round(perf.lcp) } }
        : {
            status: perf.lcp > 4000 ? "fail" : "warn",
            severity: perf.lcp > 4000 ? "high" : "medium",
            message: `LCP is ${Math.round(perf.lcp)}ms (target ≤ 2500ms).`,
            evidence: { ms: Math.round(perf.lcp) },
          };
  const cls: QaResult =
    perf.cls <= 0.1
      ? { status: "pass", evidence: { cls: Number(perf.cls.toFixed(3)) } }
      : {
          status: perf.cls > 0.25 ? "fail" : "warn",
          severity: perf.cls > 0.25 ? "high" : "medium",
          message: `CLS is ${perf.cls.toFixed(3)} (target ≤ 0.1).`,
          evidence: { cls: Number(perf.cls.toFixed(3)) },
        };
  return { lcp, cls };
}

async function check_console_errors(consoleErrors: string[]): Promise<QaResult> {
  if (consoleErrors.length === 0) return { status: "pass" };
  return {
    status: "fail",
    severity: "high",
    message: `${consoleErrors.length} console error(s) during page load.`,
    evidence: { errors: consoleErrors.slice(0, 10) },
  };
}

async function check_limo_phone_tel_link(page: Page): Promise<QaResult> {
  const has = await page.evaluate(() => {
    const tels = Array.from(document.querySelectorAll("a[href^='tel:']")) as HTMLAnchorElement[];
    return tels.map((a) => a.href);
  });
  if (has.length === 0) {
    return {
      status: "fail",
      severity: "critical",
      message: "No tel: link found. Limo customers convert via phone — every page needs a tappable phone.",
      evidence: {},
    };
  }
  return { status: "pass", evidence: { tels: has } };
}

async function check_limo_phone_above_fold(page: Page): Promise<QaResult> {
  const aboveFold = await page.evaluate(() => {
    const tels = Array.from(document.querySelectorAll("a[href^='tel:']")) as HTMLAnchorElement[];
    const vh = window.innerHeight;
    return tels.some((a) => {
      const r = a.getBoundingClientRect();
      return r.top < vh && r.bottom > 0 && r.width > 0;
    });
  });
  if (aboveFold) return { status: "pass" };
  return {
    status: "fail",
    severity: "high",
    message: "Phone number is not visible above the fold on mobile.",
    evidence: {},
  };
}

async function check_limo_cta_above_fold(page: Page): Promise<QaResult> {
  const found = await page.evaluate(() => {
    const ctaWords = ["book now", "get a quote", "reserve", "request a quote", "book online", "make a reservation"];
    const vh = window.innerHeight;
    const els = Array.from(document.querySelectorAll("a, button, input[type=submit]")) as HTMLElement[];
    return els.some((e) => {
      const text = (e.textContent ?? "").trim().toLowerCase();
      if (!text || text.length > 50) return false;
      if (!ctaWords.some((w) => text.includes(w))) return false;
      const r = e.getBoundingClientRect();
      return r.top < vh && r.bottom > 0 && r.width > 0;
    });
  });
  if (found) return { status: "pass" };
  return {
    status: "fail",
    severity: "high",
    message: "No booking CTA ('Book Now' / 'Get a Quote' / 'Reserve') visible above the fold.",
    evidence: {},
  };
}

async function check_limo_trust_signals(page: Page): Promise<QaResult> {
  const text = (await page.textContent("body"))?.toLowerCase() ?? "";
  const signals: string[] = [];
  if (/\b(licensed|insured|tlc|dot|usdot|hpd)\b/.test(text)) signals.push("licensed/insured");
  if (/\b(\d{1,3}\+? (years|year))\b/.test(text)) signals.push("years in business");
  if (/\b(24\s*\/\s*7|24-hour|round[- ]the[- ]clock)\b/.test(text)) signals.push("24/7");
  if (/\b(fleet of \d+|over \d+ vehicles|\d+\+ vehicles)\b/.test(text)) signals.push("fleet size");
  if (/\b(testimonial|review|rated|stars?|google reviews?|yelp)\b/.test(text)) signals.push("testimonials/reviews");
  if (/\b(meet[- ]and[- ]greet|flight tracking|real[- ]time tracking)\b/.test(text)) signals.push("meet-greet/tracking");
  if (signals.length >= 3) return { status: "pass", evidence: { signals } };
  return {
    status: "warn",
    severity: "medium",
    message: `Only ${signals.length} trust signal(s) detected (target ≥ 3).`,
    evidence: { signals },
  };
}

async function check_limo_service_area(page: Page): Promise<QaResult> {
  const text = (await page.textContent("body"))?.toLowerCase() ?? "";
  const cities = [
    "toronto", "vancouver", "montreal", "calgary", "ottawa", "edmonton", "mississauga", "brampton",
    "oakville", "burlington", "hamilton", "markham", "richmond hill", "vaughan", "scarborough",
    "etobicoke", "north york", "downtown", "airport", "yyz", "yvr", "yul",
  ];
  const found = cities.filter((c) => text.includes(c));
  if (found.length === 0) {
    return {
      status: "warn",
      severity: "medium",
      message: "No service-area city or airport mentioned on the page.",
      evidence: {},
    };
  }
  return { status: "pass", evidence: { cities: found.slice(0, 5) } };
}

async function check_limo_fleet_imagery(page: Page): Promise<QaResult> {
  const fleetImgs = await page.evaluate(() => {
    const keywords = /sedan|suv|limo|stretch|sprinter|suburban|escalade|cadillac|mercedes|fleet|vehicle|car|chrysler/i;
    return Array.from(document.querySelectorAll("img"))
      .filter((img) => {
        const i = img as HTMLImageElement;
        return keywords.test(i.alt ?? "") || keywords.test(i.src ?? "");
      })
      .map((img) => (img as HTMLImageElement).alt || (img as HTMLImageElement).src)
      .slice(0, 5);
  });
  if (fleetImgs.length === 0) {
    return {
      status: "warn",
      severity: "low",
      message: "No fleet imagery detected (no <img> alt/filename referencing a vehicle).",
      evidence: {},
    };
  }
  return { status: "pass", evidence: { imgs: fleetImgs } };
}

async function check_cleaning_trust_signals(page: Page): Promise<QaResult> {
  const text = (await page.textContent("body"))?.toLowerCase() ?? "";
  const signals: string[] = [];
  if (/\b(bonded|insured|licensed)\b/.test(text)) signals.push("bonded/insured");
  if (/\b(background[- ]checked|background check)\b/.test(text)) signals.push("background-checked staff");
  if (/\b(\d{1,3}\+? (years|year))\b/.test(text)) signals.push("years in business");
  if (/\b(satisfaction guarantee|100% guarantee|guaranteed clean)\b/.test(text)) signals.push("satisfaction guarantee");
  if (/\b(testimonial|review|rated|stars?|google reviews?|yelp)\b/.test(text)) signals.push("testimonials/reviews");
  if (/\b(eco[- ]friendly|green clean|non[- ]toxic)\b/.test(text)) signals.push("eco-friendly products");
  if (signals.length >= 3) return { status: "pass", evidence: { signals } };
  return {
    status: "warn",
    severity: "medium",
    message: `Only ${signals.length} trust signal(s) detected (target ≥ 3).`,
    evidence: { signals },
  };
}

async function check_cleaning_service_area(page: Page): Promise<QaResult> {
  const text = (await page.textContent("body"))?.toLowerCase() ?? "";
  const hasAreaPhrase = /\b(serving|service area|areas we serve|we (also )?serve)\b/.test(text);
  const hasPostalSignal = /\b\d{5}(-\d{4})?\b/.test(text) || /\b[a-z]\d[a-z]\s?\d[a-z]\d\b/i.test(text);
  if (hasAreaPhrase || hasPostalSignal) return { status: "pass", evidence: { hasAreaPhrase, hasPostalSignal } };
  return {
    status: "warn",
    severity: "medium",
    message: "No service-area phrase or ZIP/postal code mentioned on the page.",
    evidence: {},
  };
}

async function check_cleaning_before_after_imagery(page: Page): Promise<QaResult> {
  const imgs = await page.evaluate(() => {
    const keywords = /before|after|spotless|sparkling|clean(ed|ing)?|team|staff|crew/i;
    return Array.from(document.querySelectorAll("img"))
      .filter((img) => {
        const i = img as HTMLImageElement;
        return keywords.test(i.alt ?? "") || keywords.test(i.src ?? "");
      })
      .map((img) => (img as HTMLImageElement).alt || (img as HTMLImageElement).src)
      .slice(0, 5);
  });
  if (imgs.length === 0) {
    return {
      status: "warn",
      severity: "low",
      message: "No before/after or team imagery detected (no <img> alt/filename referencing the work or the crew).",
      evidence: {},
    };
  }
  return { status: "pass", evidence: { imgs } };
}

async function check_title_length(page: Page): Promise<QaResult> {
  const title = await page.title();
  const len = title.length;
  if (len === 0) {
    return { status: "fail", severity: "critical", message: "Page has no <title>.", evidence: {} };
  }
  if (len < 30 || len > 60) {
    return {
      status: "warn",
      severity: "low",
      message: `<title> is ${len} chars (target 30-60). Current: "${title}"`,
      evidence: { title, length: len },
    };
  }
  return { status: "pass", evidence: { title, length: len } };
}

async function check_meta_description(page: Page): Promise<QaResult> {
  const desc = await page.evaluate(() => {
    const m = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
    return m?.content ?? "";
  });
  if (!desc) {
    return { status: "fail", severity: "medium", message: "No meta description.", evidence: {} };
  }
  if (desc.length < 140 || desc.length > 160) {
    return {
      status: "warn",
      severity: "low",
      message: `Meta description is ${desc.length} chars (target 140-160).`,
      evidence: { description: desc.slice(0, 200), length: desc.length },
    };
  }
  return { status: "pass", evidence: { length: desc.length } };
}

async function check_schema_localbusiness(page: Page): Promise<QaResult> {
  const hasLocal = await page.evaluate(() => {
    const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]')) as HTMLScriptElement[];
    for (const s of scripts) {
      try {
        const parsed = JSON.parse(s.textContent ?? "");
        const items = Array.isArray(parsed) ? parsed : [parsed];
        for (const it of items) {
          if (typeof it === "object" && it !== null) {
            const t = (it as { "@type"?: string | string[] })["@type"];
            const types = Array.isArray(t) ? t : [t];
            if (types.some((x) => typeof x === "string" && /LocalBusiness|Service|TaxiService|LimousineService/i.test(x))) {
              return true;
            }
          }
        }
      } catch {
        // ignore parse errors
      }
    }
    return false;
  });
  if (hasLocal) return { status: "pass" };
  return {
    status: "warn",
    severity: "medium",
    message: "No LocalBusiness / LimousineService JSON-LD schema found.",
    evidence: {},
  };
}

async function check_og_image(page: Page): Promise<QaResult> {
  const og = await page.evaluate(() => {
    const m = document.querySelector('meta[property="og:image"]') as HTMLMetaElement | null;
    return m?.content ?? "";
  });
  if (!og) {
    return { status: "warn", severity: "low", message: "No og:image (social previews will be plain).", evidence: {} };
  }
  return { status: "pass", evidence: { url: og } };
}

async function check_https_only(page: Page, url: string): Promise<QaResult> {
  if (!url.startsWith("https://")) {
    return { status: "fail", severity: "critical", message: "Page is not HTTPS.", evidence: { url } };
  }
  const mixed = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll("img, script, link, iframe")) as Array<
      HTMLImageElement | HTMLScriptElement | HTMLLinkElement | HTMLIFrameElement
    >;
    return els.filter((e) => {
      const u = (e as { src?: string; href?: string }).src ?? (e as { href?: string }).href ?? "";
      return u.startsWith("http://");
    }).length;
  });
  if (mixed > 0) {
    return {
      status: "fail",
      severity: "high",
      message: `${mixed} resource(s) loaded over HTTP on an HTTPS page (mixed content).`,
      evidence: { mixedCount: mixed },
    };
  }
  return { status: "pass" };
}

async function check_alt_text_coverage(page: Page): Promise<QaResult> {
  const coverage = await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll("img")) as HTMLImageElement[];
    if (imgs.length === 0) return { total: 0, withAlt: 0 };
    const withAlt = imgs.filter((i) => (i.alt ?? "").trim().length > 0).length;
    return { total: imgs.length, withAlt };
  });
  if (coverage.total === 0) return { status: "skipped", message: "No images on page" };
  const pct = (coverage.withAlt / coverage.total) * 100;
  if (pct >= 90) return { status: "pass", evidence: { coverage: pct.toFixed(0) + "%" } };
  return {
    status: pct < 70 ? "fail" : "warn",
    severity: pct < 70 ? "high" : "medium",
    message: `Only ${pct.toFixed(0)}% of images have alt text (target ≥ 90%).`,
    evidence: { ...coverage, coverage: pct.toFixed(0) + "%" },
  };
}

async function check_headings_hierarchy(page: Page): Promise<QaResult> {
  const headings = await page.evaluate(() => {
    return Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6"))
      .map((h) => ({ level: parseInt(h.tagName.slice(1)), text: (h.textContent ?? "").trim().slice(0, 80) }));
  });
  const h1Count = headings.filter((h: { level: number; text: string }) => h.level === 1).length;
  if (h1Count === 0) return { status: "fail", severity: "high", message: "No <h1> on page.", evidence: { h1Count } };
  if (h1Count > 1) {
    return { status: "warn", severity: "medium", message: `Multiple <h1> tags (${h1Count}).`, evidence: { h1Count } };
  }
  // Check for skipped levels (h1 → h3 without h2)
  let lastLevel = 0;
  const skips: Array<{ from: number; to: number; text: string }> = [];
  for (const h of headings) {
    if (lastLevel > 0 && h.level > lastLevel + 1) {
      skips.push({ from: lastLevel, to: h.level, text: h.text });
    }
    lastLevel = h.level;
  }
  if (skips.length > 0) {
    return {
      status: "warn",
      severity: "low",
      message: `${skips.length} heading-level skip(s).`,
      evidence: { skips: skips.slice(0, 5) },
    };
  }
  return { status: "pass", evidence: { h1Count, totalHeadings: headings.length } };
}

async function check_booking_form_smoke(page: Page, url: string): Promise<QaResult> {
  // Find a likely booking page if we're on the home page
  const formSelector = "form[id*=book i], form[id*=reservation i], form[id*=quote i], form[class*=book i], form[class*=reservation i], form[class*=quote i], form";
  const formExists = await page.evaluate((sel: string) => !!document.querySelector(sel), formSelector);
  if (!formExists) {
    return { status: "skipped", message: "No booking-style form found on this page.", evidence: { url } };
  }
  try {
    // Attempt to fill obvious fields with safe values
    await page.evaluate(() => {
      const setVal = (selector: string, value: string) => {
        const e = document.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement | null;
        if (e) {
          e.value = value;
          e.dispatchEvent(new Event("input", { bubbles: true }));
          e.dispatchEvent(new Event("change", { bubbles: true }));
        }
      };
      setVal('input[name*=name i], input[id*=name i]', "QA Test Customer");
      setVal('input[type=email], input[name*=email i]', "qa-test@gylplatform.local");
      setVal('input[type=tel], input[name*=phone i]', "+971501234567");
      // Legacy pickup/dropoff selectors — retained so the smoke test still
      // fills the transport-vertical widget when it's embedded on a site.
      setVal('input[name*=pickup i], input[id*=pickup i], input[name*=from i]', "Palm Jumeirah");
      setVal('input[name*=dropoff i], input[id*=dropoff i], input[name*=to i]', "Office 305, Dubai Marina");
      // Cleaning-vertical form fields (property + service).
      setVal('input[name*=property i], input[id*=property i], select[name*=property i]', "3-bedroom villa");
      setVal('input[name*=area i], input[id*=area i], select[name*=area i]', "Palm Jumeirah");
      setVal('input[name*=service i], input[id*=service i], select[name*=service i]', "Villa deep clean");
      setVal('input[name*=room i], input[id*=room i]', "3");
      const d = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
      setVal('input[type=date], input[name*=date i]', d);
      setVal('input[type=time], input[name*=time i]', "16:00");
      setVal('textarea[name*=message i], textarea[name*=notes i]', "QA smoke test — please ignore.");
    });
    // Don't actually submit — too risky for real customer sites.
    // Just verify the form is fillable without errors.
    return {
      status: "pass",
      message: "Form is fillable. (Not submitted — would create a real lead.)",
      evidence: { url, form: formSelector },
    };
  } catch (err) {
    return {
      status: "fail",
      severity: "high",
      message: "Failed to fill booking form fields.",
      evidence: { error: err instanceof Error ? err.message : String(err) },
    };
  }
}

// ─────────────────────────────────────────────────────────────
// Runner
// ─────────────────────────────────────────────────────────────

async function runOnePage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  browser: any,
  vp: QaViewport,
  url: string,
  applicable: QaCheckDef[],
  runId: string,
  siteId: string,
): Promise<{ pass: number; warn: number; fail: number }> {
  const counts = { pass: 0, warn: 0, fail: 0 };
  const consoleErrors: string[] = [];
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    isMobile: !!vp.isMobile,
    deviceScaleFactor: vp.isMobile ? 2 : 1,
    userAgent: vp.isMobile
      ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile GYL-QA"
      : "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 GYL-QA",
    ignoreHTTPSErrors: false,
  });
  const page = await ctx.newPage();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page.on("console", (msg: any) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
  } catch (err) {
    await persistCheck(runId, siteId, url, vp.name, "navigation", "fail", "critical", `Page failed to load: ${err instanceof Error ? err.message : String(err)}`, {}, 0);
    counts.fail++;
    await ctx.close();
    return counts;
  }
  await page.waitForTimeout(1500); // settle

  for (const check of applicable) {
    if (check.viewports !== "all" && !check.viewports.includes(vp.name)) continue;
    const startedAt = Date.now();
    let result: QaResult;
    try {
      switch (check.kind) {
        case "text_overflow": result = await check_text_overflow(page); break;
        case "horizontal_scroll": result = await check_horizontal_scroll(page); break;
        case "tap_target_size": result = await check_tap_target_size(page); break;
        case "tap_target_spacing": result = await check_tap_target_spacing(page); break;
        case "buttons_visible_enabled": result = await check_buttons_visible_enabled(page); break;
        case "broken_images": result = await check_broken_images(page); break;
        case "no_console_errors": result = await check_console_errors(consoleErrors); break;
        case "lcp": { const r = await check_lcp_cls(page); result = r.lcp; break; }
        case "cls": { const r = await check_lcp_cls(page); result = r.cls; break; }
        case "limo_phone_tel_link": result = await check_limo_phone_tel_link(page); break;
        case "limo_phone_above_fold": result = await check_limo_phone_above_fold(page); break;
        case "limo_cta_above_fold": result = await check_limo_cta_above_fold(page); break;
        case "limo_trust_signals": result = await check_limo_trust_signals(page); break;
        case "limo_service_area": result = await check_limo_service_area(page); break;
        case "limo_fleet_imagery": result = await check_limo_fleet_imagery(page); break;
        case "cleaning_trust_signals": result = await check_cleaning_trust_signals(page); break;
        case "cleaning_service_area": result = await check_cleaning_service_area(page); break;
        case "cleaning_before_after_imagery": result = await check_cleaning_before_after_imagery(page); break;
        case "title_length": result = await check_title_length(page); break;
        case "meta_description": result = await check_meta_description(page); break;
        case "schema_localbusiness": result = await check_schema_localbusiness(page); break;
        case "og_image": result = await check_og_image(page); break;
        case "https_only": result = await check_https_only(page, url); break;
        case "alt_text_coverage": result = await check_alt_text_coverage(page); break;
        case "headings_hierarchy": result = await check_headings_hierarchy(page); break;
        case "booking_form_smoke": result = await check_booking_form_smoke(page, url); break;
        default: result = { status: "skipped", message: "Check not implemented" };
      }
    } catch (err) {
      result = {
        status: "fail",
        severity: "low",
        message: `Check threw: ${err instanceof Error ? err.message : String(err)}`,
        evidence: {},
      };
    }
    const ms = Date.now() - startedAt;
    await persistCheck(runId, siteId, url, vp.name, check.kind, result.status, result.severity ?? null, result.message ?? null, result.evidence ?? {}, ms);
    if (result.status === "pass") counts.pass++;
    else if (result.status === "warn") counts.warn++;
    else if (result.status === "fail") counts.fail++;
  }
  await ctx.close();
  return counts;
}

async function persistCheck(
  runId: string,
  siteId: string,
  url: string,
  viewport: string,
  checkKind: string,
  status: string,
  severity: string | null,
  message: string | null,
  evidence: Record<string, unknown>,
  durationMs: number,
) {
  await db().insert(qaChecks).values({
    runId,
    siteId,
    url,
    viewport,
    checkKind,
    status,
    severity,
    message,
    evidence,
    durationMs,
  });
}

async function discoverPages(siteId: string, siteDomain: string): Promise<string[]> {
  const base = siteDomain.startsWith("http") ? siteDomain : `https://${siteDomain}`;
  // Prefer the site's actual synced page inventory (real URLs, any niche) over guessing routes.
  const synced = await db()
    .select({ url: sitePages.url, slug: sitePages.slug })
    .from(sitePages)
    .where(and(eq(sitePages.siteId, siteId), eq(sitePages.status, "publish"), eq(sitePages.postType, "page")));
  if (synced.length > 0) {
    const home = synced.find((p) => p.slug === "" || p.slug === "home");
    const conversion = synced.find((p) => /contact|quote|pricing|book/i.test(p.slug));
    const rest = synced.filter((p) => p !== home && p !== conversion).slice(0, 1);
    const picked = [home, conversion, ...rest].filter((p): p is { url: string; slug: string } => !!p);
    if (picked.length > 0) return picked.map((p) => p.url);
  }
  // Fallback for sites with no synced inventory yet — just home + contact (always-true page types).
  return [base + "/", base + "/contact"];
}

async function main() {
  await ensureSchema();
  const onlySlug = arg("site");
  const onlyPage = arg("page");
  const explicitRunId = arg("run-id");

  const playwright = await loadPlaywright();
  if (!playwright) {
    console.error("[qa] playwright not installed. Install on the VPS:");
    console.error("  npm install --save-dev playwright");
    console.error("  npx playwright install chromium");
    process.exit(2);
  }

  // Resolve sites
  const targetSites = onlySlug
    ? await db().select().from(sites).where(eq(sites.slug, onlySlug))
    : await db().select().from(sites);

  if (targetSites.length === 0) {
    console.warn("[qa] no sites to QA");
    return;
  }

  const [org] = await db().select().from(orgSettings).where(eq(orgSettings.id, "singleton")).limit(1);
  const applicable = checksForIndustry(org?.industry ?? "cleaning_services");
  console.log(`[qa] running ${applicable.length} checks × ${QA_VIEWPORTS.length} viewports for ${targetSites.length} site(s)`);

  const browser = await playwright.chromium.launch({ headless: true });
  try {
    for (const site of targetSites) {
      // Create or claim the run
      let runId: string;
      if (explicitRunId) {
        runId = explicitRunId;
        await db().update(qaRuns).set({ status: "running", startedAt: new Date() }).where(eq(qaRuns.id, runId));
      } else {
        const [created] = await db()
          .insert(qaRuns)
          .values({
            scope: onlyPage ? "page" : "site",
            siteId: site.id,
            scopeRef: onlyPage,
            status: "running",
            triggerKind: "manual",
            startedAt: new Date(),
          })
          .returning({ id: qaRuns.id });
        runId = created.id;
      }
      console.log(`[qa] ${site.slug} — run ${runId}`);

      const urls = onlyPage
        ? [onlyPage.startsWith("http") ? onlyPage : `https://${site.domain}${onlyPage}`]
        : await discoverPages(site.id, site.domain);

      let pass = 0;
      let warn = 0;
      let fail = 0;
      for (const vp of QA_VIEWPORTS) {
        for (const url of urls) {
          const c = await runOnePage(browser, vp, url, applicable, runId, site.id);
          pass += c.pass;
          warn += c.warn;
          fail += c.fail;
          console.log(`[qa]   ${vp.name} ${url} → pass=${c.pass} warn=${c.warn} fail=${c.fail}`);
        }
      }

      const summary = `${pass} passed · ${warn} warnings · ${fail} failures`;
      await db()
        .update(qaRuns)
        .set({
          status: "done",
          finishedAt: new Date(),
          passCount: pass,
          warnCount: warn,
          failCount: fail,
          summary,
        })
        .where(eq(qaRuns.id, runId));
      console.log(`[qa] ${site.slug} done — ${summary}`);
    }
  } finally {
    await browser.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[qa] fatal", err);
    process.exit(1);
  });
