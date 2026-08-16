/**
 * A2 — Design QA Suite check catalogue.
 *
 * Each check is a small, deterministic, side-effect-free function from
 * a Playwright Page → { status, severity, message, evidence }.
 *
 * The runner (src/scripts/qa-run.ts) loads Playwright dynamically and
 * invokes each check at each viewport.
 */

export type QaStatus = "pass" | "warn" | "fail" | "skipped";
export type QaSeverity = "low" | "medium" | "high" | "critical";

export interface QaResult {
  status: QaStatus;
  severity?: QaSeverity;
  message?: string;
  evidence?: Record<string, unknown>;
}

export interface QaViewport {
  name: "mobile" | "tablet" | "desktop" | "wide";
  width: number;
  height: number;
  isMobile?: boolean;
}

export const QA_VIEWPORTS: QaViewport[] = [
  { name: "mobile", width: 390, height: 844, isMobile: true },
  { name: "tablet", width: 768, height: 1024, isMobile: false },
  { name: "desktop", width: 1440, height: 900 },
  { name: "wide", width: 1920, height: 1080 },
];

export interface QaCheckDef {
  kind: string;
  label: string;
  description: string;
  /** Run on every viewport, or only specific ones? */
  viewports: "all" | QaViewport["name"][];
  /** 'fast' = run on every URL; 'slow' = only on home + booking. */
  cost: "fast" | "slow";
  industry: ("limousine_chauffeur" | "cleaning_services" | "all")[];
}

