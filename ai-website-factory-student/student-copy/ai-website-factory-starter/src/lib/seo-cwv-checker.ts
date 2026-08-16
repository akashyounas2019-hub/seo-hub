/**
 * Core Web Vitals fetcher — Google PageSpeed Insights v5 + CrUX field data.
 *
 * Uses the free PSI API: 25,000 requests/day per project, no auth (with
 * a key it raises the daily quota). The platform reads
 * `org_settings.publicBaseUrl` for the request `&category=performance`
 * and parses lab + field metrics from the response.
 *
 * No SaaS — the PSI API is a free Google product (not a paid subscription).
 */

import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { psiLabCache } from "@/db/schema";

export interface CwvSnapshot {
  url: string;
  strategy: "mobile" | "desktop";
  lab: {
    lcp: number | null;     // ms
    inp: number | null;     // ms (or interaction-to-next-paint replacement)
    cls: number | null;
    performance: number | null;  // 0–100
    // Lab proxies for INP. Lighthouse does NOT emit INP (it's a field-only
    // metric that needs real user interactions). TBT is the accepted lab
    // stand-in: high main-thread blocking → slow interaction response.
    tbt: number | null;     // ms — Total Blocking Time
    bootup: number | null;  // ms — JS bootup-time (script eval/parse cost)
  };
  field: {
    lcp: number | null;
    inp: number | null;
    cls: number | null;
  };
  fetchedAt: string;
  error?: string;
}

const PSI_BASE = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

/**
 * Fetch a PageSpeed Insights run for a URL. Optional API key boosts the
 * quota; without it we still get ~25 free requests/day.
 */
