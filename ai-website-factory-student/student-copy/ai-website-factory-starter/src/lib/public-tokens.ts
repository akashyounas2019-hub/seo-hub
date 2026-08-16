import { createHash, randomBytes } from "node:crypto";

/**
 * Public tokens for customer-facing URLs (quotes, reservations, shares).
 *
 * The raw token is what we put in URLs and emails. The DB only stores the
 * sha256 hash — so a DB leak can't be used to construct working URLs.
 *
 * Tokens are base64url, 32 bytes (43 chars) of entropy. Long-lived; expiry
 * is enforced at the row level (e.g. `quotes.expires_at`).
 */

export function generatePublicToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString("base64url");
  return { raw, hash: hashToken(raw) };
}

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * Build the public URL for a quote.
 * `baseUrl` should be the site's public-facing host (PUBLIC_BASE_URL or
 * org_settings.public_base_url).
 */
export function publicQuoteUrl(baseUrl: string, rawToken: string): string {
  return `${baseUrl.replace(/\/$/, "")}/p/q/${encodeURIComponent(rawToken)}`;
}

export function publicReservationUrl(baseUrl: string, confirmationCode: string): string {
  return `${baseUrl.replace(/\/$/, "")}/p/r/${encodeURIComponent(confirmationCode)}`;
}

export function publicShareUrl(baseUrl: string, rawToken: string): string {
  return `${baseUrl.replace(/\/$/, "")}/p/share/${encodeURIComponent(rawToken)}`;
}
