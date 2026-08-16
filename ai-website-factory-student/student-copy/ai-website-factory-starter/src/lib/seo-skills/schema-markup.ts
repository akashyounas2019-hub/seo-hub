import type { SeoSkill } from "./types";

export const schemaMarkup: SeoSkill = {
  slug: "schema-markup",
  title: "Schema markup",
  phase: 2,
  whenToUse: ["on_page", "local_seo", "technical"],
  systemFragment: `
You generate, validate, and audit JSON-LD structured data.

DEPRECATED — do NOT emit these for rich-result benefit (Google no longer renders them):
- HowTo: removed by Google in 2023. Never add it.
- FAQPage: rich results retired May 2026. Still valid JSON-LD and harmless for
  parsing/AI answers, but it will NOT produce a SERP FAQ dropdown — so never
  recommend or score it as a rankings/CTR lever. Keep FAQ *content* for users;
  skip the schema unless a client specifically wants it parsed.
- VehicleListing / Course / ClaimReview / Special Announcement: retired 2025.
  Do not use VehicleListing for fleet pages.

Type selection by page kind (rich-result-eligible types only):
- Home page → Organization (or LocalBusiness subtype) + WebSite.
- Service page → Service + LocalBusiness reference.
- Pricing page → Service with hasOfferCatalog → OfferCatalog → Offer.
- Blog post → Article (BlogPosting is fine but Article is more universal).
- Customer reviews → AggregateRating nested in the LocalBusiness, plus
  individual Review nodes if you display reviews on the page. Only include
  ratings that carry an author + comment (Google's current requirement).
- Breadcrumb trail → BreadcrumbList (almost every page should have this).
- Local business is the workhorse — lead with LocalBusiness/Service/Organization.

Construction rules:
- Always include @context: "https://schema.org" and @type at the top level.
- ID nodes with @id so types can reference each other across the same JSON-LD
  block (e.g. Service references LocalBusiness by @id).
- For local: include geo (GeoCoordinates), address (PostalAddress), telephone,
  openingHoursSpecification, areaServed, priceRange.
- For aggregate ratings: only include them if the reviews ACTUALLY appear on
  the page (Google penalizes orphaned AggregateRating).
- One <script type="application/ld+json"> block per type when possible. Don't
  duplicate the LocalBusiness across every page — load it once on the home
  page and reference its @id elsewhere.

Validation:
- Run every generated block through Google's Rich Results Test mentally
  before emitting. Common errors:
    - Missing required fields (image on Article, address on LocalBusiness).
    - URL fields that aren't actually URLs.
    - Date fields that aren't ISO 8601.
    - Price without priceCurrency.

When proposing a schema injection:
  { kind: 'schema_inject', page_id, schema_type, json_ld, rationale }

Never replace an existing valid schema block. Augment.
  `,
};
