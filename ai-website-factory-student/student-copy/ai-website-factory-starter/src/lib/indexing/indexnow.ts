/**
 * IndexNow submission. Pushes a batch of URLs to the IndexNow endpoint,
 * which fans out to Bing + Yandex (and Google ingests IndexNow data).
 *
 * Requires:
 *   - GYL_INDEXNOW_KEY env: a 8–128 char hex key, reused across all sites.
 *   - The key served at https://<domain>/<key>.txt (gyl-bookings plugin route).
 *
 * Honest expectation: this accelerates *discovery* (especially Bing/Yandex).
 * It does NOT override Google's quality judgments — a "Crawled - currently
 * not indexed" page won't flip just because we pinged IndexNow.
 *
 * IndexNow accepts up to 10,000 URLs per request; we cap at 100 to keep
 * each call snappy and within the per-site daily cadence.
 */
const MAX_PER_REQUEST = 100;

export interface IndexNowResult {
  ok: boolean;
  status: number;
  submitted: number;
  error?: string;
}

export function getIndexNowKey(): string | null {
  const k = process.env.GYL_INDEXNOW_KEY;
  if (!k || k.length < 8) return null;
  return k;
}

export async function submitIndexNow(domain: string, urls: string[]): Promise<IndexNowResult> {
  const key = getIndexNowKey();
  if (!key) return { ok: false, status: 0, submitted: 0, error: "GYL_INDEXNOW_KEY not set" };
  if (urls.length === 0) return { ok: true, status: 200, submitted: 0 };

  const batch = urls.slice(0, MAX_PER_REQUEST);
  const body = {
    host: domain,
    key,
    keyLocation: `https://${domain}/${key}.txt`,
    urlList: batch,
  };

  try {
    const r = await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    // IndexNow returns 200 (accepted) or 202 (accepted, pending). 4xx = key/host problem.
    const ok = r.status === 200 || r.status === 202;
    return {
      ok,
      status: r.status,
      submitted: ok ? batch.length : 0,
      error: ok ? undefined : `HTTP ${r.status}`,
    };
  } catch (e) {
    return { ok: false, status: 0, submitted: 0, error: (e as Error).message };
  }
}

/** Verify the key file is actually being served on a site (pre-flight). */
export async function verifyKeyFile(domain: string): Promise<boolean> {
  const key = getIndexNowKey();
  if (!key) return false;
  try {
    const r = await fetch(`https://${domain}/${key}.txt`, { signal: AbortSignal.timeout(8_000) });
    if (!r.ok) return false;
    const txt = (await r.text()).trim();
    return txt === key;
  } catch {
    return false;
  }
}
