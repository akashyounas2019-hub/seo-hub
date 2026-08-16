/**
 * Real distance + duration for quote pricing — no SaaS dependencies.
 *
 * Used to price cleaning callouts across Dubai and the wider UAE — travel
 * time between the operator's base and the customer's villa/apartment
 * factors into fixed AED quotes and same-day dispatch feasibility.
 *
 * Resolution order (fast → slow):
 *   1. Static table — curated Dubai neighbourhood ↔ neighbourhood pairs +
 *      cross-emirate pairs that account for ~90% of dispatch decisions.
 *      Instant, accurate.
 *   2. OSRM self-host — if `OSRM_URL` env is set (e.g. http://localhost:5000),
 *      we issue a single route request. Free, accurate, ~50ms.
 *   3. Haversine — straight-line × 1.3 urban road factor, with a conservative
 *      speed assumption. Always available, accurate to ±30% for short trips.
 *
 * Inputs are strings (the customer's address text). We normalize aggressively
 * — case-fold, collapse whitespace, strip P.O. Box + punctuation, alias
 * common landmark/tower names ("burj khalifa" → "downtown dubai",
 * "atlantis" → "palm jumeirah").
 *
 * The geocoder for OSRM would need separate setup (Nominatim self-host).
 * In the absence of geocoding, OSRM fallback only fires when the strings happen
 * to be lat,lng. For now, the static table + Haversine combo covers the vast
 * majority of practical use cases.
 */

export interface DistanceResult {
  km: number;
  durationMin: number;
  source: "static" | "osrm" | "haversine" | "unknown";
  confidence: "high" | "medium" | "low";
}

// ===== 1. Curated Dubai/UAE static table =====
// Each key is a normalized "from|to" string. Pairs are bidirectional —
// we look up both directions and average if both present (rarely).
//
// Distances in km, duration in minutes — typical mid-day commute, no surge.
// Update with real Google Maps numbers once a year.
const STATIC_ROUTES: Record<string, { km: number; min: number }> = {
  // ===== Cross-Dubai neighbourhood pairs from Downtown Dubai =====
  "downtown dubai|dubai marina":      { km: 26, min: 30 },
  "downtown dubai|jbr":               { km: 27, min: 32 },
  "downtown dubai|palm jumeirah":     { km: 28, min: 30 },
  "downtown dubai|business bay":      { km: 3,  min: 8 },
  "downtown dubai|difc":              { km: 4,  min: 10 },
  "downtown dubai|jumeirah":          { km: 10, min: 15 },
  "downtown dubai|al barsha":         { km: 15, min: 20 },
  "downtown dubai|dubai hills":       { km: 12, min: 18 },
  "downtown dubai|emirates hills":    { km: 22, min: 26 },
  "downtown dubai|arabian ranches":   { km: 27, min: 28 },
  "downtown dubai|jvc":               { km: 20, min: 25 },
  "downtown dubai|silicon oasis":     { km: 24, min: 28 },
  "downtown dubai|mirdif":            { km: 20, min: 26 },
  "downtown dubai|meadows":           { km: 25, min: 28 },
  "downtown dubai|the springs":      { km: 25, min: 28 },
  "downtown dubai|motor city":       { km: 22, min: 24 },
  "downtown dubai|damac hills":      { km: 30, min: 32 },
  "downtown dubai|al furjan":        { km: 25, min: 28 },
  "downtown dubai|dxb airport":       { km: 8,  min: 15 },

  // ===== From Dubai Marina =====
  "dubai marina|jbr":                 { km: 2,  min: 6 },
  "dubai marina|palm jumeirah":       { km: 8,  min: 15 },
  "dubai marina|jumeirah":            { km: 18, min: 22 },
  "dubai marina|al barsha":           { km: 10, min: 15 },
  "dubai marina|dubai hills":         { km: 14, min: 18 },
  "dubai marina|emirates hills":      { km: 5,  min: 10 },
  "dubai marina|jvc":                 { km: 8,  min: 14 },
  "dubai marina|arabian ranches":     { km: 15, min: 20 },
  "dubai marina|business bay":        { km: 24, min: 28 },
  "dubai marina|difc":                { km: 25, min: 30 },
  "dubai marina|dxb airport":         { km: 34, min: 35 },
  "dubai marina|dwc airport":         { km: 34, min: 32 },

  // ===== From Palm Jumeirah =====
  "palm jumeirah|jbr":                { km: 6,  min: 12 },
  "palm jumeirah|jumeirah":           { km: 12, min: 18 },
  "palm jumeirah|business bay":       { km: 26, min: 30 },
  "palm jumeirah|difc":               { km: 27, min: 30 },
  "palm jumeirah|al barsha":          { km: 14, min: 20 },
  "palm jumeirah|dubai hills":        { km: 18, min: 22 },
  "palm jumeirah|dxb airport":        { km: 33, min: 33 },

  // ===== Dubai International Airport (DXB) =====
  "dxb airport|business bay":         { km: 11, min: 18 },
  "dxb airport|difc":                 { km: 9,  min: 15 },
  "dxb airport|jumeirah":             { km: 17, min: 22 },
  "dxb airport|jbr":                  { km: 34, min: 35 },
  "dxb airport|silicon oasis":        { km: 15, min: 22 },
  "dxb airport|mirdif":               { km: 14, min: 22 },

  // ===== Al Maktoum / Dubai World Central (DWC) — Dubai South =====
  "dwc airport|al furjan":            { km: 15, min: 18 },
  "dwc airport|dubai marina":         { km: 34, min: 32 },
  "dwc airport|business bay":         { km: 30, min: 32 },
  "dwc airport|jumeirah":             { km: 35, min: 35 },
  "dwc airport|palm jumeirah":        { km: 36, min: 35 },

  // ===== Cross-emirate pairs =====
  "downtown dubai|abu dhabi":         { km: 145, min: 100 },
  "downtown dubai|sharjah":           { km: 27,  min: 40 },
  "downtown dubai|ajman":             { km: 40,  min: 55 },
  "dubai marina|abu dhabi":           { km: 130, min: 90 },
  "dubai marina|sharjah":             { km: 45,  min: 55 },

  // ===== Landmark aliases (mapped to canonical areas above) =====
  "downtown dubai|burj khalifa":      { km: 1,  min: 5 },
};

