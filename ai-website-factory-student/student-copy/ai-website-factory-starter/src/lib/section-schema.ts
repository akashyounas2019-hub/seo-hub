/**
 * Section Watch — canonical per-page-type SECTION schema for the network.
 *
 * Single source of truth shared by the audit ingest, the worker, and the
 * Health dashboard UI. The section list is the local-SEO structure the
 * platform enforces on service-business sites (currently tuned for the
 * Dubai cleaning-services vertical). Mandatory sections are `red`;
 * recommended sections are `amber`.
 *
 * Detection is $0 vision (Playwright screenshot → Mac-worker Claude Code
 * segmentation): the vision pass returns the section TYPES it sees on a page,
 * and the ingest route compares that present-set against REQUIRED_SECTIONS to
 * flag what's missing per site, folded into the existing structure dimension.
 */

export type PageType =
  | "home"
  | "services_hub"
  | "service"
  | "areas_hub"
  | "area"
  | "fleet"
  | "about"
  | "reservation"
  | "contact"
  | "other";

export interface RequiredSection {
  type: string;
  severity: "red" | "amber";
}

/**
 * Required + recommended sections per page type. `red` = mandatory (a missing
 * one is a real structural gap); `amber` = recommended (nice-to-have).
 */
export const REQUIRED_SECTIONS: Record<PageType, RequiredSection[]> = {
  home: [
    { type: "hero", severity: "red" },
    { type: "booking_form", severity: "red" },
    { type: "eeat", severity: "red" },
    { type: "services", severity: "red" },
    { type: "features", severity: "red" },
    { type: "fleet", severity: "red" },
    { type: "areas", severity: "red" },
    { type: "faq", severity: "red" },
    { type: "contact", severity: "red" },
    { type: "footer", severity: "red" },
    { type: "steps", severity: "amber" },
    { type: "testimonials", severity: "amber" },
  ],
  services_hub: [
    { type: "hero", severity: "red" },
    { type: "services", severity: "red" },
    { type: "fleet", severity: "red" },
    { type: "areas", severity: "red" },
    { type: "contact", severity: "red" },
    { type: "footer", severity: "red" },
    { type: "features", severity: "amber" },
  ],
  service: [
    { type: "hero", severity: "red" },
    { type: "booking_form", severity: "red" },
    { type: "service_detail", severity: "red" },
    { type: "fleet", severity: "red" },
    { type: "services", severity: "red" },
    { type: "areas", severity: "red" },
    { type: "faq", severity: "red" },
    { type: "contact", severity: "red" },
    { type: "footer", severity: "red" },
    { type: "process", severity: "amber" },
    { type: "features", severity: "amber" },
  ],
  areas_hub: [
    { type: "hero", severity: "red" },
    { type: "areas", severity: "red" },
    { type: "services", severity: "red" },
    { type: "contact", severity: "red" },
    { type: "footer", severity: "red" },
  ],
  area: [
    { type: "hero", severity: "red" },
    { type: "booking_form", severity: "red" },
    { type: "about", severity: "red" },
    { type: "areas", severity: "red" },
    { type: "services", severity: "red" },
    { type: "fleet", severity: "red" },
    { type: "faq", severity: "red" },
    { type: "contact", severity: "red" },
    { type: "footer", severity: "red" },
    { type: "airport", severity: "amber" },
    { type: "top_places", severity: "amber" },
  ],
  fleet: [
    { type: "hero", severity: "red" },
    { type: "fleet", severity: "red" },
    { type: "booking_form", severity: "red" },
    { type: "services", severity: "red" },
    { type: "areas", severity: "red" },
    { type: "contact", severity: "red" },
    { type: "footer", severity: "red" },
  ],
  about: [
    { type: "hero", severity: "red" },
    { type: "about", severity: "red" },
    { type: "eeat", severity: "red" },
    { type: "services", severity: "red" },
    { type: "fleet", severity: "red" },
    { type: "areas", severity: "red" },
    { type: "contact", severity: "red" },
    { type: "footer", severity: "red" },
  ],
  reservation: [
    { type: "hero", severity: "red" },
    { type: "booking_form", severity: "red" },
    { type: "contact", severity: "red" },
    { type: "footer", severity: "red" },
  ],
  contact: [
    { type: "hero", severity: "red" },
    { type: "contact", severity: "red" },
    { type: "footer", severity: "red" },
  ],
  other: [],
};

/** Pretty labels for each section type, for the dashboard checklist. */
export const SECTION_LABELS: Record<string, string> = {
  hero: "Hero",
  booking_form: "Booking form",
  eeat: "EEAT / trust",
  services: "Services",
  service_detail: "Service detail",
  fleet: "Fleet",
  areas: "Areas served",
  features: "Why choose us",
  process: "How it works",
  steps: "How it works",
  faq: "FAQ",
  contact: "Contact",
  footer: "Footer",
  about: "About / city intro",
  airport: "Airport / distances",
  top_places: "Top places",
  testimonials: "Reviews",
};

/**
 * Infer the canonical PageType of a site page from its URL path (and optional
 * WP post type). `sitePages` has no pageType column, so this is the mapping.
 *
 * Order matters: specific hubs + fixed pages are matched before the broad
 * service/area slug patterns so e.g. `/services/` resolves to the hub, not a
 * single service.
 */
export function inferPageType(url: string, _postType?: string | null): PageType {
  // Reduce to a normalized path: strip protocol+host, lowercase, ensure a
  // leading slash, drop any query/hash.
  let path = url.trim().toLowerCase();
  path = path.replace(/^https?:\/\/[^/]+/, "");
  path = path.replace(/[?#].*$/, "");
  if (!path.startsWith("/")) path = "/" + path;
  // Normalize trailing slash for matching (keep a single trailing form).
  const bare = path.replace(/\/+$/, ""); // no trailing slash
  const slug = bare.split("/").filter(Boolean).pop() ?? "";

  // Home.
  if (bare === "" || path === "/") return "home";

  // Fixed top-level pages + hubs (match before broad slug patterns).
  if (bare === "/services") return "services_hub";
  if (bare === "/areas" || bare === "/service-areas") return "areas_hub";
  if (bare === "/fleet" || bare === "/our-fleet") return "fleet";
  if (bare === "/about" || bare === "/about-us") return "about";
  if (bare === "/reservation" || bare === "/reservations" || /^\/book/.test(bare) || bare === "/get-a-quote") {
    return "reservation";
  }
  if (bare === "/contact" || bare === "/contact-us") return "contact";

  // Area pages — `service-areas/<x>` children, or `<service>-<area>` slugs.
  if (/^\/service-areas\/.+/.test(bare) || /^\/areas\/.+/.test(bare) || /^\/neighbourhoods?\/.+/.test(bare)) return "area";
  if (/^(cleaning-services|villa-cleaning|apartment-cleaning|deep-cleaning|maid-service|move-in-cleaning|move-out-cleaning)-.+/.test(slug)) return "area";

  // Service pages — `/services/<x>` children, or service-signature slugs.
  if (/^\/services\/.+/.test(bare)) return "service";
  if (
    /-deep-clean$/.test(slug) ||
    /-move-in$/.test(slug) ||
    /-move-out$/.test(slug) ||
    /-post-construction$/.test(slug) ||
    /-office-cleaning$/.test(slug) ||
    /-sofa-cleaning$/.test(slug) ||
    /-carpet-cleaning$/.test(slug) ||
    /-mattress-cleaning$/.test(slug) ||
    /-curtain-cleaning$/.test(slug) ||
    /-cleaning$/.test(slug)
  ) {
    return "service";
  }

  return "other";
}
