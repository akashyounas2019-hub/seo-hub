/**
 * GSC URL Inspection API. Returns the authoritative index status + reason
 * for a single URL, using the site's stored Google OAuth token.
 *
 * Quota: 2000 inspections/day/property, 600/min. We stay well under by
 * only inspecting sitemap URLs once/day and capping per-run.
 *
 * Returns null if Google isn't connected for the site (caller falls back
 * to the site: query method).
 */
import { getValidGoogleToken } from "@/lib/google-oauth";
export interface InspectResult {
  /** Normalised state used across the dashboard. */
  indexState:
    | "indexed"
    | "not_indexed"
    | "crawled_not_indexed"
    | "discovered"
    | "duplicate"
    | "excluded"
    | "unknown";
  /** Raw GSC coverageState string. */
  coverageState: string | null;
  verdict: string | null;
  lastCrawlAt: Date | null;
}

function normalise(coverageState: string | null, verdict: string | null): InspectResult["indexState"] {
  const c = (coverageState ?? "").toLowerCase();
  if (c.includes("submitted and indexed") || c.includes("indexed, not submitted") || (verdict === "PASS" && c.includes("indexed"))) {
    return "indexed";
  }
  if (c.includes("crawled - currently not indexed") || c.includes("crawled – currently not indexed")) return "crawled_not_indexed";
  if (c.includes("discovered - currently not indexed") || c.includes("discovered – currently not indexed")) return "discovered";
  if (c.includes("duplicate")) return "duplicate";
  if (c.includes("excluded") || c.includes("noindex") || c.includes("blocked") || c.includes("redirect")) return "excluded";
  if (c.includes("not indexed") || verdict === "FAIL") return "not_indexed";
  if (!coverageState) return "unknown";
  return "not_indexed";
}

/** Inspect one URL. Caller supplies a pre-fetched token + resolved siteUrl property. */
export async function inspectUrl(opts: {
  token: string;
  siteUrl: string; // "sc-domain:domain" or "https://domain/"
  inspectionUrl: string;
}): Promise<InspectResult | "property_mismatch" | "error"> {
  try {
    const r = await fetch("https://searchconsole.googleapis.com/v1/urlInspection/index:inspect", {
      method: "POST",
      headers: { Authorization: `Bearer ${opts.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ inspectionUrl: opts.inspectionUrl, siteUrl: opts.siteUrl }),
      signal: AbortSignal.timeout(15_000),
    });
    if (r.status === 403 || r.status === 404) return "property_mismatch";
    if (!r.ok) return "error";
    const data = (await r.json()) as {
      inspectionResult?: {
        indexStatusResult?: { verdict?: string; coverageState?: string; lastCrawlTime?: string };
      };
    };
    const isr = data.inspectionResult?.indexStatusResult;
    const coverageState = isr?.coverageState ?? null;
    const verdict = isr?.verdict ?? null;
    return {
      indexState: normalise(coverageState, verdict),
      coverageState,
      verdict,
      lastCrawlAt: isr?.lastCrawlTime ? new Date(isr.lastCrawlTime) : null,
    };
  } catch {
    return "error";
  }
}

/** Resolve which GSC property form works for a site (sc-domain vs https). Returns null if neither. */
export async function resolveProperty(token: string, domain: string): Promise<string | null> {
  for (const siteUrl of [`sc-domain:${domain}`, `https://${domain}/`]) {
    // A cheap inspect of the homepage tells us if the property is accessible.
    const res = await inspectUrl({ token, siteUrl, inspectionUrl: `https://${domain}/` });
    if (res !== "property_mismatch" && res !== "error") return siteUrl;
  }
  return null;
}

/**
 * Get a Google access token for a site, or null if Google isn't connected.
 * Reads the encrypted token stored in `integrations_accounts` (provider =
 * 'google'), refreshing it first if it's expired. Falls back to the public
 * HTTP-probe detection method (in sync.ts) when this returns null.
 */
export async function tokenForSite(siteId: string): Promise<string | null> {
  return getValidGoogleToken(siteId);
}
