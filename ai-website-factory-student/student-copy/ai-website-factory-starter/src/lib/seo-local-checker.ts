/**
 * Local SEO checker — NAP (Name / Address / Phone) consistency.
 *
 * Extracts phone numbers + addresses from each page's HTML and flags:
 *   - Pages with no NAP at all (missing trust signal)
 *   - Conflicts: two different phones / addresses across pages of the same site
 *
 * Deterministic, regex-based. The phone normalizer strips formatting so
 * "+1 416-555-0188" and "(416) 555 0188" compare equal.
 */

export interface NapExtracted {
  phones: string[];          // normalized to digits
  addressFragments: string[];
}

export function extractNap(html: string): NapExtracted {
  const phones = new Set<string>();
  // Match phone-shaped tokens: optional country code, then 10 digits with various separators.
  const phoneRe = /(\+?1[\s.\-)]*)?\(?([2-9]\d{2})\)?[\s.\-]*(\d{3})[\s.\-]*(\d{4})\b/g;
  let m: RegExpExecArray | null;
  while ((m = phoneRe.exec(html)) !== null) {
    const digits = `${m[2]}${m[3]}${m[4]}`;
    if (digits.length === 10) phones.add(digits);
  }

  // Address fragments — anything with a postal-code-shaped token nearby.
  // Canadian: A1A 1A1. US: 5 digits or 5+4. We grab a 200-char window around the match.
  const addresses = new Set<string>();
  const postalRe = /\b([A-CEGHJ-NPRSTVXY]\d[A-CEGHJ-NPRSTV-Z][\s-]?\d[A-CEGHJ-NPRSTV-Z]\d|\d{5}(-\d{4})?)\b/gi;
  while ((m = postalRe.exec(html)) !== null) {
    const start = Math.max(0, m.index - 60);
    const end = Math.min(html.length, m.index + 60);
    const window = html.slice(start, end).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (window.length < 200) addresses.add(window);
  }

  return {
    phones: Array.from(phones),
    addressFragments: Array.from(addresses).slice(0, 6),
  };
}

export interface NapConsistencyFinding {
  code: string;
  severity: "info" | "low" | "medium" | "high";
  summary: string;
  detail?: Record<string, unknown>;
}

/** Compare NAP across a collection of pages. */
export function checkNapConsistency(pageNaps: Array<{ url: string; nap: NapExtracted }>): NapConsistencyFinding[] {
  const out: NapConsistencyFinding[] = [];
  if (pageNaps.length === 0) return out;

  const allPhones = new Map<string, string[]>();    // phone → urls
  const noPhonePages: string[] = [];
  for (const p of pageNaps) {
    if (p.nap.phones.length === 0) {
      noPhonePages.push(p.url);
      continue;
    }
    for (const ph of p.nap.phones) {
      const arr = allPhones.get(ph) ?? [];
      arr.push(p.url);
      allPhones.set(ph, arr);
    }
  }

  if (allPhones.size > 1) {
    out.push({
      code: "nap-phone-mismatch",
      severity: "high",
      summary: `${allPhones.size} different phone numbers in use across the site`,
      detail: { phones: Array.from(allPhones.entries()).map(([phone, urls]) => ({ phone, count: urls.length })) },
    });
  }
  if (noPhonePages.length > pageNaps.length / 2) {
    out.push({
      code: "nap-phone-missing",
      severity: "medium",
      summary: `${noPhonePages.length}/${pageNaps.length} pages have no visible phone number — major local-SEO trust gap`,
      detail: { sample_urls: noPhonePages.slice(0, 5) },
    });
  }
  return out;
}
