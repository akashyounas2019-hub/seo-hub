/**
 * Thin client over the Chrome UX Report History API.
 *
 * Requires GOOGLE_CRUX_API_KEY in env. CrUX is free with a Google API key.
 * Returns the most recent 6 weeks of p75 metrics for origin + form factor.
 *
 * If the origin has no CrUX data (low traffic), the API returns 404 and we
 * return null so the cron can skip that site quietly.
 *
 * Docs: https://developer.chrome.com/docs/crux/history-api
 */

export interface CruxRecord {
  /** Week-ending date (YYYY-MM-DD). */
  date: string;
  formFactor: "PHONE" | "DESKTOP" | "TABLET" | "ALL_FORM_FACTORS";
  lcpP75Ms?: number;
  inpP75Ms?: number;
  clsP75?: number; // 0..1
  fcpP75Ms?: number;
  ttfbP75Ms?: number;
}

interface CruxApiResponse {
  record: {
    key: { origin?: string; url?: string; formFactor?: string };
    metrics: Record<string, {
      histogramTimeseries?: Array<{ start: number; end?: number; densities: number[] }>;
      percentilesTimeseries: { p75s: Array<number | null | string> };
    }>;
    collectionPeriods: Array<{ firstDate: { year: number; month: number; day: number }; lastDate: { year: number; month: number; day: number } }>;
  };
}

function ymd(d: { year: number; month: number; day: number }): string {
  return `${d.year.toString().padStart(4, "0")}-${d.month.toString().padStart(2, "0")}-${d.day.toString().padStart(2, "0")}`;
}

function toMs(v: number | string | null | undefined): number | undefined {
  if (v === null || v === undefined) return undefined;
  const n = typeof v === "string" ? parseFloat(v) : v;
  return Number.isFinite(n) ? Math.round(n) : undefined;
}

function toCls(v: number | string | null | undefined): number | undefined {
  if (v === null || v === undefined) return undefined;
  const n = typeof v === "string" ? parseFloat(v) : v;
  return Number.isFinite(n) ? Math.round(n * 1000) : undefined;
}

export async function fetchCruxHistory(opts: {
  origin: string;
  formFactor?: "PHONE" | "DESKTOP" | "TABLET";
  apiKey?: string;
}): Promise<CruxRecord[] | null> {
  const apiKey = opts.apiKey ?? process.env.GOOGLE_CRUX_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_CRUX_API_KEY not set");

  const body: Record<string, unknown> = {
    origin: opts.origin,
    metrics: [
      "largest_contentful_paint",
      "interaction_to_next_paint",
      "cumulative_layout_shift",
      "first_contentful_paint",
      "experimental_time_to_first_byte",
    ],
  };
  if (opts.formFactor) body.formFactor = opts.formFactor;

  const r = await fetch(
    `https://chromeuxreport.googleapis.com/v1/records:queryHistoryRecord?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    }
  );

  if (r.status === 404) return null; // no CrUX data for this origin
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`CrUX HTTP ${r.status}: ${text.slice(0, 200)}`);
  }

  const data = (await r.json()) as CruxApiResponse;
  const metrics = data.record.metrics ?? {};
  const periods = data.record.collectionPeriods ?? [];

  const lcp = metrics.largest_contentful_paint?.percentilesTimeseries.p75s ?? [];
  const inp = metrics.interaction_to_next_paint?.percentilesTimeseries.p75s ?? [];
  const cls = metrics.cumulative_layout_shift?.percentilesTimeseries.p75s ?? [];
  const fcp = metrics.first_contentful_paint?.percentilesTimeseries.p75s ?? [];
  const ttfb = metrics.experimental_time_to_first_byte?.percentilesTimeseries.p75s ?? [];

  const formFactor = (data.record.key.formFactor ?? "ALL_FORM_FACTORS") as CruxRecord["formFactor"];

  return periods.map((p, i) => ({
    date: ymd(p.lastDate),
    formFactor,
    lcpP75Ms: toMs(lcp[i]),
    inpP75Ms: toMs(inp[i]),
    clsP75: typeof cls[i] === "number" ? (cls[i] as number) : undefined,
    fcpP75Ms: toMs(fcp[i]),
    ttfbP75Ms: toMs(ttfb[i]),
  }));
}

// re-export helper for the cron route
export { toCls };
