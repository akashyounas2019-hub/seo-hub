/**
 * Keyword research — PROXY CLIENT.
 *
 * This distributed codebase has NO SEMrush API key. All keyword research goes
 * through the hosted Factory proxy (FACTORY_API_URL + FACTORY_TOKEN), which
 * holds the SEMrush key server-side. So users can run research THROUGH the
 * factory but can never see or reuse the key elsewhere.
 *
 *   FACTORY_API_URL   e.g. http://localhost:3001   (no trailing slash needed)
 *   FACTORY_TOKEN     bearer token shipped in .env (rotatable by the operator)
 *
 * Returns the same scored + clustered shape the UI + content-brief engine expect.
 */
const PROXY_BASE = (process.env.FACTORY_API_URL || "").replace(/\/+$/, "");
const PROXY_TOKEN = process.env.FACTORY_TOKEN || "";
const PROXY_PATH = "/api/factory/keyword-research";

export type KeywordIntent = "informational" | "navigational" | "commercial" | "transactional";

export interface SemrushKeyword {
  keyword: string;
  volume: number | null;
  cpc: number | null;
  competition: number | null;
  difficulty: number | null;
  intent: KeywordIntent;
  /** True when `intent` came from SEMrush's Intent column (vs the text heuristic). */
  intentFromSemrush: boolean;
  opportunity: number;
  source: "seed" | "related" | "broad" | "question";
}
export interface SemrushCluster {
  head: string;
  vol: number;
  keywords: SemrushKeyword[];
}
export interface SemrushResult {
  ok: boolean;
  error?: string;
  seed: string;
  db: string;
  keywords: SemrushKeyword[];
  clusters: SemrushCluster[];
  notes: string[];
}

/**
 * The bridge from search INTENT → content strategy. Single source of truth used
 * by the Keywords page (intent mix + legend) AND the content-brief engine
 * (which page type + angle to write).
 */
export const INTENT_META: Record<
  KeywordIntent,
  {
    label: string;
    /** what the searcher actually wants */
    wants: string;
    /** the page type this intent should become */
    pageType: string;
    /** how to write it */
    angle: string;
    /** Pill/badge tone in the UI */
    tone: "info" | "warning" | "success" | "accent";
  }
> = {
  informational: {
    label: "Informational",
    wants: "Researching — wants an answer or how-to",
    pageType: "Blog · FAQ · guide",
    angle: "Answer-first capsule (H2-as-question → TLDR → detail → source). Educate, don't hard-sell.",
    tone: "info",
  },
  commercial: {
    label: "Commercial",
    wants: "Comparing options before they buy",
    pageType: "Pricing · comparison · “best of”",
    angle: "Costs, comparisons, what-to-look-for, trust signals → soft CTA.",
    tone: "warning",
  },
  transactional: {
    label: "Transactional",
    wants: "Ready to book or hire now",
    pageType: "Service · area · booking page",
    angle: "Clear offer + “from $X” + booking form/CTA above the fold.",
    tone: "success",
  },
  navigational: {
    label: "Navigational",
    wants: "Looking for a specific brand or site",
    pageType: "Home · brand · contact",
    angle: "Own your brand SERP — NAP, hours, Organization schema.",
    tone: "accent",
  },
};

export const INTENT_ORDER: KeywordIntent[] = ["transactional", "commercial", "informational", "navigational"];

/** Configured when the Factory proxy URL + token are present. */
export function hasSemrushKey(): boolean {
  return PROXY_BASE.length > 0 && PROXY_TOKEN.length > 0;
}

/**
 * Keyword research via the hosted Factory proxy. Same call shape as before
 * (seed, db, limit) → SemrushResult. The proxy does the SEMrush call + scoring
 * + clustering server-side and returns the finished result.
 */
export async function researchKeywords(
  seedRaw: string,
  db = "us",
  limit = 60,
): Promise<SemrushResult> {
  const seed = (seedRaw || "").trim();
  const base: SemrushResult = { ok: false, seed, db, keywords: [], clusters: [], notes: [] };
  if (!hasSemrushKey()) {
    return { ...base, error: "keyword research not configured — set FACTORY_API_URL + FACTORY_TOKEN in .env" };
  }
  if (!seed) return { ...base, error: "missing-seed" };

  try {
    const r = await fetch(`${PROXY_BASE}${PROXY_PATH}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${PROXY_TOKEN}`,
      },
      body: JSON.stringify({ seed, db, limit }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!r.ok) {
      let reason = `proxy ${r.status}`;
      try {
        const j = (await r.json()) as { error?: string };
        if (j?.error) reason = j.error;
      } catch {
        /* ignore */
      }
      return { ...base, error: reason };
    }
    const data = (await r.json()) as SemrushResult;
    // Trust the proxy's shape; backfill anything missing so the UI never crashes.
    return {
      ok: !!data.ok,
      seed: data.seed ?? seed,
      db: data.db ?? db,
      keywords: Array.isArray(data.keywords) ? data.keywords : [],
      clusters: Array.isArray(data.clusters) ? data.clusters : [],
      notes: Array.isArray(data.notes) ? data.notes : [],
      error: data.error,
    };
  } catch (err) {
    return { ...base, error: err instanceof Error ? err.message : "proxy-request-failed" };
  }
}

/**
 * Domain overview is not exposed through the Factory proxy (keyword research
 * only). Returns a graceful empty result so callers don't break.
 */
export async function domainOverview(
  _domain: string,
  _db = "us",
): Promise<{ rank: number | null; organicTraffic: number | null; error?: string }> {
  return { rank: null, organicTraffic: null, error: "domain-overview-not-available-in-factory" };
}
