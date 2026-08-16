/**
 * Site Sections Blueprint — the canonical set of sections a premium
 * Dubai cleaning-services website should consider.
 *
 * The section catalog was originally curated for a chauffeur / limo agency
 * vertical; the `mustInclude` bullets and `commonMistakes` items have been
 * rewritten for the cleaning vertical (villa deep clean, apartment
 * maintenance, office cleaning, sofa/carpet cleaning). The
 * `fleet` category is retained as `services` — a "fleet" of vehicles for a
 * limo business maps to a "service catalog" (villa clean, deep clean,
 * post-construction, etc.) for a cleaning business.
 *
 * `referenceUrls` still point at the original curated luxury chauffeur sites
 * (Empire CLS, Boston Coach, Elite Limousine, Davey Limo). They are marked
 * as `legacy: true` and kept in place because they illustrate universal
 * layout principles (single bold CTA, badge-strip trust bar, filterable
 * service grid) that transfer cleanly to the cleaning vertical. Replace
 * them with curated Dubai cleaning-competitor URLs as the operator
 * discovers strong examples.
 *
 * Each entry has:
 *   - `key` — stable id used by `pick_sections_for_build`
 *   - `name` — human-facing label
 *   - `category` — groups in the UI (above-fold / proof / conversion / etc.)
 *   - `priority` — 1 = essential (most sites), 2 = strongly recommended, 3 = optional
 *   - `description` — one-line "what is this"
 *   - `mustInclude` — checklist of content that has to be in the section
 *   - `referenceUrls` — links to live sites doing this section well
 *   - `commonMistakes` — pitfalls to avoid
 *
 * The chat agent surfaces this via `list_section_blueprint`. The user
 * picks which sections their site should have via `pick_sections_for_build`.
 */

export type SectionCategory =
  | "hero"
  | "trust"
  | "services"
  | "fleet"
  | "areas"
  | "booking"
  | "social_proof"
  | "info"
  | "conversion"
  | "footer";

export interface SectionBlueprint {
  key: string;
  name: string;
  category: SectionCategory;
  priority: 1 | 2 | 3;
  description: string;
  mustInclude: string[];
  referenceUrls: Array<{ url: string; note: string }>;
  commonMistakes: string[];
}