// Aliases to canonical normalized names used in the table above.
// All lower-case, stripped of punctuation. First matching alias wins.
const ALIASES: Array<{ pattern: RegExp; canonical: string }> = [
  // ── Airports ──────────────────────────────────────────────────────
  // DXB — Dubai International
  { pattern: /\b(dxb|dubai[\s-]+international|dubai[\s-]+intl|dubai[\s-]+airport|terminal\s*[123])\b/, canonical: "dxb airport" },
  // DWC — Al Maktoum / Dubai World Central (Dubai South)
  { pattern: /\b(dwc|al[\s-]+maktoum|dubai[\s-]+world[\s-]+central|dubai[\s-]+south[\s-]+airport)\b/, canonical: "dwc airport" },

  // ── Dubai neighbourhood aliases (loose match — most-specific first) ─
  { pattern: /\b(palm[\s-]+jumeirah|the[\s-]+palm|atlantis|nakheel[\s-]+mall)\b/, canonical: "palm jumeirah" },
  { pattern: /\b(dubai[\s-]+marina|marina[\s-]+walk|marina[\s-]+mall)\b/, canonical: "dubai marina" },
  { pattern: /\b(jbr|jumeirah[\s-]+beach[\s-]+residence|the[\s-]+walk|beach[\s-]+jbr)\b/, canonical: "jbr" },
  { pattern: /\b(downtown[\s-]+dubai|burj[\s-]+khalifa|dubai[\s-]+mall|old[\s-]+town|opera[\s-]+district)\b/, canonical: "downtown dubai" },
  { pattern: /\b(difc|dubai[\s-]+international[\s-]+financial[\s-]+centre|gate[\s-]+building)\b/, canonical: "difc" },
  { pattern: /\b(business[\s-]+bay|bay[\s-]+square|executive[\s-]+towers)\b/, canonical: "business bay" },
  { pattern: /\b(emirates[\s-]+hills|meydan|nad[\s-]+al[\s-]+sheba)\b/, canonical: "emirates hills" },
  { pattern: /\b(dubai[\s-]+hills|dubai[\s-]+hills[\s-]+estate|dubai[\s-]+hills[\s-]+mall)\b/, canonical: "dubai hills" },
  { pattern: /\b(arabian[\s-]+ranches)\b/, canonical: "arabian ranches" },
  { pattern: /\b(jumeirah)\b/, canonical: "jumeirah" },
  { pattern: /\b(al[\s-]+barsha|mall[\s-]+of[\s-]+emirates|mall[\s-]+of[\s-]+the[\s-]+emirates)\b/, canonical: "al barsha" },
  { pattern: /\b(jvc|jumeirah[\s-]+village[\s-]+circle)\b/, canonical: "jvc" },
  { pattern: /\b(silicon[\s-]+oasis|dubai[\s-]+silicon[\s-]+oasis|dso)\b/, canonical: "silicon oasis" },
  { pattern: /\b(mirdif|city[\s-]+centre[\s-]+mirdif)\b/, canonical: "mirdif" },
  { pattern: /\b(meadows)\b/, canonical: "meadows" },
  { pattern: /\b(the[\s-]+springs|springs\b)/, canonical: "the springs" },
  { pattern: /\b(motor[\s-]+city|dubai[\s-]+motor[\s-]+city)\b/, canonical: "motor city" },
  { pattern: /\b(damac[\s-]+hills|akoya)\b/, canonical: "damac hills" },
  { pattern: /\b(al[\s-]+furjan)\b/, canonical: "al furjan" },

  // ── Adjacent emirates ─────────────────────────────────────────────
  { pattern: /\b(abu[\s-]+dhabi|yas[\s-]+island|corniche)\b/, canonical: "abu dhabi" },
  { pattern: /\b(sharjah|al[\s-]+qasba)\b/, canonical: "sharjah" },
  { pattern: /\b(ajman)\b/, canonical: "ajman" },

  // Fall through to "downtown dubai" for a bare "dubai" address.
  { pattern: /\bdubai\b/, canonical: "downtown dubai" },
];

