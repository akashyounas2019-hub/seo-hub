/**
 * Canonical section layout per page type — the single source of truth the Site
 * Builder Studio uses to seed each page's left rail, and that the renderer
 * (src/lib/site-renderer.ts) consumes to emit a full page.
 *
 * Structural rules (locked; adapted for the Dubai cleaning-services vertical):
 *   - Home / Service / Service-area each have a DISTINCT section sequence.
 *   - "content" is the editorial body; the renderer DISTRIBUTES its H2 chunks
 *     across the page as ≥4 interleaved paragraph sections (1,200–1,500 words).
 *   - Service-area pages (Dubai neighbourhoods) carry their own About-area ·
 *     Top-places · Services · Coverage sections — never a clone of Home.
 *
 * Some section keys ("fleet", "airport") are retained from the previous
 * transport-vertical iteration for schema compatibility. Their user-visible
 * labels + descriptions have been re-tuned for cleaning services (fleet →
 * "team & kit"; airport → "coverage from base") but the underlying `type`
 * string is unchanged so existing rendered pages don't need migrating.
 *
 * `type` values map 1:1 to renderer section emitters. `required` sections can be
 * reordered but not removed in the Studio (they anchor the page's SEO/UX spine).
 */

export type SectionSpec = {
  /** Stable section key — must match a renderer emitter in site-renderer.ts. */
  type: string;
  /** Human label shown in the Studio left rail. */
  label: string;
  /** Anchors the page — Studio allows reorder but blocks disabling. */
  required: boolean;
  /** One-line description shown under the label / on hover. */
  description: string;
  /** True when this section can carry a researched design variant (design-research selection). */
  variantable?: boolean;
};

const HEADER: SectionSpec = { type: "header", label: "Header / nav bar", required: false, description: "Top navigation — logo, menu, phone CTA. Usually global.", variantable: true };
const FOOTER: SectionSpec = { type: "footer", label: "Footer", required: false, description: "Site footer — links, NAP, hours. Usually global.", variantable: true };
const HERO: SectionSpec = { type: "hero", label: "Hero + quote form", required: true, description: "Headline, sub, CTAs and the multi-step quote form.", variantable: true };
const CONTENT: SectionSpec = { type: "content", label: "Editorial body (distributed)", required: true, description: "1,200–1,500 word body — H2 chunks woven across the page as ≥4 paragraph sections." };
const EEAT: SectionSpec = { type: "eeat", label: "E-E-A-T trust grid", required: false, description: "Experience · Expertise · Authority · Trust four-pillar grid.", variantable: true };
const SERVICES: SectionSpec = { type: "services", label: "Services carousel", required: false, description: "Swipeable service cards with arrows + dots.", variantable: true };
const FEATURES: SectionSpec = { type: "features", label: "Why-us feature grid", required: false, description: "Differentiator chips (fixed AED price, 60-point checklist, same-day, insured…).", variantable: true };
const STEPS: SectionSpec = { type: "steps", label: "How it works", required: false, description: "Numbered 4-step booking flow.", variantable: true };
const FLEET: SectionSpec = { type: "fleet", label: "Team & kit cards", required: false, description: "Team leads + kit + checklist cards — the cleaning-vertical equivalent of a fleet section. Legacy `type=\"fleet\"` kept for schema compatibility.", variantable: true };
const AREAS: SectionSpec = { type: "areas", label: "Areas we serve", required: false, description: "Linked grid of service-area pages.", variantable: true };
const REVIEWS: SectionSpec = { type: "reviews", label: "What to expect", required: false, description: "Standards band (review-ready, facts-free until GBP connected).", variantable: true };
const FAQ: SectionSpec = { type: "faq", label: "FAQ accordion", required: false, description: "Single-open accordion — feeds FAQ schema.", variantable: true };
const CONTACT: SectionSpec = { type: "contact", label: "Contact band", required: true, description: "Phone · email · hours · area cards.", variantable: true };
const INCLUSIONS: SectionSpec = { type: "inclusions", label: "What's included", required: false, description: "Service-page signature — every booking includes…", variantable: true };
const ABOUT_CITY: SectionSpec = { type: "about_city", label: "About this area", required: true, description: "Area-page intro — cleaning services in {city} / {area}.", variantable: true };
const TOP_PLACES: SectionSpec = { type: "top_places", label: "Top places in city", required: false, description: "Area-page — real local landmarks / venues grid.", variantable: true };
const AIRPORT: SectionSpec = { type: "airport", label: "Coverage from base", required: false, description: "Area-page — base→{area} drive times + same-day feasibility. Legacy `type=\"airport\"` kept for schema compatibility.", variantable: true };

