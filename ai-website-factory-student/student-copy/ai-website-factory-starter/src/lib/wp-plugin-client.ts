/**
 * Platform → WP plugin HTTP client.
 *
 * Historically the GYL Suite plugin only POSTs *to* the platform (booking
 * events, traffic snapshots, etc.). Phase 6 inverts the direction so the
 * platform can apply SEO fixes on the WP side: alt-text writes, schema
 * injection, meta-tag updates, etc.
 *
 * The signing scheme mirrors the inbound `events/ingest` endpoint so the
 * plugin can reuse its existing HMAC verifier. We pull the per-site secret
 * from `api_keys` (same row the plugin already has) and sign:
 *
 *     X-GYL-Signature = hex(hmac_sha256(secret, timestamp + "." + body))
 *     X-GYL-Timestamp = unix-seconds
 *     X-GYL-Key-Id    = the public key id (also in api_keys)
 *
 * The plugin endpoint lives at `<site.domain>/wp-json/gyl-bookings/v1/seo-apply`.
 * GET requests (for inventory / read-only signed calls) use the same headers
 * with an empty body string.
 */
import { and, desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db, ensureSchema } from "@/db/client";
import { apiKeys, sites } from "@/db/schema";
import { sign, IDEMPOTENCY_HEADER, KEY_ID_HEADER, SIGNATURE_HEADER, TIMESTAMP_HEADER } from "./hmac";

export class WpPluginError extends Error {
  constructor(
    public readonly status: number,
    public readonly bodyText: string,
    public readonly reason: string,
  ) {
    super(`WP plugin call failed (${status} ${reason}): ${bodyText.slice(0, 200)}`);
    this.name = "WpPluginError";
  }
}

export class WpPluginNotConfiguredError extends Error {
  constructor(siteSlug: string) {
    super(`Site '${siteSlug}' has no active api_keys row — cannot reach plugin.`);
    this.name = "WpPluginNotConfiguredError";
  }
}

interface SiteAuth {
  siteId: string;
  siteSlug: string;
  siteDomain: string;
  keyId: string;
  secret: string;
}

/**
 * Resolve a site's (key_id, secret) pair. Picks the newest active row from
 * `api_keys`. The plugin stores the same pair in its WP-side settings, so
 * the signature can be verified inbound.
 */
async function loadSiteAuth(siteId: string): Promise<SiteAuth> {
  await ensureSchema();
  const [row] = await db()
    .select({
      siteId: sites.id,
      siteSlug: sites.slug,
      siteDomain: sites.domain,
      keyId: apiKeys.keyId,
      secret: apiKeys.secret,
    })
    .from(apiKeys)
    .innerJoin(sites, eq(sites.id, apiKeys.siteId))
    .where(and(eq(apiKeys.siteId, siteId), eq(apiKeys.active, true)))
    .orderBy(desc(apiKeys.createdAt))
    .limit(1);
  if (!row) {
    throw new WpPluginNotConfiguredError(siteId);
  }
  return row;
}

function pluginBaseUrl(domain: string): string {
  // Plugin REST namespace: /wp-json/gyl-bookings/v1
  const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return `https://${cleanDomain}/wp-json/gyl-bookings/v1`;
}

interface CallOptions {
  method?: "GET" | "POST";
  path: string;                   // e.g. "/seo-apply"
  body?: Record<string, unknown>; // omitted for GET
  idempotencyKey?: string;        // auto-generated if absent
  timeoutMs?: number;             // default 30s
}

/**
 * Make a signed call to the WP plugin. Caller handles parsing the response.
 *
 * Failure modes:
 *   - Network/DNS error → WpPluginError(0, "", "network")
 *   - Plugin reachable but returned non-2xx → WpPluginError(status, body, "http")
 *   - Plugin returned 2xx but body isn't JSON → WpPluginError(status, body, "not-json")
 */
export async function callPlugin<TResult = Record<string, unknown>>(
  siteId: string,
  opts: CallOptions,
): Promise<TResult> {
  const auth = await loadSiteAuth(siteId);
  const url = pluginBaseUrl(auth.siteDomain) + opts.path;
  const bodyText = opts.body ? JSON.stringify(opts.body) : "";
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = sign({ secret: auth.secret, timestamp, body: bodyText });
  const idempotencyKey = opts.idempotencyKey ?? randomUUID();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), opts.timeoutMs ?? 30_000);

  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? "POST",
      headers: {
        "content-type": "application/json",
        [KEY_ID_HEADER]: auth.keyId,
        [TIMESTAMP_HEADER]: timestamp,
        [SIGNATURE_HEADER]: signature,
        [IDEMPOTENCY_HEADER]: idempotencyKey,
      },
      body: opts.method === "GET" ? undefined : bodyText,
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    const reason = err instanceof Error && err.name === "AbortError" ? "timeout" : "network";
    const msg = err instanceof Error ? err.message : String(err);
    throw new WpPluginError(0, msg, reason);
  }
  clearTimeout(timeoutId);

  const responseText = await res.text();
  if (!res.ok) {
    throw new WpPluginError(res.status, responseText, "http");
  }
  try {
    return JSON.parse(responseText) as TResult;
  } catch {
    throw new WpPluginError(res.status, responseText, "not-json");
  }
}
