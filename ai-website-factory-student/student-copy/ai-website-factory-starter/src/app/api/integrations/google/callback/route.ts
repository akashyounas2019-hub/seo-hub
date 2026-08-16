/**
 * GET /api/integrations/google/callback
 *
 * Google redirects here after consent. Verifies `state` against the cookie
 * set in /start (CSRF), exchanges the code for tokens, and upserts
 * `integrations_accounts` (provider='google') for the site. The daily
 * indexing sync (src/lib/indexing/sync.ts via tokenForSite) and
 * `npm run sync:ga4` both read the stored token from there.
 */
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { integrationsAccounts, sites } from "@/db/schema";
import { requireAdmin } from "@/lib/server-auth";
import { recordAdminAction } from "@/lib/audit-log";
import { encrypt } from "@/lib/crypto";
import { exchangeCodeForTokens, getGoogleOauthClient, googleRedirectUri } from "@/lib/google-oauth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  await ensureSchema();
  const me = await requireAdmin();

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  const cookieState = req.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("gyl_google_oauth_state="))
    ?.slice("gyl_google_oauth_state=".length);

  const clearStateCookie = (res: NextResponse) => {
    res.cookies.set("gyl_google_oauth_state", "", { path: "/", maxAge: 0 });
    return res;
  };

  if (oauthError) {
    return clearStateCookie(
      NextResponse.redirect(new URL(`/admin/sites?error=${encodeURIComponent(`google-oauth-${oauthError}`)}`, url.origin)),
    );
  }
  if (!code || !state || !cookieState || state !== cookieState) {
    return clearStateCookie(
      NextResponse.redirect(new URL(`/admin/sites?error=${encodeURIComponent("google-oauth-state-mismatch")}`, url.origin)),
    );
  }

  const [siteId] = state.split(".");
  const [site] = await db().select({ id: sites.id, slug: sites.slug }).from(sites).where(eq(sites.id, siteId)).limit(1);
  if (!site) {
    return clearStateCookie(NextResponse.redirect(new URL("/admin/sites?error=site-not-found", url.origin)));
  }

  const client = await getGoogleOauthClient();
  if (!client) {
    return clearStateCookie(
      NextResponse.redirect(
        new URL(`/admin/sites/${site.slug}?error=${encodeURIComponent("google-not-configured")}`, url.origin),
      ),
    );
  }

  const tokens = await exchangeCodeForTokens({ client, redirectUri: googleRedirectUri(req), code });
  if (!tokens.ok) {
    return clearStateCookie(
      NextResponse.redirect(
        new URL(`/admin/sites/${site.slug}?error=${encodeURIComponent(`google-oauth-${tokens.error}`)}`, url.origin),
      ),
    );
  }

  const [existing] = await db()
    .select({ id: integrationsAccounts.id, metadata: integrationsAccounts.metadata, refreshTokenCiphertext: integrationsAccounts.refreshTokenCiphertext })
    .from(integrationsAccounts)
    .where(and(eq(integrationsAccounts.siteId, site.id), eq(integrationsAccounts.provider, "google")))
    .limit(1);

  // Google only returns a refresh_token on the first consent (or when
  // prompt=consent forces re-consent, which /start always sets) — but guard
  // anyway so a re-auth that somehow omits it doesn't wipe a working one.
  const refreshTokenCiphertext = tokens.refreshToken
    ? encrypt(tokens.refreshToken, "integration_refresh_token")
    : existing?.refreshTokenCiphertext ?? null;

  if (existing) {
    await db()
      .update(integrationsAccounts)
      .set({
        accessTokenCiphertext: encrypt(tokens.accessToken, "integration_access_token"),
        refreshTokenCiphertext,
        expiresAt: tokens.expiresAt,
        scopes: "webmasters.readonly analytics.readonly",
        lastSyncStatus: "ok",
        lastSyncError: null,
        updatedAt: new Date(),
      })
      .where(eq(integrationsAccounts.id, existing.id));
  } else {
    await db().insert(integrationsAccounts).values({
      siteId: site.id,
      provider: "google",
      accessTokenCiphertext: encrypt(tokens.accessToken, "integration_access_token"),
      refreshTokenCiphertext,
      expiresAt: tokens.expiresAt,
      scopes: "webmasters.readonly analytics.readonly",
      lastSyncStatus: "ok",
    });
  }

  await recordAdminAction({
    actor: me,
    kind: "integration.google_connect",
    targetType: "site",
    targetId: site.id,
    summary: `Connected Google (GSC + GA4) for ${site.slug}`,
  });

  return clearStateCookie(
    NextResponse.redirect(new URL(`/admin/sites/${site.slug}?ok=google-connected`, url.origin)),
  );
}