export const SITE_SECTIONS_BLUEPRINT: SectionBlueprint[] = [
  // ───── Above the fold ─────
  {
    key: "hero",
    name: "Hero",
    category: "hero",
    priority: 1,
    description:
      "First-screen statement: who you are, what you do, why now. Visible inside 0.6s of page load on mobile.",
    mustInclude: [
      "Clear value prop in ≤10 words (e.g. 'Dubai's villa deep clean, audited against a 60-point checklist.')",
      "Primary CTA above the fold ('Get a same-day quote' / 'Book a walkthrough')",
      "Subtle secondary CTA ('Call our team')",
      "One striking visual — real post-clean marble/villa interior or short autoplaying loop",
      "Phone number (WhatsApp preferred in UAE) in the top nav — mobile users are 3× more likely to call/message",
    ],
    referenceUrls: [
      { url: "https://www.empirecls.com/", note: "Empire CLS — split hero, vehicle photo + booking widget side-by-side" },
      { url: "https://www.daveylimo.com/", note: "LEGACY — layout: centered hero with phone number prominent" },
      { url: "https://www.elitelimousine.com/", note: "Elite — full-bleed vehicle photo, single bold CTA" },
    ],
    commonMistakes: [
      "Stock photos that don't match your actual outcomes (use real before/after villa photos)",
      "Carousel sliders — users miss slide 2+",
      "Hero text too long (>15 words)",
      "No phone / WhatsApp number visible",
    ],
  },

  {
    key: "instant_booking_widget",
    name: "Instant booking widget",
    category: "booking",
    priority: 1,
    description:
      "Right-rail or embedded form: property type / area / rooms / service / preferred date. Shows AED estimate before submit if pricing is wired.",
    mustInclude: [
      "Property type selector (villa / apartment / office / retail)",
      "Area or neighbourhood (Dubai + adjacent emirates)",
      "Room count or square footage",
      "Service type selector (standard clean / deep clean / move-in-out / post-construction / sofa / carpet)",
      "Preferred date + time slot",
      "Estimated AED price before submit (or 'Get same-day quote')",
      "Phone / WhatsApp field for confirmation",
    ],
    referenceUrls: [
      { url: "https://www.empirecls.com/book/", note: "Empire — multi-step but clear progress" },
      { url: "https://www.elitelimousine.com/reservations/", note: "Elite — single-page form, fast" },
    ],
    commonMistakes: [
      "Too many fields on step 1 (anything beyond pickup+dropoff+date+pax)",
      "Forced account creation before quote",
      "No estimated price (customers leave to comparison-shop)",
    ],
  },

  // ───── Trust ─────
  {
    key: "trust_bar",
    name: "Trust bar (logos / certifications)",
    category: "trust",
    priority: 1,
    description:
      "Thin horizontal strip below the hero: corporate clients, certifications, awards. Builds instant credibility.",
    mustInclude: [
      "3-6 recognizable logos (property management, hotels, corporate clients, real-estate developers)",
      "Trade licence badge (Dubai Municipality / DED registration number)",
      "Industry certifications if any (bonded & insured, ISO, DA / DIFC-approved)",
      "Award badges if any",
    ],
    referenceUrls: [
      { url: "https://www.empirecls.com/", note: "Empire — corporate client logos in a single row" },
      { url: "https://www.boston-limo.com/", note: "Boston Coach — clean badge strip" },
    ],
    commonMistakes: [
      "Generic 'as seen in' without verifiable proof",
      "Too many logos (>8 looks desperate)",
      "Tiny logos that can't be recognized",
    ],
  },

  // ───── Services ─────
  {
    key: "services_grid",
    name: "Services grid",
    category: "services",
    priority: 1,
    description:
      "3-4 column grid of your top services: Villa Deep Clean, Apartment Maintenance, Move-in/out, Post-Construction, Sofa/Carpet, Office Cleaning, etc. Each links to its own service page.",
    mustInclude: [
      "Card per service with icon or real outcome photo",
      "1-line description of the service (what's included, typical duration)",
      "Starting AED price OR 'Get quote' CTA",
      "Link to dedicated service page (every service needs its own page for SEO)",
    ],
    referenceUrls: [
      { url: "https://www.empirecls.com/services/", note: "Empire — 6-card services grid" },
      { url: "https://www.daveylimo.com/services/", note: "LEGACY — layout: service grid pattern" },
    ],
    commonMistakes: [
      "Bullet list instead of cards (visually flat, low engagement)",
      "All services lumped on one page (kills SEO — each service deserves its own page)",
    ],
  },

  // ───── Team & kit showcase (replaces the "fleet" section for the cleaning vertical) ─────
  {
    key: "fleet_showcase",
    name: "Team & kit showcase",
    category: "fleet",
    priority: 1,
    description:
      "Visual gallery of your actual team + equipment + checklist. Each item: photo, purpose, why it matters. The cleaning-vertical equivalent of a fleet page.",
    mustInclude: [
      "Photo of YOUR actual team in uniform (not stock)",
      "The written 60-point checklist (or a preview of it)",
      "Hospital-grade / eco-friendly product line-up (real bottles, not stock)",
      "Equipment shown (steam cleaner, HEPA vac, extractor, colour-coded microfibres)",
      "Team leads named with years experience + languages",
    ],
    referenceUrls: [
      // Legacy limo-vertical references — retained for layout inspiration
      // (interior/exterior split, filterable grid). Replace with Dubai
      // cleaning-competitor examples as they're identified.
      { url: "https://www.empirecls.com/fleet/", note: "LEGACY — layout: interior + exterior photo pattern" },
      { url: "https://www.elitelimousine.com/fleet/", note: "LEGACY — layout: filterable grid pattern" },
    ],
    commonMistakes: [
      "Stock photos (customers can tell)",
      "No checklist or product visibility (customers can't self-serve)",
      "Kit that doesn't match what arrives (breaks trust on first job)",
    ],
  },

  // ───── Service areas ─────
  {
    key: "service_areas_map",
    name: "Service areas map",
    category: "areas",
    priority: 1,
    description:
      "Visual map + list of every city/area you serve. Critical for local SEO + customer reassurance.",
    mustInclude: [
      "Embedded Google Map centred on Dubai + covered emirates",
      "List of every Dubai neighbourhood served (linked to dedicated neighbourhood pages)",
      "Adjacent emirate callouts (Sharjah, Abu Dhabi, Ajman if applicable)",
      "Coverage boundary description ('All Dubai residential communities + Sharjah on request')",
    ],
    referenceUrls: [
      { url: "https://www.daveylimo.com/service-area/", note: "LEGACY — layout: service-area coverage map + list pattern" },
    ],
    commonMistakes: [
      "Map without a city list (kills SEO)",
      "List without a map (visual context lost)",
      "Areas you don't actually serve (results in bad reviews)",
    ],
  },

  // ───── Social proof ─────
  {
    key: "testimonials",
    name: "Customer testimonials",
    category: "social_proof",
    priority: 1,
    description:
      "Real quotes from named customers. Star rating aggregate.",
    mustInclude: [
      "Star rating average + total reviews count (pulled from Google / Yelp)",
      "3-6 named testimonials with photo if possible",
      "Industry mix (corporate + wedding + airport)",
      "Link to full Google reviews page",
    ],
    referenceUrls: [
      { url: "https://www.empirecls.com/about/", note: "Empire — testimonials + named clients" },
      { url: "https://www.boston-limo.com/", note: "Boston Coach — review aggregate" },
    ],
    commonMistakes: [
      "Anonymous testimonials ('John D.' — looks fake)",
      "All 5-star reviews (looks curated)",
      "No total review count",
    ],
  },

  {
    key: "press_logos",
    name: "Press / media mentions",
    category: "social_proof",
    priority: 2,
    description:
      "'As featured in' strip — Gulf News, Time Out Dubai, What's On, Khaleej Times. Only include if real.",
    mustInclude: [
      "Real media logos (no fakes)",
      "Link to the actual article",
      "Date of mention",
    ],
    referenceUrls: [],
    commonMistakes: [
      "Fake 'as seen on TV' logos — kills credibility instantly",
      "Outdated mentions (>3 years old)",
    ],
  },

  // ───── Info / Education ─────
  {
    key: "pricing_transparency",
    name: "Pricing / how it works",
    category: "info",
    priority: 1,
    description:
      "Transparent pricing table or 'how it works' breakdown. Removes friction.",
    mustInclude: [
      "Base rates per vehicle type",
      "What's included (no hidden fees)",
      "Hourly vs flat-rate explanation",
      "Cancellation policy",
      "Tipping policy",
    ],
    referenceUrls: [
      { url: "https://www.elitelimousine.com/rates/", note: "Elite — flat-rate table by destination" },
    ],
    commonMistakes: [
      "'Call for quote' on everything (customers leave)",
      "Hidden fees revealed at checkout (bad reviews)",
    ],
  },

  {
    key: "faq",
    name: "FAQ",
    category: "info",
    priority: 1,
    description:
      "12-20 questions covering the operator's most common customer questions. Use FAQPage schema for SEO.",
    mustInclude: [
      "FAQPage schema markup (Rich Results eligible)",
      "Booking questions (how, when, how far in advance)",
      "Pricing questions (rates, what's included, tipping)",
      "Vehicle questions (which vehicle for X passengers, amenities)",
      "Service questions (areas, late-night pickup, child seats)",
      "Cancellation / changes",
    ],
    referenceUrls: [
      { url: "https://www.empirecls.com/faqs/", note: "Empire — well-organized FAQ" },
    ],
    commonMistakes: [
      "FAQ as a single page with no schema (misses the Rich Results boost)",
      "Marketing-speak Qs ('Why are we the best?' — not real questions)",
      "Too few questions (<8)",
    ],
  },

  {
    key: "about_team",
    name: "About / team",
    category: "info",
    priority: 2,
    description:
      "Founder story, team photos, mission statement. Customers want to know who they're trusting.",
    mustInclude: [
      "Founder story (1-2 paragraphs)",
      "Years in business + trips completed",
      "Chauffeur bios — vetting / training / certifications",
      "Insurance + licensing details",
      "Office photo if you have a physical office",
    ],
    referenceUrls: [],
    commonMistakes: [
      "Generic 'about us' with no actual people",
      "Stock photos of cleaners in generic scrubs",
    ],
  },

  // ───── Conversion ─────
  {
    key: "corporate_account_cta",
    name: "Corporate account CTA",
    category: "conversion",
    priority: 2,
    description:
      "Dedicated callout for corporate customers — monthly invoicing, dedicated account manager, executive booking portal.",
    mustInclude: [
      "Headline targeting CEOs / EAs / travel managers",
      "Benefits list (billing, priority, account manager)",
      "Form: company name + role + estimated monthly trips",
      "Link to a corporate sales page",
    ],
    referenceUrls: [
      { url: "https://www.empirecls.com/corporate/", note: "Empire — dedicated corporate landing page" },
    ],
    commonMistakes: [
      "Treating corporate the same as retail (different sales motion)",
    ],
  },

  {
    key: "live_chat_or_phone_strip",
    name: "Sticky contact strip",
    category: "conversion",
    priority: 2,
    description:
      "Always-visible footer or floating button: phone number, WhatsApp, live chat — whatever your customers prefer.",
    mustInclude: [
      "Phone number (clickable on mobile)",
      "WhatsApp number (the UAE market relies on this heavily — even more than phone)",
      "Hours of operation",
      "Optional: live chat widget if you can staff it",
    ],
    referenceUrls: [],
    commonMistakes: [
      "Phone number only in the footer (invisible on long pages)",
      "Live chat widget that's unstaffed (worse than no widget)",
    ],
  },

  // ───── Footer ─────
  {
    key: "footer",
    name: "Footer",
    category: "footer",
    priority: 1,
    description:
      "Last chance to capture intent. Critical for SEO — internal links to every important page.",
    mustInclude: [
      "Phone + email + address (NAP for local SEO)",
      "Service areas — linked list of every city page",
      "Services — linked list of every service page",
      "Social media links (Instagram + TikTok for before/after outcomes, LinkedIn for B2B office/commercial contracts)",
      "Newsletter signup (event drops, special routes)",
      "Privacy + Terms + License # links",
      "Copyright with current year",
    ],
    referenceUrls: [],
    commonMistakes: [
      "Footer with no internal links (kills SEO crawl)",
      "Missing NAP (Name + Address + Phone) — kills local SEO consistency",
    ],
  },
];

/** Group sections by category for UI display. */
export function blueprintByCategory(): Record<SectionCategory, SectionBlueprint[]> {
  const out = {} as Record<SectionCategory, SectionBlueprint[]>;
  for (const s of SITE_SECTIONS_BLUEPRINT) {
    if (!out[s.category]) out[s.category] = [];
    out[s.category].push(s);
  }
  return out;
}

/** Categories in display order. */
export const SECTION_CATEGORY_ORDER: SectionCategory[] = [
  "hero",
  "booking",
  "trust",
  "services",
  "fleet",
  "areas",
  "social_proof",
  "info",
  "conversion",
  "footer",
];

export const SECTION_CATEGORY_LABEL: Record<SectionCategory, string> = {
  hero: "Above the fold",
  booking: "Booking flow",
  trust: "Trust signals",
  services: "Services",
  fleet: "Fleet showcase",
  areas: "Service areas",
  social_proof: "Social proof",
  info: "Information / education",
  conversion: "Conversion boosters",
  footer: "Footer",
};