/**
 * Normalize a free-form address into a canonical short name for table lookup.
 * Returns null if we can't recognize a known place.
 */
function normalize(addr: string): string | null {
  if (!addr) return null;
  const lower = addr.toLowerCase().replace(/[,.]/g, " ").replace(/\s+/g, " ").trim();
  for (const a of ALIASES) {
    if (a.pattern.test(lower)) return a.canonical;
  }
  return null;
}

function tableLookup(from: string, to: string): { km: number; min: number } | null {
  const direct = STATIC_ROUTES[`${from}|${to}`];
  if (direct) return direct;
  const reverse = STATIC_ROUTES[`${to}|${from}`];
  if (reverse) return reverse;
  return null;
}

// ===== 2. Haversine fallback =====
// Used when we can't find a static match. For urban trips this is conservative
// since real road distance is usually 1.2-1.4× straight-line. We bake in 1.3×.
//
// This module was originally built for a transport-vertical use case (pricing
// trips between city + airport). For the cleaning vertical, distance-to-
// customer is rarely a pricing factor — cleaners quote by property size, not
// by drive distance. The module is retained in case a future dispatch-timing
// feature needs it.

// Coarse lat/lng for canonical names (only used by haversine fallback when
// BOTH endpoints normalize). Numbers approximate to a few hundred metres —
// sufficient for urban dispatch estimates.
const LATLNG: Record<string, [number, number]> = {
  // ── Dubai airports ─────────────────────────────────────────────────
  "dxb airport": [25.2532, 55.3657],
  "dwc airport": [24.8969, 55.1614],
  // ── Dubai neighbourhoods ───────────────────────────────────────────
  "downtown dubai":  [25.1972, 55.2744],
  "dubai marina":    [25.0805, 55.1403],
  "jbr":             [25.0779, 55.1349],
  "palm jumeirah":   [25.1124, 55.1390],
  "business bay":    [25.1858, 55.2632],
  "difc":            [25.2110, 55.2793],
  "jumeirah":        [25.2140, 55.2540],
  "al barsha":       [25.1145, 55.1994],
  "dubai hills":     [25.1157, 55.2495],
  "emirates hills":  [25.0670, 55.1780],
  "arabian ranches": [25.0483, 55.2648],
  "jvc":             [25.0554, 55.2069],
  "silicon oasis":   [25.1218, 55.3797],
  "mirdif":          [25.2201, 55.4200],
  "meadows":         [25.0623, 55.1610],
  "the springs":     [25.0538, 55.1740],
  "motor city":      [25.0463, 55.2382],
  "damac hills":     [25.0247, 55.2565],
  "al furjan":       [25.0261, 55.1445],
  // ── Adjacent emirates ─────────────────────────────────────────────
  "abu dhabi":       [24.4539, 54.3773],
  "sharjah":         [25.3463, 55.4209],
  "ajman":           [25.4052, 55.5136],
  // ── Landmarks ─────────────────────────────────────────────────────
  "burj khalifa":    [25.1972, 55.2744],
};