export const QA_CHECKS: QaCheckDef[] = [
  // ───────── Responsive / Layout ─────────
  {
    kind: "text_overflow",
    label: "Text overflow",
    description: "Detects text running off-screen (scrollWidth > clientWidth on any element).",
    viewports: "all",
    cost: "fast",
    industry: ["all"],
  },
  {
    kind: "horizontal_scroll",
    label: "Horizontal scroll",
    description: "Page should never need to scroll sideways. document.documentElement.scrollWidth > clientWidth = fail.",
    viewports: "all",
    cost: "fast",
    industry: ["all"],
  },
  {
    kind: "tap_target_size",
    label: "Tap target ≥ 44 × 44",
    description: "Interactive elements (a, button, input) must be at least 44 × 44 px on mobile per Apple HIG.",
    viewports: ["mobile"],
    cost: "fast",
    industry: ["all"],
  },
  {
    kind: "tap_target_spacing",
    label: "Tap target spacing ≥ 8 px",
    description: "Adjacent interactive elements need ≥ 8px breathing room on mobile.",
    viewports: ["mobile"],
    cost: "fast",
    industry: ["all"],
  },

  // ───────── Buttons + Forms ─────────
  {
    kind: "buttons_visible_enabled",
    label: "Buttons visible + enabled",
    description: "Every <button> + role=button must be visible (not display:none) and not disabled (unless explicitly).",
    viewports: "all",
    cost: "fast",
    industry: ["all"],
  },
  {
    kind: "form_required_fields",
    label: "Required-field validation",
    description: "Submitting an empty form must surface validation messages (not 500).",
    viewports: ["mobile", "desktop"],
    cost: "slow",
    industry: ["all"],
  },
  {
    kind: "booking_form_smoke",
    label: "Booking form smoke test",
    description: "Fill booking form with realistic test data → submit → verify 2xx response + no JS errors.",
    viewports: ["mobile", "desktop"],
    cost: "slow",
    industry: ["limousine_chauffeur"],
  },
  {
    kind: "contact_form_smoke",
    label: "Contact form smoke test",
    description: "Fill contact / quote form → submit → verify success path.",
    viewports: ["mobile", "desktop"],
    cost: "slow",
    industry: ["all"],
  },

  // ───────── Network + Assets ─────────
  {
    kind: "broken_images",
    label: "No broken images",
    description: "Every <img> src must return 2xx.",
    viewports: ["desktop"],
    cost: "fast",
    industry: ["all"],
  },
  {
    kind: "broken_internal_links",
    label: "No broken internal links",
    description: "Every internal <a href> must return 2xx (HEAD probe).",
    viewports: ["desktop"],
    cost: "slow",
    industry: ["all"],
  },
  {
    kind: "no_console_errors",
    label: "No console errors during load",
    description: "page.on('console', err) — any error logged during load = fail.",
    viewports: ["desktop"],
    cost: "fast",
    industry: ["all"],
  },

  // ───────── Performance ─────────
  {
    kind: "lcp",
    label: "LCP < 2.5s",
    description: "Largest Contentful Paint should be ≤ 2.5s for good UX.",
    viewports: ["mobile", "desktop"],
    cost: "fast",
    industry: ["all"],
  },
  {
    kind: "cls",
    label: "CLS < 0.1",
    description: "Cumulative Layout Shift should be ≤ 0.1 — layouts shouldn't jump.",
    viewports: ["mobile", "desktop"],
    cost: "fast",
    industry: ["all"],
  },
  {
    kind: "page_weight",
    label: "Page weight < 2 MB",
    description: "Total bytes of all resources should be ≤ 2 MB ideally, ≤ 4 MB max.",
    viewports: ["desktop"],
    cost: "fast",
    industry: ["all"],
  },

  // ───────── Legacy transport-vertical conventions (kept for schema
  //           compatibility; only fires when industry='limousine_chauffeur').
  //           Not applied to cleaning-vertical sites. ─────────
  {
    kind: "limo_phone_tel_link",
    label: "Phone number is tel: link",
    description: "Phone number must be a tappable <a href='tel:...'> — mobile users tap to call.",
    viewports: ["mobile"],
    cost: "fast",
    industry: ["limousine_chauffeur", "cleaning_services"],
  },
  {
    kind: "limo_phone_above_fold",
    label: "Phone visible above the fold",
    description: "On mobile, the phone number must be reachable in the first 100vh without scroll.",
    viewports: ["mobile"],
    cost: "fast",
    industry: ["limousine_chauffeur", "cleaning_services"],
  },
  {
    kind: "limo_cta_above_fold",
    label: "Booking CTA above the fold",
    description: "A 'Book Now' / 'Get a Quote' / 'Reserve' button must be visible in the first viewport.",
    viewports: ["mobile", "desktop"],
    cost: "fast",
    industry: ["limousine_chauffeur", "cleaning_services"],
  },
  {
    kind: "limo_trust_signals",
    label: "Trust signals present",
    description: "Page must mention at least 3 of: years in business, fleet size, licensed/insured, 24/7, testimonials.",
    viewports: ["desktop"],
    cost: "fast",
    industry: ["limousine_chauffeur"],
  },
  {
    kind: "limo_service_area",
    label: "Service area listed",
    description: "At least one city or airport must be named on the page (LocalBusiness signal).",
    viewports: ["desktop"],
    cost: "fast",
    industry: ["limousine_chauffeur"],
  },
  {
    kind: "limo_fleet_imagery",
    label: "Fleet imagery present",
    description: "At least one image whose alt text or filename references a vehicle (sedan / SUV / limo / suburban / sprinter).",
    viewports: ["desktop"],
    cost: "fast",
    industry: ["limousine_chauffeur"],
  },

  // ───────── Cleaning-service-specific conventions ─────────
  {
    kind: "cleaning_trust_signals",
    label: "Trust signals present",
    description: "Page must mention at least 3 of: bonded/insured, background-checked staff, years in business, satisfaction guarantee, testimonials.",
    viewports: ["desktop"],
    cost: "fast",
    industry: ["cleaning_services"],
  },
  {
    kind: "cleaning_service_area",
    label: "Service area listed",
    description: "Page must name a service area (a 'serving <city>' style phrase or a ZIP/postal code) — LocalBusiness signal.",
    viewports: ["desktop"],
    cost: "fast",
    industry: ["cleaning_services"],
  },
  {
    kind: "cleaning_before_after_imagery",
    label: "Before/after or team imagery present",
    description: "At least one image whose alt text or filename references before/after results, the cleaning itself, or the team.",
    viewports: ["desktop"],
    cost: "fast",
    industry: ["cleaning_services"],
  },

  // ───────── SEO / Schema ─────────
  {
    kind: "title_length",
    label: "<title> 30-60 chars",
    description: "Title tag should be 30-60 characters.",
    viewports: ["desktop"],
    cost: "fast",
    industry: ["all"],
  },
  {
    kind: "meta_description",
    label: "Meta description 140-160 chars",
    description: "<meta name=description> should be 140-160 chars.",
    viewports: ["desktop"],
    cost: "fast",
    industry: ["all"],
  },
  {
    kind: "schema_localbusiness",
    label: "LocalBusiness schema",
    description: "JSON-LD with LocalBusiness type — required for rich results.",
    viewports: ["desktop"],
    cost: "fast",
    industry: ["all"],
  },
  {
    kind: "og_image",
    label: "OG image present",
    description: "<meta property='og:image'> must point to a 2xx URL (social previews).",
    viewports: ["desktop"],
    cost: "fast",
    industry: ["all"],
  },

  // ───────── Security ─────────
  {
    kind: "https_only",
    label: "HTTPS only",
    description: "Page must be served over HTTPS + must not load mixed content.",
    viewports: ["desktop"],
    cost: "fast",
    industry: ["all"],
  },
  {
    kind: "security_headers",
    label: "Security headers present",
    description: "HSTS, X-Content-Type-Options, Referrer-Policy should be set.",
    viewports: ["desktop"],
    cost: "fast",
    industry: ["all"],
  },

  // ───────── Accessibility ─────────
  {
    kind: "alt_text_coverage",
    label: "Alt text coverage ≥ 90%",
    description: "90% of <img> must have non-empty alt attributes.",
    viewports: ["desktop"],
    cost: "fast",
    industry: ["all"],
  },
  {
    kind: "headings_hierarchy",
    label: "Heading hierarchy",
    description: "Exactly one <h1>, no skipped heading levels (h1→h3 with no h2 is a warning).",
    viewports: ["desktop"],
    cost: "fast",
    industry: ["all"],
  },
];

export function checksForIndustry(industry: string): QaCheckDef[] {
  return QA_CHECKS.filter((c) => c.industry.includes("all") || c.industry.includes(industry as "limousine_chauffeur" | "cleaning_services"));
}

export function checkLabel(kind: string): string {
  return QA_CHECKS.find((c) => c.kind === kind)?.label ?? kind;
}
