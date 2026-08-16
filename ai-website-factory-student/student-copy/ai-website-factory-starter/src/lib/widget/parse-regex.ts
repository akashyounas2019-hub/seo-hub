/**
 * Deterministic regex parser — last-resort fallback when every LLM provider
 * is rate-limited or down. Catches the most common trip / job request
 * patterns with zero external dependencies.
 *
 * ⚠ LEGACY VERTICAL SHAPE ⚠
 *
 * The parser's output schema (`ParsedTrip` with `pickup_location`,
 * `dropoff_location`, `trip_type`, `passengers`, etc.) belongs to the
 * transport-vertical widget bundle. For the current Dubai cleaning-services
 * focus this parser is largely inert — the landmark aliases have been
 * updated to Dubai neighbourhoods so any spontaneous free-text still
 * canonicalises correctly, but a proper cleaning-vertical parser would
 * have a different shape (property_type, area, room_count, service_type,
 * preferred_date).
 *
 * Patterns covered (legacy):
 *   • "Palm Jumeirah to DIFC" / "from X to Y"           → pickup + dropoff
 *   • "5pm" / "17:00" / "5:30 PM"                       → time
 *   • "May 28" / "tomorrow" / "next Friday" / "2026-05-28" → date
 *   • "3 passengers" / "x4"                              → passengers (rarely useful for cleaning)
 *   • "1 hour" / "3 hours" / "hourly"                    → hours + trip_type
 *   • "one way" / "round trip"                           → trip_type
 *
 * NOT covered: complex multi-stop, conditional ("if it rains"), times in
 * foreign-language formats. The LLM tier handles those.
 */

export interface ParsedTrip {
  pickup_location: string | null;
  dropoff_location: string | null;
  pickup_at: string | null; // ISO-8601 or partial like "2026-05-28T17:00"
  passengers: number | null;
  trip_type: "one_way" | "two_way" | "hourly" | null;
  hours: number | null;
  notes: string | null;
}

// Common Dubai / UAE landmarks + neighbourhoods. Matched case-insensitively,
// expanded to their canonical names for clarity in the downstream dispatcher.
const LANDMARK_ALIASES: Record<string, string> = {
  // Airports
  dxb: "Dubai International Airport (DXB)",
  "dubai airport": "Dubai International Airport (DXB)",
  "dubai international": "Dubai International Airport (DXB)",
  dwc: "Al Maktoum International Airport (DWC)",
  "al maktoum": "Al Maktoum International Airport (DWC)",
  "dubai south": "Al Maktoum International Airport (DWC)",
  // Downtown + landmark towers
  downtown: "Downtown Dubai",
  "downtown dubai": "Downtown Dubai",
  "burj khalifa": "Burj Khalifa, Downtown Dubai",
  "dubai mall": "The Dubai Mall, Downtown Dubai",
  "opera district": "Dubai Opera District, Downtown Dubai",
  // Marina / JBR / Palm
  "dubai marina": "Dubai Marina",
  marina: "Dubai Marina",
  jbr: "Jumeirah Beach Residence (JBR)",
  "jumeirah beach residence": "Jumeirah Beach Residence (JBR)",
  "palm jumeirah": "Palm Jumeirah",
  palm: "Palm Jumeirah",
  atlantis: "Atlantis The Palm, Palm Jumeirah",
  // Business districts
  difc: "Dubai International Financial Centre (DIFC)",
  "business bay": "Business Bay",
  // Residential communities
  "emirates hills": "Emirates Hills",
  "dubai hills": "Dubai Hills Estate",
  "arabian ranches": "Arabian Ranches",
  jumeirah: "Jumeirah",
  "al barsha": "Al Barsha",
  "mall of the emirates": "Mall of the Emirates, Al Barsha",
  jvc: "Jumeirah Village Circle (JVC)",
  meadows: "The Meadows",
  springs: "The Springs",
  greens: "The Greens",
  "damac hills": "DAMAC Hills",
  "silicon oasis": "Dubai Silicon Oasis",
  mirdif: "Mirdif",
  "motor city": "Dubai Motor City",
  "al furjan": "Al Furjan",
  // Adjacent emirates
  "abu dhabi": "Abu Dhabi",
  sharjah: "Sharjah",
  ajman: "Ajman",
};

