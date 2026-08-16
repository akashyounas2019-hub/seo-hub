/**
 * V2 — External API validators.
 *
 * Run after V1 format checks. Use real network calls to verify the
 * agent's claims against ground truth.
 *
 * Phase 2 ships:
 *   - validateUrlsResolve()      — HEAD every URL in a proposal payload
 *   - validateSchemaUrlsResolve()— same but extracts URLs from JSON-LD
 *
 * Phase 2.1 (deferred until Google OAuth is wired with the service
 * account approach) ships:
 *   - validateRichResults()      — call Search Console Rich Results Test
 *     API with the JSON-LD; returns whether Google would actually surface
 *     the page in rich results.
 */
import type { ValidationResult } from "./seo-validators";

const PASS: ValidationResult = Object.freeze({ ok: true, errors: [], warnings: [] });

async function headOnce(url: string, timeoutMs: number): Promise<{ ok: boolean; status: number; error?: string }> {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.status === 405 || res.status === 501) {
      // Some servers refuse HEAD — fall back to a Range GET.
      const g = await fetch(url, {
        method: "GET",
        headers: { range: "bytes=0-0" },
        signal: AbortSignal.timeout(timeoutMs),
      });
      return { ok: g.status >= 200 && g.status < 400, status: g.status };
    }
    return { ok: res.status >= 200 && res.status < 400, status: res.status };
  } catch (err) {
    return { ok: false, status: 0, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Concurrently HEAD-check every URL in `urls`. Returns a single
 * ValidationResult — errors for each unreachable URL.
 *
 * Caps concurrency at 6 to avoid hammering small WP sites.
 */
export async function validateUrlsResolve(urls: string[], opts: { timeoutMs?: number } = {}): Promise<ValidationResult> {
  const t = opts.timeoutMs ?? 8_000;
  const unique = Array.from(new Set(urls.filter((u) => /^https?:\/\//.test(u))));
  if (unique.length === 0) return PASS;
  const errs: string[] = [];
  const warns: string[] = [];

  // Bounded concurrency — process in batches of 6.
  const concurrency = 6;
  for (let i = 0; i < unique.length; i += concurrency) {
    const batch = unique.slice(i, i + concurrency);
    const results = await Promise.all(batch.map((u) => headOnce(u, t)));
    results.forEach((r, idx) => {
      const url = batch[idx];
      if (!r.ok) {
        if (r.status === 0) errs.push(`url unreachable: ${truncate(url)} (${r.error ?? "network"})`);
        else if (r.status === 429) warns.push(`url rate-limited (429): ${truncate(url)}`);
        else errs.push(`url returned ${r.status}: ${truncate(url)}`);
      }
    });
  }
  return errs.length > 0 ? { ok: false, errors: errs, warnings: warns } : warns.length > 0 ? { ok: true, errors: [], warnings: warns } : PASS;
}

/**
 * Walk a parsed JSON-LD object and collect every URL value. Then HEAD-check
 * them all. Catches schema blocks that reference 404'd images or moved pages.
 */
export async function validateSchemaUrlsResolve(jsonLd: string): Promise<ValidationResult> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonLd);
  } catch {
    // V1 would have caught this — be defensive but don't double-report.
    return PASS;
  }
  const urls: string[] = [];
  walkForUrls(parsed, urls);
  return validateUrlsResolve(urls, { timeoutMs: 6_000 });
}

function walkForUrls(node: unknown, out: string[]): void {
  if (node === null || node === undefined) return;
  if (typeof node === "string") {
    if (/^https?:\/\//.test(node)) out.push(node);
    return;
  }
  if (Array.isArray(node)) {
    for (const x of node) walkForUrls(x, out);
    return;
  }
  if (typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      // Skip @context — schema.org is the only URL there and we don't
      // need to verify it every time.
      if (k === "@context") continue;
      walkForUrls(v, out);
    }
  }
}

function truncate(s: string): string {
  return s.length > 60 ? s.slice(0, 57) + "…" : s;
}
