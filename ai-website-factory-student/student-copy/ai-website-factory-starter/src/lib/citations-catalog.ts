/**
 * P5 — Catalog of citation directories the platform tracks per site.
 *
 * Ordered by importance for a Dubai / UAE cleaning services business
 * (homes, apartments, villas, offices, commercial). The "tier" determines
 * suggested workflow priority: tier 1 are non-negotiable, tier 2 are
 * second-pass, tier 3 are niche / long-tail directories.
 *
 * Some general-purpose global platforms (Yelp, TripAdvisor, Manta) that
 * appear in North-American catalogs have essentially zero UAE traction and
 * are omitted; the ones that do matter locally (dubizzle, Yalla.ae,
 * ServiceMarket, HomeGenie) take their place.
 */
export interface CitationDirectory {
  slug: string;
  name: string;
  url: string;
  tier: 1 | 2 | 3;
  notes?: string;
}

export const CITATION_DIRECTORIES: CitationDirectory[] = [
  // ── Tier 1 — must-have, high signal in UAE local search ─────────────
  { slug: "google_business", name: "Google Business Profile", url: "https://business.google.com/", tier: 1, notes: "Highest impact for local search across UAE. Non-negotiable." },
  { slug: "bing_places", name: "Bing Places", url: "https://www.bingplaces.com/", tier: 1 },
  { slug: "apple_maps", name: "Apple Maps (Business Connect)", url: "https://mapsconnect.apple.com/", tier: 1 },
  { slug: "facebook_business", name: "Facebook Business Page", url: "https://business.facebook.com/", tier: 1, notes: "High engagement in UAE for home services." },
  { slug: "instagram_business", name: "Instagram Business", url: "https://business.instagram.com/", tier: 1, notes: "Primary discovery channel for premium cleaning in Dubai." },
  { slug: "dubizzle", name: "dubizzle Home Services", url: "https://dubai.dubizzle.com/services/", tier: 1, notes: "UAE's dominant classifieds + home-services marketplace. Non-negotiable." },
  { slug: "yalla_ae", name: "Yalla.ae Business Directory", url: "https://www.yalla.ae/", tier: 1, notes: "Local Dubai business directory with strong SEO." },
  { slug: "connect_ae", name: "connect.ae", url: "https://www.connect.ae/", tier: 1, notes: "UAE business directory, indexed by Google." },

  // ── Tier 2 — high-value UAE and MENA-region listings ────────────────
  { slug: "servicemarket", name: "ServiceMarket UAE", url: "https://www.servicemarket.com/", tier: 2, notes: "UAE home-services marketplace — cleaning services core category." },
  { slug: "urbanclap_uae", name: "Urban Company UAE", url: "https://www.urbancompany.com/uae/", tier: 2, notes: "Home-services aggregator with cleaning bookings in Dubai + Abu Dhabi." },
  { slug: "helping", name: "Helping.ae", url: "https://www.helpling.ae/", tier: 2, notes: "Direct competitor + directory — being listed here matters." },
  { slug: "justmop_directory", name: "Justmop Directory", url: "https://www.justmop.com/", tier: 2, notes: "Cleaning-vertical marketplace in the UAE." },
  { slug: "propertyfinder", name: "Property Finder UAE", url: "https://www.propertyfinder.ae/", tier: 2, notes: "Property portal with landlord/property-manager service directory." },
  { slug: "trustpilot", name: "Trustpilot", url: "https://www.trustpilot.com/", tier: 2, notes: "Global review platform, meaningful in UAE B2B + B2C." },
  { slug: "google_maps_reviews", name: "Google Maps Reviews", url: "https://www.google.com/maps/", tier: 2, notes: "Managed via Google Business Profile — reviews specifically." },
  { slug: "linkedin_company", name: "LinkedIn Company Page", url: "https://www.linkedin.com/", tier: 2, notes: "For office / commercial cleaning contracts." },
  { slug: "tiktok_business", name: "TikTok Business", url: "https://www.tiktok.com/business/", tier: 2, notes: "Fast-growing discovery for before-and-after clean content." },
  { slug: "youtube_channel", name: "YouTube Channel", url: "https://studio.youtube.com/", tier: 2, notes: "Villa deep-clean walkthroughs + testimonials." },

  // ── Tier 3 — niche / long-tail UAE + regional directories ───────────
  { slug: "yellowpages_ae", name: "YellowPages.ae", url: "https://www.yellowpages.ae/", tier: 3, notes: "Long-standing UAE business directory." },
  { slug: "hipages_uae", name: "hipages UAE", url: "https://www.hipages.ae/", tier: 3, notes: "Home-services request platform." },
  { slug: "bayt_business", name: "Bayt Business Directory", url: "https://www.bayt.com/", tier: 3, notes: "Recruiting site with a business directory tab." },
  { slug: "abudhabi_business", name: "Abu Dhabi Business Directory", url: "https://www.abudhabi.ae/", tier: 3, notes: "Useful when expanding to Abu Dhabi." },
  { slug: "sharjah_business", name: "Sharjah Business Directory", url: "https://www.sharjah.ae/", tier: 3, notes: "Useful when expanding to Sharjah." },
  { slug: "cylex_ae", name: "Cylex UAE", url: "https://www.cylex-uae.ae/", tier: 3 },
  { slug: "showmelocal_uae", name: "ShowMeLocal (UAE)", url: "https://www.showmelocal.com/", tier: 3 },
  { slug: "chamber_of_commerce_uae", name: "Dubai Chamber of Commerce Directory", url: "https://www.dubaichamber.com/", tier: 3, notes: "Membership required — signal of trust for B2B contracts." },
];

export function directoryBySlug(slug: string): CitationDirectory | undefined {
  return CITATION_DIRECTORIES.find((d) => d.slug === slug);
}
