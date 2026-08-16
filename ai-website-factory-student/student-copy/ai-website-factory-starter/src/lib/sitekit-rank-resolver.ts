/**
 * G8 — Rank resolver via Site Kit (plugin endpoint).
 *
 * Replaces the old platform-OAuth GSC path. Each WP site has Google Site Kit
 * already connected to its own GSC property; the gyl-bookings plugin exposes
 * `POST /wp-json/gyl-bookings/v1/keyword-ranks` which queries Site Kit's GSC
 * client server-side (after wp_set_current_user as the linked admin) and
 * returns per-keyword position + landing URL.
 *
 * Auth: same HMAC scheme as every other plugin endpoint —
 *   sig = hex(hmac_sha256(secret, `${timestamp}.${body}`))
 * with X-GYL-{Key-Id,Timestamp,Signature,Idempotency-Key} headers.
 */
import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { apiKeys } from "@/db/schema";

type KeywordInput = { id: string; keyword: string; targetUrl: string | null };
export type RankReading = {
  trackedKeywordId: string;
  position: number | null;
  url: string | null;
  source: "gsc" | "scrape";
  raw: unknown;
};

export type SiteKitRankResult =
  | { ok: true; readings: RankReading[] }
  | { ok: false; reason: string };

async function getActiveKey(siteId: string) {
  const [row] = await db().select()
    .from(apiKeys)
    .where(and(eq(apiKeys.siteId, siteId), eq(apiKeys.active, true)))
    .limit(1);
  return row;
}

export async function resolveRanksViaSiteKit(opts: {
  siteId: string;
  domain: string;
  keywords: KeywordInput[];
  days?: number;
}): Promise<SiteKitRankResult> {
  const key = await getActiveKey(opts.siteId);
  if (!key) return { ok: false, reason: "no-active-hmac-key" };

  const url = `https://${opts.domain}/wp-json/gyl-bookings/v1/keyword-ranks`;
  const body = JSON.stringify({
    keywords: opts.keywords.map((k) => k.keyword),
    days: opts.days ?? 7,
  });
  const ts = Math.floor(Date.now() / 1000).toString();
  const sig = crypto.createHmac("sha256", key.secret).update(`${ts}.${body}`).digest("hex");
  const idem = crypto.randomUUID();

  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-GYL-Key-Id": key.keyId,
        "X-GYL-Timestamp": ts,
        "X-GYL-Signature": sig,
        "X-GYL-Idempotency-Key": idem,
      },
      body,
    });
  } catch (err) {
    return { ok: false, reason: `fetch-failed: ${err instanceof Error ? err.message : String(err)}` };
  }

  const text = await resp.text();
  if (!resp.ok) {
    return { ok: false, reason: `http-${resp.status}: ${text.slice(0, 200)}` };
  }

  let parsed: { ok?: boolean; error?: string; readings?: Array<{ keyword: string; position: number | null; url: string | null; impressions?: number }> };
  try { parsed = JSON.parse(text); }
  catch { return { ok: false, reason: `bad-json: ${text.slice(0, 200)}` }; }
  if (!parsed.ok || !Array.isArray(parsed.readings)) {
    return { ok: false, reason: parsed.error ?? "plugin-error" };
  }

  // Map plugin output back to our trackedKeywordId.
  const byKeyword = new Map(parsed.readings.map((r) => [r.keyword.toLowerCase(), r]));
  const readings: RankReading[] = opts.keywords.map((kw) => {
    const r = byKeyword.get(kw.keyword.toLowerCase());
    return {
      trackedKeywordId: kw.id,
      position: r?.position ?? null,
      url: r?.url ?? null,
      source: "gsc",
      raw: r ?? { note: "no-row-from-plugin" },
    };
  });
  return { ok: true, readings };
}
