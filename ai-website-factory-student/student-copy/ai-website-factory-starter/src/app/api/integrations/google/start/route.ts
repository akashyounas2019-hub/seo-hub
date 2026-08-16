/**
 * GET /api/integrations/google/start?site=<slug>
 *
 * Admin clicks "Connect" on a site's Integrations card. Redirects to Google's
 * OAuth consent screen, scoped to webmasters.readonly + analytics.readonly.
 * State is a signed-ish opaque token: `<siteId>.<random>`, stashed in a
 * short-lived httpOnly cookie so the callback can verify it round-tripped
 * through the same browser (CSRF) without needing server-side session storage.
 */
import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { sites } from "@/db/schema";
import { requireAdmin } from "@/lib/server-auth";
import { buildGoogleAuthUrl, getGoogleOauthClient, googleRedirectUri } from "@/lib/google-oauth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  await ensureSchema();
  await requireAdmin();

  const url = new URL(req.url);
  const slug = url.searchParams.get("site");
  if (!slug) {
    return NextResponse.redirect(new URL("/admin/sites?error=site-not-found", url.origin));
  }

  const [site] = await db().select({ id: sites.id, slug: sites.slug }).from(sites).where(eq(sites.slug, slug)).limit(1);
  if (!site) {
    return NextResponse.redirect(new URL("/admin/sites?error=site-not-found", url.origin));
  }

  const client = await getGoogleOauthClient();
  if (!client) {
    return NextResponse.redirect(
      new URL(`/admin/sites/${slug}?error=${encodeURIComponent("google-not-configured")}`, url.origin),
    );
  }

  const nonce = randomBytes(16).toString("base64url");
  const state = `${site.id}.${nonce}`;

  const authUrl = buildGoogleAuthUrl({ client, redirectUri: googleRedirectUri(req), state });

  const res = NextResponse.redirect(authUrl);
  res.cookies.set("gyl_google_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  return res;
}
