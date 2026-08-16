import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { siteThemes, sites } from "@/db/schema";
import { SiteTabs } from "../SiteTabs";
import {
  applySiteThemeAction,
  extractSiteThemeAction,
  saveSiteThemeAction,
} from "@/app/actions/site-theme";
import { requireAdmin } from "@/lib/server-auth";
import { formatRelative } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function SiteBrandPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { ok?: string; error?: string };
}) {
  await ensureSchema();
  await requireAdmin();
  const [site] = await db().select().from(sites).where(eq(sites.slug, params.slug)).limit(1);
  if (!site) notFound();

  const [theme] = await db().select().from(siteThemes).where(eq(siteThemes.siteId, site.id)).limit(1);
  const meta = (theme?.extractionMeta as Record<string, unknown>) ?? {};

  const flashOk = searchParams.ok
    ? { extracted: "Re-extracted from the site.", saved: "Theme saved (not pushed yet).", applied: "Theme pushed to the WP plugin." }[searchParams.ok] ?? searchParams.ok
    : null;
  const flashError = searchParams.error
    ? { "apply-failed": "Could not reach the plugin to push the theme. Check site connection.", "no-theme": "Run extract first — no theme to apply yet." }[searchParams.error] ?? searchParams.error
    : null;

  return (
    <div className="space-y-6">
      <header className="brand-rule">
        <Link href={`/admin/sites/${site.slug}`} className="text-xs text-text-faint hover:text-text">
          ← {site.name}
        </Link>
        <h1 className="">
          Brand match
        </h1>
        <p className="mt-1.5 text-xs text-text-muted">
          The widget renders forms on <span className="font-mono">{site.domain}</span> using these tokens. The agent extracted them by reading the homepage HTML; you can override anything below and push.
        </p>
      </header>
      <SiteTabs slug={params.slug} />

      {flashOk ? (
        <div className="rounded-md border border-success/30 bg-success-tint px-3 py-2 text-xs text-success">{flashOk}</div>
      ) : null}
      {flashError ? (
        <div className="rounded-md border border-danger/30 bg-danger-tint px-3 py-2 text-xs text-danger">{flashError}</div>
      ) : null}

      {!theme ? (
        <div className="rounded-xl border border-border bg-surface p-6">
          <h2 className="">No theme yet</h2>
          <p className="mt-1 text-xs text-text-muted">
            Click extract to scan the homepage and infer brand colors + fonts. You&apos;ll get a chance to review before pushing to the plugin.
          </p>
          <form action={extractSiteThemeAction} className="mt-4">
            <input type="hidden" name="siteId" value={site.id} />
            <button type="submit" className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-brand-navy-deep shadow-sm hover:bg-accent-hover">
              Extract from homepage
            </button>
          </form>
        </div>
      ) : (
        <>
          {/* Live preview */}
          <section className="rounded-xl border border-border bg-surface p-6">
            <h2 className="">Live preview</h2>
            <p className="mt-1 text-xs text-text-muted">This is roughly what the booking widget will look like on {site.domain}.</p>
            <div
              className="mt-4 rounded-xl p-6"
              style={{
                background: theme.surface,
                color: theme.surfaceText,
                fontFamily: theme.fontFamilyBody,
                borderRadius: `${theme.borderRadiusPx}px`,
                border: `1px solid ${theme.border}`,
              }}
            >
              <h3 style={{ fontFamily: theme.fontFamilyHeading, color: theme.surfaceText, fontSize: 24, margin: 0 }}>
                Book in 30 seconds
              </h3>
              <p style={{ marginTop: 4, fontSize: 13, opacity: 0.7 }}>
                Speak your requirements in plain English — a live agent replies with a personalised AED quote.
              </p>
              <input
                placeholder="e.g. 3-bedroom villa in Palm Jumeirah, deep clean on May 28 at 9am"
                style={{
                  display: "block",
                  width: "100%",
                  marginTop: 14,
                  padding: "10px 12px",
                  background: theme.surface,
                  color: theme.surfaceText,
                  border: `1px solid ${theme.border}`,
                  borderRadius: `${Math.max(0, theme.borderRadiusPx - 2)}px`,
                  fontSize: 14,
                  fontFamily: theme.fontFamilyBody,
                }}
                disabled
              />
              <button
                type="button"
                disabled
                style={{
                  marginTop: 12,
                  padding: "10px 20px",
                  background: theme.primaryColor,
                  color: theme.primaryText,
                  border: "none",
                  borderRadius: `${theme.borderRadiusPx}px`,
                  fontSize: 13,
                  fontFamily: theme.fontFamilyBody,
                  fontWeight: 500,
                  cursor: "default",
                }}
              >
                Continue →
              </button>
            </div>
          </section>

          {/* Extraction provenance */}
          <section className="rounded-lg border border-border bg-surface p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-text">Where these came from</h2>
              <span className={`rounded-full px-2 py-0.5 text-xs uppercase tracking-wide ${theme.source === "manual" ? "bg-info-tint text-info" : theme.source === "agent_extracted" ? "bg-success-tint text-success" : "bg-warning-tint text-warning"}`}>
                {theme.source.replace(/_/g, " ")}
              </span>
            </div>
            <ul className="mt-2 space-y-1 text-xs text-text-muted">
              {(meta.sources_used as string[] | undefined)?.map((s) => (
                <li key={s}>• {s.replace(/_/g, " ")}</li>
              ))}
              {meta.found_theme_color ? <li>• &lt;meta theme-color&gt; → <code className="font-mono text-xs">{String(meta.found_theme_color)}</code></li> : null}
              {meta.found_body_bg ? <li>• body background → <code className="font-mono text-xs">{String(meta.found_body_bg)}</code></li> : null}
              {meta.found_button_bg ? <li>• first hero button → <code className="font-mono text-xs">{String(meta.found_button_bg)}</code></li> : null}
              {(meta.notes as string[] | undefined)?.map((n, i) => (
                <li key={`note-${i}`} className="text-text-faint">{n}</li>
              ))}
            </ul>
          </section>

          {/* Edit form */}
          <form action={saveSiteThemeAction} className="rounded-xl border border-border bg-surface p-5 shadow-sm">
            <input type="hidden" name="siteId" value={site.id} />
            <h2 className="">Edit theme</h2>
            <p className="mt-1 text-xs text-text-muted">Hex (<code className="font-mono text-xs">#0B1E3F</code>) or rgba(). Changes here mark the theme as &quot;manual&quot;.</p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <ColorField label="Primary CTA" name="primary" defaultValue={theme.primaryColor} />
              <ColorField label="Text on primary" name="primary_text" defaultValue={theme.primaryText} />
              <ColorField label="Form background" name="surface" defaultValue={theme.surface} />
              <ColorField label="Body text" name="surface_text" defaultValue={theme.surfaceText} />
              <ColorField label="Accent (links, focus)" name="accent" defaultValue={theme.accent} />
              <ColorField label="Border" name="border" defaultValue={theme.border} />
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="Body font" name="font_family_body" defaultValue={theme.fontFamilyBody} />
              <Field label="Heading font" name="font_family_heading" defaultValue={theme.fontFamilyHeading} />
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="Corner radius (px)" name="border_radius_px" defaultValue={String(theme.borderRadiusPx)} type="number" min={0} max={999} />
              <label className="block">
                <span className="block text-xs font-medium uppercase tracking-[0.06em] text-text-faint">Mode</span>
                <select name="mode" defaultValue={theme.mode} className="mt-1 w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/20">
                  <option value="light">light</option>
                  <option value="dark">dark</option>
                  <option value="auto">auto</option>
                </select>
              </label>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border pt-4">
              <button type="submit" className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-brand-navy-deep shadow-sm hover:bg-accent-hover">
                Save changes
              </button>
            </div>
          </form>

          {/* Apply + extract actions */}
          <section className="grid gap-3 sm:grid-cols-2">
            <form action={applySiteThemeAction} className="rounded-lg border border-border bg-surface p-4">
              <input type="hidden" name="siteId" value={site.id} />
              <h3 className="text-sm font-medium text-text">Push to plugin</h3>
              <p className="mt-1 text-xs text-text-muted">
                Sends this theme to the WP plugin via signed HMAC. The plugin emits CSS variables on every page render.
              </p>
              {theme.appliedAt ? (
                <p className="mt-2 text-xs text-text-faint">
                  Last pushed {formatRelative(theme.appliedAt)}.
                </p>
              ) : (
                <p className="mt-2 text-xs text-warning">Never pushed yet.</p>
              )}
              {theme.applyError ? (
                <p className="mt-1 text-xs text-danger">Last attempt failed: {theme.applyError}</p>
              ) : null}
              <button type="submit" className="mt-3 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-brand-navy-deep shadow-sm hover:bg-accent-hover">
                Apply to {site.domain}
              </button>
            </form>

            <form action={extractSiteThemeAction} className="rounded-lg border border-border bg-surface p-4">
              <input type="hidden" name="siteId" value={site.id} />
              <h3 className="text-sm font-medium text-text">Re-extract from homepage</h3>
              <p className="mt-1 text-xs text-text-muted">
                Crawls {site.domain} again and proposes a fresh theme. Won&apos;t touch the plugin until you push.
              </p>
              <button type="submit" className="mt-3 rounded-md border border-border bg-surface-2 px-3 py-1.5 text-xs font-medium text-text-muted hover:bg-surface-3 hover:text-text">
                Re-extract
              </button>
            </form>
          </section>
        </>
      )}
    </div>
  );
}

function ColorField({
  label,
  name,
  defaultValue,
}: {
  label: string;
  name: string;
  defaultValue: string;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium uppercase tracking-[0.06em] text-text-faint">{label}</span>
      <div className="mt-1 flex items-center gap-2">
        <span
          className="h-7 w-7 shrink-0 rounded-md border border-border"
          style={{ background: defaultValue }}
          aria-hidden
        />
        <input
          name={name}
          defaultValue={defaultValue}
          className="w-full rounded-md border border-border bg-surface px-2.5 py-1.5 font-mono text-xs text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
      </div>
    </label>
  );
}

function Field({
  label,
  ...input
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="block text-xs font-medium uppercase tracking-[0.06em] text-text-faint">{label}</span>
      <input
        {...input}
        className="mt-1 w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
      />
    </label>
  );
}
