import Link from "next/link";
import { ensureSchema } from "@/db/client";
import { createSiteAction } from "@/app/actions/sites";
import { requireAdmin } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export default async function NewSitePage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  await ensureSchema();
  await requireAdmin();

  const errorMsg =
    searchParams.error === "invalid"
      ? "Slug, name, and domain are required. Slug must be lowercase letters, digits, and dashes only."
      : searchParams.error === "slug-exists"
        ? "A site with that slug already exists."
        : searchParams.error === "domain-exists"
          ? "A site with that domain already exists."
          : null;

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <Link href="/admin/sites" className="text-xs text-text-muted hover:text-text">
          ← Sites
        </Link>
        <h1 className="mt-1 text-2xl font-medium tracking-tightish text-text">New site</h1>
        <p className="mt-1 text-sm text-text-muted">
          Register a new WP site. The first API key is generated automatically and shown on the
          site detail page once.
        </p>
      </div>

      {errorMsg ? (
        <div className="rounded-md border border-danger/30 bg-danger-tint px-3 py-2 text-xs text-danger">
          {errorMsg}
        </div>
      ) : null}

      <form
        action={createSiteAction}
        className="space-y-4 rounded-xl border border-border bg-surface p-6"
      >
        <Field label="Slug" name="slug" required placeholder="spotless-cleaning-dubai" hint="Lowercase, dashes. Used as the site identifier in WP plugin settings." />
        <Field label="Name" name="name" required placeholder="Spotless Cleaning Services" />
        <Field label="Domain" name="domain" required placeholder="spotlesscleaningservices.ae" hint="No https:// or trailing slash." />
        <div className="grid grid-cols-2 gap-4">
          <Field label="City" name="city" placeholder="Dubai" />
          <Field label="Region" name="region" placeholder="United Arab Emirates" />
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <Link
            href="/admin/sites"
            className="rounded-md px-3 py-1.5 text-xs text-text-muted hover:text-text"
          >
            Cancel
          </Link>
          <button
            type="submit"
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg hover:bg-accent-hover"
          >
            Create site
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  hint,
  ...input
}: {
  label: string;
  hint?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="block text-xs font-medium uppercase tracking-wide text-text-muted">
        {label}
      </span>
      <input
        {...input}
        className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
      />
      {hint ? <span className="mt-1 block text-xs text-text-faint">{hint}</span> : null}
    </label>
  );
}
