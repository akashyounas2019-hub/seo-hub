"use client";

/**
 * Client-side fields for the /admin/sites/connect step 1 form.
 *
 * Why a client component:
 *   - We want to LIVE-derive the slug from the URL as the user types,
 *     so they never have to think about what a slug is.
 *   - Slug stays editable — if the user wants to override, they can —
 *     but the moment they touch the URL, we re-sync the slug iff the
 *     user hasn't manually edited it.
 *
 * The server action `connectSiteStep1Action` runs the same sanitizer
 * on submit, so even if JS is disabled or the user pastes nonsense,
 * the server still ends up with a valid slug.
 */
import { useEffect, useRef, useState } from "react";

function sanitizeSlug(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

interface Props {
  /** Server-provided defaults from preserved-form-state query params. */
  defaultDomain?: string;
  defaultName?: string;
  defaultSlug?: string;
  defaultCity?: string;
  defaultRegion?: string;
}

export function SiteWizardFields({
  defaultDomain = "",
  defaultName = "",
  defaultSlug = "",
  defaultCity = "",
  defaultRegion = "United Arab Emirates",
}: Props) {
  // Always sanitize on the way in — defaults can come from preserved-form
  // state URL params, which means a previous bad submission could re-land
  // here with `slug=https%3A%2F%2F...` and we must never trust it raw.
  const [domain, setDomain] = useState(
    defaultDomain.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "")
  );
  const [slug, setSlug] = useState(
    sanitizeSlug(defaultSlug) || sanitizeSlug(defaultDomain)
  );
  // If the user typed something we couldn't sanitize into anything useful,
  // they obviously meant to edit — keep their edit even if it's empty.
  const slugTouched = useRef<boolean>(!!sanitizeSlug(defaultSlug));

  // Live-sync slug from domain unless the user has manually edited slug.
  useEffect(() => {
    if (!slugTouched.current) {
      setSlug(sanitizeSlug(domain));
    }
  }, [domain]);

  // Domain field: sanitize on blur/paste so users can paste a full URL
  // and we just clean it. No "no https://" footgun.
  const cleanDomainOnInput = (raw: string) =>
    raw.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "").trim();

  return (
    <>
      <label className="block">
        <span className="block text-xs font-medium uppercase tracking-[0.06em] text-text-muted">
          Site URL
        </span>
        <input
          name="domain"
          required
          placeholder="yourbusiness.com"
          value={domain}
          onChange={(e) => setDomain(cleanDomainOnInput(e.target.value))}
          onBlur={(e) => setDomain(cleanDomainOnInput(e.target.value))}
          autoComplete="off"
          spellCheck={false}
          className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
        <span className="mt-1 block text-xs text-text-faint">
          Paste the full URL if you want — we&apos;ll strip https:// and trailing slashes automatically.
        </span>
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="block text-xs font-medium uppercase tracking-[0.06em] text-text-muted">
            Display name
          </span>
          <input
            name="name"
            required
            defaultValue={defaultName}
            placeholder="Villa Cleaning Services Dubai"
            autoComplete="off"
            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
        </label>
        <label className="block">
          <span className="flex items-baseline justify-between text-xs font-medium uppercase tracking-[0.06em] text-text-muted">
            <span>Slug</span>
            {!slugTouched.current && slug ? (
              <span className="font-mono text-xs normal-case tracking-normal text-text-faint">
                auto
              </span>
            ) : null}
          </span>
          <input
            name="slug"
            required
            value={slug}
            onChange={(e) => {
              slugTouched.current = true;
              setSlug(sanitizeSlug(e.target.value));
            }}
            placeholder="yourbusiness"
            autoComplete="off"
            spellCheck={false}
            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-sm text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
          <span className="mt-1 block text-xs text-text-faint">
            Internal identifier. Auto-filled from the URL — edit if you want.
          </span>
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="block text-xs font-medium uppercase tracking-[0.06em] text-text-muted">
            City
          </span>
          <input
            name="city"
            defaultValue={defaultCity}
            placeholder="Dubai"
            autoComplete="off"
            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
        </label>
        <label className="block">
          <span className="block text-xs font-medium uppercase tracking-[0.06em] text-text-muted">
            Region
          </span>
          <input
            name="region"
            defaultValue={defaultRegion}
            placeholder="United Arab Emirates"
            autoComplete="off"
            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
        </label>
      </div>
    </>
  );
}