export async function fetchCwv(url: string, strategy: "mobile" | "desktop" = "mobile", apiKey?: string): Promise<CwvSnapshot> {
  const params = new URLSearchParams({
    url,
    strategy,
    category: "performance",
  });
  if (apiKey) params.set("key", apiKey);

  const snapshot: CwvSnapshot = {
    url,
    strategy,
    lab: { lcp: null, inp: null, cls: null, performance: null, tbt: null, bootup: null },
    field: { lcp: null, inp: null, cls: null },
    fetchedAt: new Date().toISOString(),
  };

  try {
    const res = await fetch(`${PSI_BASE}?${params.toString()}`, {
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) {
      snapshot.error = `psi-http-${res.status}`;
      return snapshot;
    }
    const json = await res.json() as PsiResponse;
    const audits = json.lighthouseResult?.audits ?? {};
    snapshot.lab.lcp = numericValue(audits["largest-contentful-paint"]);
    snapshot.lab.inp = numericValue(audits["interactive"]) ?? numericValue(audits["interaction-to-next-paint"]);
    snapshot.lab.cls = numericValue(audits["cumulative-layout-shift"]);
    const perfScore = json.lighthouseResult?.categories?.performance?.score;
    snapshot.lab.performance = typeof perfScore === "number" ? Math.round(perfScore * 100) : null;
    // INP lab proxies: Total Blocking Time + JS bootup time.
    snapshot.lab.tbt = numericValue(audits["total-blocking-time"]);
    snapshot.lab.bootup = numericValue(audits["bootup-time"]);
    const lo = json.loadingExperience?.metrics;
    if (lo) {
      snapshot.field.lcp = (lo.LARGEST_CONTENTFUL_PAINT_MS?.percentile ?? null);
      snapshot.field.inp = (lo.INTERACTION_TO_NEXT_PAINT?.percentile ?? null);
      snapshot.field.cls = (lo.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile ?? null);
      // CrUX reports CLS as integer (multiplied by 100) — normalize.
      if (snapshot.field.cls !== null && snapshot.field.cls > 1) snapshot.field.cls = snapshot.field.cls / 100;
    }
  } catch (err) {
    snapshot.error = err instanceof Error ? err.message : String(err);
  }
  return snapshot;
}

const LAB_CACHE_TTL_MS = 12 * 3600_000; // 12h — lab data is synthetic, doesn't need to be fresher

/**
 * Cached wrapper around fetchCwv(). Reads psi_lab_cache first; only calls
 * PageSpeed Insights when the cached row is missing or older than the TTL.
 * This is what stops /admin/cwv (looping over every site x 2 pages) and
 * Tech Watchdog from re-hitting PSI's rate limit on every page load.
 */
export async function fetchCwvCached(
  url: string,
  strategy: "mobile" | "desktop" = "mobile",
  apiKey?: string,
): Promise<CwvSnapshot> {
  const [cached] = await db()
    .select()
    .from(psiLabCache)
    .where(sql`${psiLabCache.url} = ${url} and ${psiLabCache.strategy} = ${strategy}`)
    .limit(1);

  if (cached && Date.now() - cached.fetchedAt.getTime() < LAB_CACHE_TTL_MS) {
    return {
      url,
      strategy,
      lab: {
        lcp: cached.lcpMs,
        inp: null,
        cls: cached.clsRaw != null ? cached.clsRaw / 1000 : null,
        performance: cached.performance,
        tbt: cached.tbtMs,
        bootup: null,
      },
      field: { lcp: null, inp: null, cls: null },
      fetchedAt: cached.fetchedAt.toISOString(),
      error: cached.error ?? undefined,
    };
  }

  const fresh = await fetchCwv(url, strategy, apiKey);

  await db()
    .insert(psiLabCache)
    .values({
      url,
      strategy,
      lcpMs: fresh.lab.lcp,
      clsRaw: fresh.lab.cls != null ? Math.round(fresh.lab.cls * 1000) : null,
      tbtMs: fresh.lab.tbt,
      performance: fresh.lab.performance,
      error: fresh.error ?? null,
      fetchedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [psiLabCache.url, psiLabCache.strategy],
      set: {
        lcpMs: fresh.lab.lcp,
        clsRaw: fresh.lab.cls != null ? Math.round(fresh.lab.cls * 1000) : null,
        tbtMs: fresh.lab.tbt,
        performance: fresh.lab.performance,
        error: fresh.error ?? null,
        fetchedAt: new Date(),
      },
    });

  return fresh;
}

function numericValue(audit: unknown): number | null {
  if (!audit || typeof audit !== "object") return null;
  const v = (audit as { numericValue?: unknown }).numericValue;
  return typeof v === "number" ? v : null;
}

// ─── narrow types for the PSI v5 response we read ──────────────────────
interface PsiResponse {
  lighthouseResult?: {
    audits?: Record<string, unknown>;
    categories?: { performance?: { score?: number } };
  };
  loadingExperience?: {
    metrics?: {
      LARGEST_CONTENTFUL_PAINT_MS?: { percentile?: number };
      INTERACTION_TO_NEXT_PAINT?: { percentile?: number };
      CUMULATIVE_LAYOUT_SHIFT_SCORE?: { percentile?: number };
    };
  };
}

export interface CwvFinding {
  code: string;
  severity: "info" | "low" | "medium" | "high";
  summary: string;
  detail?: Record<string, unknown>;
}

export function evaluateCwv(snapshot: CwvSnapshot): CwvFinding[] {
  const out: CwvFinding[] = [];
  if (snapshot.error) {
    out.push({ code: "cwv-error", severity: "info", summary: `PSI fetch failed: ${snapshot.error}` });
    return out;
  }
  // Targets (mobile field data — what Google ranks on):
  //   LCP < 2.5s, INP < 200ms, CLS < 0.1
  const lcp = snapshot.field.lcp ?? snapshot.lab.lcp;
  const inp = snapshot.field.inp ?? snapshot.lab.inp;
  const cls = snapshot.field.cls ?? snapshot.lab.cls;
  if (lcp !== null && lcp > 4000) {
    out.push({ code: "cwv-lcp-poor", severity: "high", summary: `LCP ${(lcp / 1000).toFixed(1)}s — well over 2.5s target`, detail: { lcp } });
  } else if (lcp !== null && lcp > 2500) {
    out.push({ code: "cwv-lcp-needs-improvement", severity: "medium", summary: `LCP ${(lcp / 1000).toFixed(1)}s — over 2.5s target`, detail: { lcp } });
  }
  if (inp !== null && inp > 500) {
    out.push({ code: "cwv-inp-poor", severity: "high", summary: `INP ${inp.toFixed(0)}ms — well over 200ms target`, detail: { inp } });
  } else if (inp !== null && inp > 200) {
    out.push({ code: "cwv-inp-needs-improvement", severity: "medium", summary: `INP ${inp.toFixed(0)}ms — over 200ms target`, detail: { inp } });
  }
  if (cls !== null && cls > 0.25) {
    out.push({ code: "cwv-cls-poor", severity: "high", summary: `CLS ${cls.toFixed(2)} — well over 0.1 target`, detail: { cls } });
  } else if (cls !== null && cls > 0.1) {
    out.push({ code: "cwv-cls-needs-improvement", severity: "medium", summary: `CLS ${cls.toFixed(2)} — over 0.1 target`, detail: { cls } });
  }
  // LAB INP proxy via Total Blocking Time. Only emit when CrUX has NO field
  // INP — for low-traffic local sites CrUX 404s, so TBT is the only INP
  // signal we get. This is a LAB PROXY, not field INP (see checkLabInp).
  if (snapshot.field.inp === null && snapshot.lab.tbt !== null) {
    const verdict = tbtToInpRisk(snapshot.lab.tbt);
    if (verdict.inpRisk === "poor") {
      out.push({ code: "cwv-inp-lab-poor", severity: "high", summary: `Lab INP risk POOR — TBT ${snapshot.lab.tbt.toFixed(0)}ms (proxy; no CrUX field INP)`, detail: { tbt: snapshot.lab.tbt, bootup: snapshot.lab.bootup } });
    } else if (verdict.inpRisk === "needs-improvement") {
      out.push({ code: "cwv-inp-lab-needs-improvement", severity: "medium", summary: `Lab INP risk NEEDS WORK — TBT ${snapshot.lab.tbt.toFixed(0)}ms (proxy; no CrUX field INP)`, detail: { tbt: snapshot.lab.tbt, bootup: snapshot.lab.bootup } });
    }
  }
  return out;
}

// ─── LAB INP proxy ─────────────────────────────────────────────────────
//
// WHY THIS EXISTS: Google CrUX (the field-data source the /admin/cwv page
// reads) has NO data for low-traffic local sites — the History API 404s.
// INP is the most-failed Core Web Vital, but with no field data it's
// invisible. Lighthouse lab runs do NOT emit INP directly (INP requires
// real user interactions). The accepted lab stand-in is Total Blocking
// Time (TBT): both measure main-thread unresponsiveness, so a high TBT
// reliably predicts a poor field INP once traffic arrives. We surface TBT
// as an INP RISK signal so operators can catch a slow booking widget early.
//
// These are the standard Lighthouse TBT buckets (mobile):
//   TBT ≤ 200ms  → good
//   200–600ms    → needs-improvement
//   > 600ms      → poor

export interface LabInpResult {
  url: string;
  strategy: "mobile" | "desktop";
  tbtMs: number;
  bootupMs?: number;
  inpRisk: "good" | "needs-improvement" | "poor";
  /** Honest, human-readable caveat — this is a lab proxy, not field INP. */
  note: string;
  error?: string;
}

/** Map Total Blocking Time (ms) to an INP-risk verdict + caveat note. */
export function tbtToInpRisk(tbtMs: number): { inpRisk: LabInpResult["inpRisk"]; note: string } {
  const caveat = "Lab proxy for INP (Total Blocking Time) — CrUX field INP unavailable for low-traffic sites.";
  if (tbtMs <= 200) return { inpRisk: "good", note: `${caveat} TBT ${tbtMs.toFixed(0)}ms is in the good range (≤200ms).` };
  if (tbtMs <= 600) return { inpRisk: "needs-improvement", note: `${caveat} TBT ${tbtMs.toFixed(0)}ms suggests the page may struggle to hit INP <200ms (200–600ms band).` };
  return { inpRisk: "poor", note: `${caveat} TBT ${tbtMs.toFixed(0)}ms is high (>600ms) — likely poor INP; check heavy JS (e.g. the booking widget).` };
}

/**
 * Run a PageSpeed Insights lab check and return an INP-risk verdict derived
 * from Total Blocking Time. Reuses fetchCwv (same PSI call + API-key handling)
 * — the caller passes the existing `process.env.PSI_API_KEY` just like
 * runCwvForSite does. This is the LAB proxy companion to the CrUX field path.
 */
export async function checkLabInp(
  url: string,
  strategy: "mobile" | "desktop" = "mobile",
  apiKey?: string,
): Promise<LabInpResult> {
  const snap = await fetchCwvCached(url, strategy, apiKey);
  if (snap.error || snap.lab.tbt === null) {
    return {
      url,
      strategy,
      tbtMs: snap.lab.tbt ?? 0,
      bootupMs: snap.lab.bootup ?? undefined,
      inpRisk: "needs-improvement",
      note: snap.error
        ? `Could not measure lab INP proxy (PSI: ${snap.error}).`
        : "PSI returned no Total Blocking Time audit — cannot estimate INP risk.",
      error: snap.error ?? "no-tbt",
    };
  }
  const { inpRisk, note } = tbtToInpRisk(snap.lab.tbt);
  return {
    url,
    strategy,
    tbtMs: snap.lab.tbt,
    bootupMs: snap.lab.bootup ?? undefined,
    inpRisk,
    note,
  };
}
