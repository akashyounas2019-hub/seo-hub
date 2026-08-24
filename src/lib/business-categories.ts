// Per-site business vertical, selected during onboarding (sites.business_category).
// Each entry's `promptHint` is prepended into SEO Suite tool prompts
// (job-templates.ts) so one generic tool-execution engine produces
// vertical-relevant output instead of maintaining a separate hardcoded
// agent per niche. See the automation-plan writeup for the reasoning.

export type BusinessCategory = {
  id: string;
  label: string;
  promptHint: string;
};

export const BUSINESS_CATEGORIES: BusinessCategory[] = [
  {
    id: "cleaning_services",
    label: "Cleaning Services",
    promptHint:
      "Local home-services business. Emphasize licensing, insurance, background-checked staff, service-area coverage pages, and transparent per-service pricing. Trust signals matter more than technical depth.",
  },
  {
    id: "home_services",
    label: "Home Services & Trades (plumbing, electrical, HVAC, handyman)",
    promptHint:
      "Local trades business. Emphasize licensing/certification numbers, emergency/same-day availability, service-area pages, and before/after or warranty proof points.",
  },
  {
    id: "medical_dental",
    label: "Medical / Dental Clinic",
    promptHint:
      "YMYL (Your Money or Your Life) vertical -- Google holds this to a much higher quality bar. Emphasize E-E-A-T: practitioner credentials, licensing, author bios with medical qualifications, and cite no unverified health claims.",
  },
  {
    id: "legal",
    label: "Legal / Law Firm",
    promptHint:
      "YMYL vertical. Emphasize attorney credentials, bar admission, case-result disclaimers, and jurisdiction-specific practice-area pages. Never suggest guaranteed outcomes.",
  },
  {
    id: "real_estate",
    label: "Real Estate",
    promptHint:
      "Emphasize neighborhood/listing-area landing pages, agent credentials and licensing, and local market data freshness.",
  },
  {
    id: "restaurant",
    label: "Restaurant / Food Service",
    promptHint:
      "Emphasize menu schema, LocalBusiness + Restaurant structured data, reservation/ordering CTAs, and review/rating signals.",
  },
  {
    id: "fitness",
    label: "Fitness / Gym / Wellness",
    promptHint:
      "Emphasize class-schedule freshness, trainer credentials, membership/pricing clarity, and location pages for multi-branch operators.",
  },
  {
    id: "auto_services",
    label: "Auto Services (repair, detailing, dealership)",
    promptHint:
      "Emphasize certification badges (ASE etc.), service-specific landing pages, and transparent pricing/estimate CTAs.",
  },
  {
    id: "professional_services",
    label: "Professional Services (consulting, accounting, agency)",
    promptHint:
      "Emphasize case studies, credentials/certifications, and clear service-tier or engagement-model pages.",
  },
  {
    id: "ecommerce",
    label: "E-commerce / Retail",
    promptHint:
      "Emphasize Product/Offer structured data, category-page architecture, and review schema. Technical crawl efficiency matters more here than most verticals given catalog size.",
  },
  {
    id: "other",
    label: "Other / General Local Business",
    promptHint:
      "General local business. Emphasize LocalBusiness schema, service-area coverage, and standard trust signals (reviews, licensing where applicable).",
  },
];

export function getBusinessCategory(id: string | null | undefined): BusinessCategory | undefined {
  if (!id) return undefined;
  return BUSINESS_CATEGORIES.find((c) => c.id === id);
}