export function parseTripText(input: string): ParsedTrip {
  const text = input.trim();
  const out: ParsedTrip = {
    pickup_location: null,
    dropoff_location: null,
    pickup_at: null,
    passengers: null,
    trip_type: null,
    hours: null,
    notes: text,
  };

  if (text === "") return out;

  // ── pickup → dropoff via arrow or "to" ────────────────────────────────
  // Examples (LEGACY transport-shape): "DXB to Palm Jumeirah", "Downtown -> Marina", "from X to Y"
  const fromTo = text.match(/(?:from\s+)?([^,\n]+?)\s+(?:→|->|to)\s+([^,\n]+?)(?=\s+(?:on|at|for|with|by|in)\b|[,.]|$)/i);
  if (fromTo) {
    out.pickup_location = expandLandmark(fromTo[1]);
    out.dropoff_location = expandLandmark(fromTo[2]);
  }

  // ── trip type ─────────────────────────────────────────────────────────
  if (/\b(round[- ]?trip|return trip|two[- ]?way)\b/i.test(text)) {
    out.trip_type = "two_way";
  } else if (/\b(hourly|by the hour|per hour)\b/i.test(text) || /\b(\d+)\s*hours?\b/i.test(text)) {
    out.trip_type = "hourly";
    const m = text.match(/\b(\d+)\s*hours?\b/i);
    if (m) out.hours = parseInt(m[1], 10);
  } else if (/\b(one[- ]?way|single trip)\b/i.test(text)) {
    out.trip_type = "one_way";
  } else if (out.pickup_location && out.dropoff_location) {
    out.trip_type = "one_way";
  }

  // ── passengers ────────────────────────────────────────────────────────
  // "3 passengers", "4 people", "for 2", "x3", "3p"
  const passMatch = text.match(/\b(?:for\s+)?(\d{1,2})\s*(?:passengers?|people|persons?|pax|p\b)\b/i)
    ?? text.match(/\bx\s*(\d{1,2})\b/i);
  if (passMatch) {
    const n = parseInt(passMatch[1], 10);
    if (n > 0 && n <= 20) out.passengers = n;
  }

  // ── date + time ───────────────────────────────────────────────────────
  out.pickup_at = parseDateTime(text);

  return out;
}

function expandLandmark(raw: string): string {
  const clean = raw.trim().toLowerCase().replace(/[.,]+$/, "");
  return LANDMARK_ALIASES[clean] ?? raw.trim();
}

/**
 * Parse a date + time pair out of free text. Returns an ISO-8601 string
 * with hour precision, or null if nothing recognizable was found.
 *
 * Handles:
 *   • Full ISO: "2026-05-28T17:00", "2026-05-28 17:00"
 *   • US-style: "May 28 at 5pm", "May 28th, 5:30 PM"
 *   • Relative: "tomorrow at 5pm", "tonight at 8", "next friday at 9am"
 *   • Time only: "at 5pm" → today at 5pm
 */
function parseDateTime(text: string): string | null {
  const now = new Date();
  let date: Date | null = null;

  // ISO match — high confidence.
  const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):?(\d{2})?)?/);
  if (iso) {
    const [, y, mo, d, h, mi] = iso;
    date = new Date(Date.UTC(+y, +mo - 1, +d, +(h ?? 12), +(mi ?? 0)));
    return date.toISOString();
  }

  // Month name + day.
  const monthMatch = text.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})(?:[a-z]{2})?(?:,?\s+(\d{4}))?/i);
  if (monthMatch) {
    const monthIdx = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(
      monthMatch[1].slice(0, 3).toLowerCase(),
    );
    const day = parseInt(monthMatch[2], 10);
    const year = monthMatch[3] ? parseInt(monthMatch[3], 10) : now.getFullYear();
    date = new Date(year, monthIdx, day, 12, 0, 0);
  }

  // Relative day keywords.
  if (!date) {
    if (/\btoday\b/i.test(text) || /\btonight\b/i.test(text)) {
      date = new Date(now);
    } else if (/\btomorrow\b/i.test(text)) {
      date = new Date(now);
      date.setDate(date.getDate() + 1);
    } else {
      const dayMatch = text.match(/\b(?:next\s+)?(mon|tue|wed|thu|fri|sat|sun)[a-z]*\b/i);
      if (dayMatch) {
        const dayIdx = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"].indexOf(dayMatch[1].slice(0, 3).toLowerCase());
        date = new Date(now);
        const diff = (dayIdx - date.getDay() + 7) % 7 || 7;
        date.setDate(date.getDate() + diff);
      }
    }
  }

  // Time parsing — required for a confident pickup_at.
  const timeMatch = text.match(/\b(\d{1,2}):?(\d{2})?\s*(am|pm)\b/i) ?? text.match(/\bat\s+(\d{1,2})(?::?(\d{2}))?\s*(am|pm)?\b/i);
  let hour: number | null = null;
  let minute = 0;
  if (timeMatch) {
    hour = parseInt(timeMatch[1], 10);
    minute = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    const meridiem = timeMatch[3]?.toLowerCase();
    if (meridiem === "pm" && hour < 12) hour += 12;
    if (meridiem === "am" && hour === 12) hour = 0;
  }

  if (!date && hour !== null) {
    // Time only → today at that time. If already past, push to tomorrow.
    date = new Date(now);
    if (hour < now.getHours() || (hour === now.getHours() && minute <= now.getMinutes())) {
      date.setDate(date.getDate() + 1);
    }
  }

  if (!date) return null;
  if (hour !== null) {
    date.setHours(hour, minute, 0, 0);
  } else {
    // Default to noon if no time was given.
    date.setHours(12, 0, 0, 0);
  }
  return date.toISOString();
}
