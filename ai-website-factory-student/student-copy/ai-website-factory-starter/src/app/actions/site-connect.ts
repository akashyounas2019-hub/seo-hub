"use server";

import { redirect } from "next/navigation";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { apiKeys, seoPolicies, siteCredentials, siteThemes, sites } from "@/db/schema";
import { recordAdminAction } from "@/lib/audit-log";
import { extractTheme } from "@/lib/brand-extractor";
import { encrypt } from "@/lib/crypto";
import { requireAdmin } from "@/lib/server-auth";
import { verifyAppPassword } from "@/lib/wp-rest-client";

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

function s(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Aggressive slug sanitizer. Accepts whatever the user pasted —
 * full URLs, trailing slashes, mixed case, dots, underscores — and
 * returns a valid slug or empty string if nothing usable survives.
 *
 *   "https://Spotless.dubai.ae/"          → "spotless-dubai-ae"
 *   "Spotless Cleaning Services"          → "spotless-cleaning-services"
 *   "VILLA_CLEAN_2026"                    → "villa-clean-2026"
 */
function sanitizeSlug(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "")
    .replace(/[^a-z0-9]+/g, "-")  // any run of non-slug chars → single dash
    .replace(/^-+|-+$/g, "")      // trim leading/trailing dashes
    .slice(0, 63);
}

/** Preserve user-typed form values across an error redirect. */
function preservedQuery(fields: Record<string, string | null | undefined>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) {
    if (v) params.set(k, v);
  }
  return params.toString();
}

/**
 * Step 1 of the connect wizard — provision a sites row + api_keys.
 * On success redirects to /admin/sites/connect?step=install&siteId=<id>.
 */
export async function connectSiteStep1Action(formData: FormData) {
  await ensureSchema();
  const me = await requireAdmin();

  const rawSlug = s(formData, "slug");
  const name = s(formData, "name");
  const domain = s(formData, "domain").replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "");
  const city = s(formData, "city") || null;
  const region = s(formData, "region") || null;

  // Slug: sanitize whatever they typed; if they typed nothing usable,
  // derive it from the domain. Same logic the client-side preview uses.
  const slug = sanitizeSlug(rawSlug) || sanitizeSlug(domain);

  // Preserve form state so an error doesn't blow away the user's typing.
  const carry = preservedQuery({ name, domain, slug, city, region });

  if (!slug || !name || !domain || !SLUG_RE.test(slug)) {
    redirect(`/admin/sites/connect?error=invalid&${carry}`);
  }

  // Pre-flight uniqueness check — gives a clearer error than the DB constraint.
  const [bySlug] = await db().select().from(sites).where(eq(sites.slug, slug)).limit(1);
  if (bySlug) redirect(`/admin/sites/connect?error=slug-exists&${carry}`);
  const [byDomain] = await db().select().from(sites).where(eq(sites.domain, domain)).limit(1);
  if (byDomain) redirect(`/admin/sites/connect?error=domain-exists&${carry}`);

  const [created] = await db()
    .insert(sites)
    .values({ slug, name, domain, city, region })
    .returning({ id: sites.id, slug: sites.slug });
  if (!created) redirect("/admin/sites/connect?error=db-error");

  // Generate the first API key pair.
  const keyId = `key_${randomBytes(8).toString("hex")}`;
  const secret = randomBytes(32).toString("base64url");
  await db().insert(apiKeys).values({
    siteId: created.id,
    keyId,
    secret,
    active: true,
  });

  await recordAdminAction({
    actor: me,
    kind: "site.create_via_wizard",
    targetType: "site",
    targetId: created.id,
    summary: `Provisioned ${name} (${domain}) via the connect wizard.`,
  });

  redirect(`/admin/sites/connect?step=install&siteId=${created.id}`);
}

/**
 * Alternate connection method — REST API (WordPress application password).
 *
 * Skips the plugin flow entirely. The admin pastes site details + WP
 * username + WP application password. We verify against
 * `<domain>/wp-json/wp/v2/users/me`. On success we create the site row,
 * store the encrypted credential, and jump straight to Step 3 (policy).
 */