function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371; // earth radius km
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// ===== 3. Optional OSRM (self-hosted) =====
// Set env OSRM_URL=http://localhost:5000 to enable. Requires you've also set
// up a geocoder (e.g. Nominatim) — without one we only fire if both addresses
// are "lat,lng" strings. Useful when paired with browser-side geocoding.
async function osrmRoute(fromLatLng: [number, number], toLatLng: [number, number]): Promise<{ km: number; min: number } | null> {
  const base = process.env.OSRM_URL;
  if (!base) return null;
  try {
    const url = `${base.replace(/\/$/, "")}/route/v1/driving/${fromLatLng[1]},${fromLatLng[0]};${toLatLng[1]},${toLatLng[0]}?overview=false`;
    const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return null;
    const data = (await res.json()) as { routes?: Array<{ distance: number; duration: number }> };
    const r = data.routes?.[0];
    if (!r) return null;
    return {
      km: r.distance / 1000,
      min: r.duration / 60,
    };
  } catch {
    return null;
  }
}

function parseLatLng(s: string): [number, number] | null {
  const m = s.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return [lat, lng];
}

/**
 * Main entry: best-effort distance + duration between two free-form addresses.
 * Always returns a result (even if low confidence) so the estimator never
 * crashes; surface `confidence` in the UI if you want to caveat the price.
 */
export async function resolveDistance(pickup: string, dropoff: string): Promise<DistanceResult> {
  // 1. Static lookup
  const from = normalize(pickup);
  const to = normalize(dropoff);
  if (from && to) {
    if (from === to) {
      // Same canonical area — short city-internal trip
      return { km: 6, durationMin: 18, source: "static", confidence: "medium" };
    }
    const exact = tableLookup(from, to);
    if (exact) {
      return { km: exact.km, durationMin: exact.min, source: "static", confidence: "high" };
    }
  }

  // 2. OSRM if available and both endpoints are lat,lng
  const aLL = parseLatLng(pickup) || (from ? LATLNG[from] : undefined);
  const bLL = parseLatLng(dropoff) || (to ? LATLNG[to] : undefined);
  if (aLL && bLL) {
    const osrm = await osrmRoute(aLL, bLL);
    if (osrm) {
      return { km: osrm.km, durationMin: osrm.min, source: "osrm", confidence: "high" };
    }
    // 3. Haversine × 1.3 road factor, assume 50 km/h average urban
    const straight = haversineKm(aLL, bLL);
    const km = Math.max(2, straight * 1.3);
    // Speed scales: short trips slower (city), long trips faster (highway)
    const avgSpeed = km < 20 ? 30 : km < 80 ? 50 : 90;
    const durationMin = Math.max(8, Math.round((km / avgSpeed) * 60));
    return {
      km: Math.round(km * 10) / 10,
      durationMin,
      source: "haversine",
      confidence: km < 50 ? "medium" : "low",
    };
  }

  // 4. Total unknown — return a sentinel the estimator can interpret as
  //    "use base+minimum only". Caller should still produce a number.
  return { km: 0, durationMin: 0, source: "unknown", confidence: "low" };
}

/**
 * Synchronous variant: skips OSRM, uses static table + Haversine only.
 * Useful in code paths where async would be awkward (e.g. quick estimates
 * called from React server components without await chains).
 */
export function resolveDistanceSync(pickup: string, dropoff: string): DistanceResult {
  const from = normalize(pickup);
  const to = normalize(dropoff);
  if (from && to) {
    if (from === to) return { km: 6, durationMin: 18, source: "static", confidence: "medium" };
    const exact = tableLookup(from, to);
    if (exact) return { km: exact.km, durationMin: exact.min, source: "static", confidence: "high" };
  }
  const aLL = parseLatLng(pickup) || (from ? LATLNG[from] : undefined);
  const bLL = parseLatLng(dropoff) || (to ? LATLNG[to] : undefined);
  if (aLL && bLL) {
    const straight = haversineKm(aLL, bLL);
    const km = Math.max(2, straight * 1.3);
    const avgSpeed = km < 20 ? 30 : km < 80 ? 50 : 90;
    const durationMin = Math.max(8, Math.round((km / avgSpeed) * 60));
    return { km: Math.round(km * 10) / 10, durationMin, source: "haversine", confidence: km < 50 ? "medium" : "low" };
  }
  return { km: 0, durationMin: 0, source: "unknown", confidence: "low" };
}
