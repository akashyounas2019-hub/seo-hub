/**
 * Google OAuth (shared client) for GSC + GA4 — per-site connections.
 *
 * Client id/secret come from `org_settings` (pasted once at
 * /admin/settings?section=integrations). Each site gets its own row in
 * `integrations_accounts` (provider='google') holding an encrypted
 * access+refresh token pair, since each site is its own GSC property / GA4
 * account.
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { integrationsAccounts, orgSettings } from "@/db/schema";
import { decrypt, encrypt } from "@/lib/crypto";

const SCOPES = [
  "https://www.googleapis.com/auth/webmasters.readonly",
  "https://www.googleapis.com/auth/analytics.readonly",
].join(" ");

export interface GoogleOauthClient {
  clientId: string;
  clientSecret: string;
}

export async function getGoogleOauthClient(): Promise<GoogleOauthClient | null> {
  const [settings] = await db()
    .select({
      googleOauthClientId: orgSettings.googleOauthClientId,
      googleOauthSecretCiphertext: orgSettings.googleOauthSecretCiphertext,
    })
    .from(orgSettings)
    .where(eq(orgSettings.id, "singleton"))
    .limit(1);

  if (!settings?.googleOauthClientId || !settings.googleOauthSecretCiphertext) return null;
  return {
    clientId: settings.googleOauthClientId,
    clientSecret: decrypt(settings.googleOauthSecretCiphertext),
  };
}

export function googleRedirectUri(req: Request): string {
  const base = process.env.PUBLIC_BASE_URL ?? new URL(req.url).origin;
  return `${base.replace(/\/$/, "")}/api/integrations/google/callback`;
}

export function buildGoogleAuthUrl(opts: { client: GoogleOauthClient; redirectUri: string; state: string }): string {
  const params = new URLSearchParams({
    client_id: opts.client.clientId,
    redirect_uri: opts.redirectUri,
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: opts.state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

export async function exchangeCodeForTokens(opts: {
  client: GoogleOauthClient;
  redirectUri: string;
  code: string;
}): Promise<{ ok: true; accessToken: string; refreshToken: string | null; expiresAt: Date } | { ok: false; error: string }> {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: opts.code,
      client_id: opts.client.clientId,
      client_secret: opts.client.clientSecret,
      redirect_uri: opts.redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const data = (await r.json()) as TokenResponse;
  if (!r.ok || !data.access_token) {
    return { ok: false, error: data.error_description ?? data.error ?? `token exchange failed (${r.status})` };
  }
  return {
    ok: true,
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresAt: new Date(Date.now() + (data.expires_in ?? 3600) * 1000),
  };
}

async function refreshAccessToken(
  client: GoogleOauthClient,
  refreshToken: string,
): Promise<{ accessToken: string; expiresAt: Date } | null> {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: client.clientId,
      client_secret: client.clientSecret,
      grant_type: "refresh_token",
    }),
  });
  const data = (await r.json()) as TokenResponse;
  if (!r.ok || !data.access_token) return null;
  return { accessToken: data.access_token, expiresAt: new Date(Date.now() + (data.expires_in ?? 3600) * 1000) };
}

const EXPIRY_SKEW_MS = 60_000;

/**
 * Returns a valid (refreshed if needed) Google access token for a site, or
 * null if Google isn't connected for that site. Refreshing rewrites the
 * encrypted access token + expiry in place.
 */
export async function getValidGoogleToken(siteId: string): Promise<string | null> {
  const [account] = await db()
    .select()
    .from(integrationsAccounts)
    .where(and(eq(integrationsAccounts.siteId, siteId), eq(integrationsAccounts.provider, "google")))
    .limit(1);
  if (!account?.accessTokenCiphertext) return null;

  const stillValid = account.expiresAt && account.expiresAt.getTime() - EXPIRY_SKEW_MS > Date.now();
  if (stillValid) return decrypt(account.accessTokenCiphertext);

  if (!account.refreshTokenCiphertext) return decrypt(account.accessTokenCiphertext);

  const client = await getGoogleOauthClient();
  if (!client) return null;

  const refreshed = await refreshAccessToken(client, decrypt(account.refreshTokenCiphertext));
  if (!refreshed) {
    await db()
      .update(integrationsAccounts)
      .set({ lastSyncStatus: "error", lastSyncError: "token refresh failed — reconnect Google", updatedAt: new Date() })
      .where(eq(integrationsAccounts.id, account.id));
    return null;
  }

  await db()
    .update(integrationsAccounts)
    .set({
      accessTokenCiphertext: encrypt(refreshed.accessToken, "integration_access_token"),
      expiresAt: refreshed.expiresAt,
      updatedAt: new Date(),
    })
    .where(eq(integrationsAccounts.id, account.id));

  return refreshed.accessToken;
}