/** Page-type → ordered canonical sections. (Hero first, Contact last are enforced by the renderer.) */
export const PAGE_TYPE_SECTIONS: Record<string, SectionSpec[]> = {
  home: [HERO, CONTENT, EEAT, SERVICES, FEATURES, STEPS, FLEET, AREAS, REVIEWS, FAQ, CONTACT],
  service: [HERO, CONTENT, INCLUSIONS, STEPS, FLEET, SERVICES, FAQ, AREAS, CONTACT],
  // "area" and "service_area" are the same page type (schema uses service_area).
  service_area: [HERO, ABOUT_CITY, TOP_PLACES, CONTENT, SERVICES, AIRPORT, FLEET, FAQ, AREAS, CONTACT],
  area: [HERO, ABOUT_CITY, TOP_PLACES, CONTENT, SERVICES, AIRPORT, FLEET, FAQ, AREAS, CONTACT],
  fleet: [HERO, FLEET, CONTENT, FEATURES, SERVICES, CONTACT],
  about: [HERO, CONTENT, EEAT, STEPS, CONTACT],
  contact: [HERO, CONTACT, AREAS],
  services_hub: [HERO, CONTENT, SERVICES, FEATURES, FLEET, CONTACT],
  areas_hub: [HERO, AREAS, CONTENT, SERVICES, CONTACT],
  reservation: [HERO, EEAT, CONTACT],
  faq: [HERO, FAQ, CONTACT],
  blog: [HERO, CONTENT, CONTACT],
};

/** Friendly labels for the Studio page-type tabs. */
export const PAGE_TYPE_LABELS: Record<string, string> = {
  home: "Home",
  service: "Service",
  service_area: "Service area",
  area: "Service area",
  fleet: "Fleet",
  about: "About",
  contact: "Contact",
  services_hub: "Services hub",
  areas_hub: "Areas hub",
  reservation: "Reservation",
  faq: "FAQ",
  blog: "Blog",
};

export function sectionsForPageType(pageType: string): SectionSpec[] {
  const core = PAGE_TYPE_SECTIONS[pageType] || PAGE_TYPE_SECTIONS.service;
  // Header always first, Footer always last — present on every page type.
  return [HEADER, ...core, FOOTER];
}

export type StudioSection = { type: string; enabled: boolean; variantSelectionId: string | null; order: number };

/** Build the default StudioSection[] for a page type (all canonical sections enabled, in order). */
export function defaultSectionsForPageType(pageType: string): StudioSection[] {
  return sectionsForPageType(pageType).map((s, i) => ({
    type: s.type,
    enabled: true,
    variantSelectionId: null,
    order: i,
  }));
}

/** Normalize a possibly-null stored layout against the canonical spec (adds any missing canonical sections, drops unknown). */
export function resolveSections(pageType: string, stored: StudioSection[] | null | undefined): StudioSection[] {
  const spec = sectionsForPageType(pageType);
  const specTypes = new Set(spec.map((s) => s.type));
  if (!stored || !Array.isArray(stored) || stored.length === 0) return defaultSectionsForPageType(pageType);
  const byType = new Map(stored.filter((s) => s && specTypes.has(s.type)).map((s) => [s.type, s]));
  // keep stored order for known sections, then append any canonical sections the stored layout is missing
  const known = stored.filter((s) => s && specTypes.has(s.type));
  const missing = spec.filter((s) => !byType.has(s.type)).map((s, i) => ({ type: s.type, enabled: true, variantSelectionId: null, order: known.length + i }));
  return [...known, ...missing].map((s, i) => ({ ...s, order: i }));
}

/** Required sections (by type) for a page type — the Studio blocks disabling these. */
export function requiredSectionTypes(pageType: string): Set<string> {
  return new Set(sectionsForPageType(pageType).filter((s) => s.required).map((s) => s.type));
}
