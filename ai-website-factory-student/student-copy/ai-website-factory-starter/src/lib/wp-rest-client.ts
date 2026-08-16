/**
 * WP REST client — uses the credential vault to talk to any WP site.
 *
 * Auth precedence:
 *   1. Active `wp_app_password` row in site_credentials → HTTP Basic
 *   2. (Future) other kinds (cpanel, ssh) go through other lib clients
 *
 * Every call returns { ok, status, data | error }. Never throws on 4xx —
 * callers handle status explicitly. Throws only on network failure.
 */
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { siteCredentials, sites } from "@/db/schema";
import { decrypt } from "@/lib/crypto";

export type WpFetchResult<T = unknown> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string; data?: unknown };

export class WpCredsMissingError extends Error {
  constructor(public siteId: string) {
    super(`No active wp_app_password credential for site ${siteId}`);
  }
}

/** Decoded creds for a site — used internally + by verify actions. */
async function loadActiveCreds(siteId: string) {
  const [row] = await db()
    .select()
    .from(siteCredentials)
    .where(and(
      eq(siteCredentials.siteId, siteId),
      eq(siteCredentials.kind, "wp_app_password"),
      isNull(siteCredentials.revokedAt),
    ))
    .limit(1);
  if (!row) throw new WpCredsMissingError(siteId);
  const password = decrypt(row.secretCiphertext);
  return { row, username: row.username, password };
}

async function loadSiteUrl(siteId: string): Promise<string> {
  const [s] = await db().select({ domain: sites.domain }).from(sites).where(eq(sites.id, siteId)).limit(1);
  if (!s) throw new Error(`site ${siteId} not found`);
  // Strip trailing slash; the path we prepend always starts with /.
  return `https://${s.domain.replace(/\/+$/, "")}`;
}

/**
 * Call any WP REST endpoint authenticated as the stored app password user.
 *
 * Example:
 *   const r = await wpFetch<{ id: number }>(siteId, "/wp-json/wp/v2/posts/42", { method: "POST", body: { title: "New" } });
 */
export async function wpFetch<T = unknown>(
  siteId: string,
  path: string,
  opts: { method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; body?: unknown; query?: Record<string, string | number | boolean> } = {},
): Promise<WpFetchResult<T>> {
  const { username, password } = await loadActiveCreds(siteId);
  const base = await loadSiteUrl(siteId);
  const url = new URL(`${base}${path.startsWith("/") ? path : `/${path}`}`);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) url.searchParams.set(k, String(v));
  }
  const auth = Buffer.from(`${username}:${password}`, "utf8").toString("base64");
  const headers: Record<string, string> = {
    "Authorization": `Basic ${auth}`,
    "Accept": "application/json",
  };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";

  let resp: Response;
  try {
    resp = await fetch(url.toString(), {
      method: opts.method ?? "GET",
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: `network: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const text = await resp.text();
  let data: unknown = undefined;
  if (text) {
    try { data = JSON.parse(text); }
    catch { data = text; }
  }
  if (!resp.ok) {
    const msg =
      typeof data === "object" && data && "message" in data
        ? String((data as Record<string, unknown>).message)
        : text.slice(0, 200);
    return { ok: false, status: resp.status, error: msg, data };
  }
  return { ok: true, status: resp.status, data: data as T };
}

/**
 * Verify an app password by hitting GET /wp/v2/users/me — the canonical
 * "are these creds good?" check. Returns a verifyStatus enum the credentials
 * page persists.
 */
export type VerifyStatus = "ok" | "unauthorized" | "forbidden" | "not_found" | "unreachable" | "error";
export async function verifyAppPassword(input: {
  domain: string;
  username: string;
  password: string;
}): Promise<{ status: VerifyStatus; user?: { id: number; name?: string; slug?: string }; error?: string }> {
  const auth = Buffer.from(`${input.username}:${input.password}`, "utf8").toString("base64");
  let resp: Response;
  try {
    resp = await fetch(`https://${input.domain.replace(/\/+$/, "")}/wp-json/wp/v2/users/me?context=edit`, {
      method: "GET",
      headers: { "Authorization": `Basic ${auth}`, "Accept": "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    return { status: "unreachable", error: err instanceof Error ? err.message : String(err) };
  }
  if (resp.status === 401) return { status: "unauthorized", error: "wp returned 401 — check username + app password" };
  if (resp.status === 403) return { status: "forbidden", error: "wp returned 403 — wp-json may be blocked at firewall" };
  if (resp.status === 404) return { status: "not_found", error: "wp returned 404 — REST API disabled or path rewritten" };
  if (!resp.ok) return { status: "error", error: `wp returned ${resp.status}` };
  let user: { id: number; name?: string; slug?: string } | undefined;
  try {
    const j = (await resp.json()) as Record<string, unknown>;
    user = { id: Number(j.id), name: j.name as string | undefined, slug: j.slug as string | undefined };
  } catch {}
  return { status: "ok", user };
}