export async function connectSiteViaRestAction(formData: FormData) {
  await ensureSchema();
  const me = await requireAdmin();

  const rawSlug = s(formData, "slug");
  const name = s(formData, "name");
  const domain = s(formData, "domain").replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "");
  const city = s(formData, "city") || null;
  const region = s(formData, "region") || null;
  const username = s(formData, "wp_username");
  const appPassword = s(formData, "wp_app_password").replace(/\s+/g, "");
  const slug = sanitizeSlug(rawSlug) || sanitizeSlug(domain);

  const carry = preservedQuery({
    method: "rest-api", name, domain, slug, city, region, wp_username: username,
  });

  if (!slug || !name || !domain || !SLUG_RE.test(slug)) {
    redirect(`/admin/sites/connect?error=invalid&${carry}`);
  }
  if (!username || !appPassword) {
    redirect(`/admin/sites/connect?error=missing-wp-credentials&${carry}`);
  }
  if (appPassword.length < 18) {
    redirect(`/admin/sites/connect?error=app-password-too-short&${carry}`);
  }

  // Uniqueness — same pre-flight as the plugin path.
  const [bySlug] = await db().select().from(sites).where(eq(sites.slug, slug)).limit(1);
  if (bySlug) redirect(`/admin/sites/connect?error=slug-exists&${carry}`);
  const [byDomain] = await db().select().from(sites).where(eq(sites.domain, domain)).limit(1);
  if (byDomain) redirect(`/admin/sites/connect?error=domain-exists&${carry}`);

  // Live probe BEFORE creating any DB row — no orphan sites if WP rejects us.
  const verify = await verifyAppPassword({ domain, username, password: appPassword });
  if (verify.status !== "ok") {
    const detail = encodeURIComponent(verify.error ?? verify.status);
    redirect(`/admin/sites/connect?error=wp-verify-failed&detail=${detail}&${carry}`);
  }

  const [created] = await db()
    .insert(sites)
    .values({ slug, name, domain, city, region })
    .returning({ id: sites.id, slug: sites.slug });
  if (!created) redirect(`/admin/sites/connect?error=db-error&${carry}`);

  await db().insert(siteCredentials).values({
    siteId: created.id,
    kind: "wp_app_password",
    username,
    secretCiphertext: encrypt(appPassword, "generic"),
    verifiedAt: new Date(),
    verifyStatus: "ok",
    createdBy: me.id,
  });

  await recordAdminAction({
    actor: me,
    kind: "site.create_via_rest_api",
    targetType: "site",
    targetId: created.id,
    summary: `Provisioned ${name} (${domain}) via REST API (username=${username}).`,
  });

  redirect(`/admin/sites/connect?step=configure&siteId=${created.id}`);
}

/**
 * Step 3 — Save the per-site policy and redirect to the site detail page.
 */
export async function connectSiteStep3Action(formData: FormData) {
  await ensureSchema();
  const me = await requireAdmin();

  const siteId = s(formData, "siteId");
  if (!siteId) redirect("/admin/sites/connect?error=missing-site");

  const [site] = await db().select().from(sites).where(eq(sites.id, siteId)).limit(1);
  if (!site) redirect("/admin/sites/connect?error=site-not-found");

  const capabilities: Record<string, "auto" | "propose" | "off"> = {};
  for (const k of ["alt_text", "meta_title", "meta_description", "schema_inject", "visual_css"]) {
    const v = s(formData, `cap_${k}`);
    if (v === "auto" || v === "propose" || v === "off") capabilities[k] = v;
  }
  // Visual is always propose — hard-locked.
  capabilities.visual_css = "propose";

  const competitors = s(formData, "competitors") || null;
  const brandVoice = s(formData, "brandVoice") || null;

  await db()
    .insert(seoPolicies)
    .values({
      siteId,
      enabled: true,
      capabilities,
      competitors,
      brandVoice,
    })
    .onConflictDoUpdate({
      target: seoPolicies.siteId,
      set: {
        enabled: true,
        capabilities,
        competitors,
        brandVoice,
        updatedAt: new Date(),
      },
    });

  await recordAdminAction({
    actor: me,
    kind: "site.policy_set",
    targetType: "site",
    targetId: siteId,
    summary: `SEO policy set during connect wizard for ${site.name}.`,
  });

  // Auto-run the brand extractor as the wizard's last act. The admin
  // lands on /brand with a fresh theme proposal ready to review — they
  // can tweak + push or just hit Apply and move on. We deliberately
  // don't auto-push: visual changes always get human eyes first.
  try {
    const extracted = await extractTheme(site.domain);
    await db()
      .insert(siteThemes)
      .values({
        siteId,
        primaryColor: extracted.primary,
        primaryText: extracted.primary_text,
        surface: extracted.surface,
        surfaceText: extracted.surface_text,
        accent: extracted.accent,
        border: extracted.border,
        fontFamilyBody: extracted.font_family_body,
        fontFamilyHeading: extracted.font_family_heading,
        borderRadiusPx: extracted.border_radius_px,
        mode: extracted.mode,
        source: extracted.source,
        extractionMeta: extracted.extraction_meta,
      })
      .onConflictDoNothing();
  } catch (err) {
    // Best-effort — don't block the wizard if the customer site is
    // slow / offline. The admin can extract manually from the brand page.
    console.error(`[site-connect] auto-extract failed for ${site.slug}:`, err);
  }

  redirect(`/admin/sites/${site.slug}/brand?ok=extracted`);
}
