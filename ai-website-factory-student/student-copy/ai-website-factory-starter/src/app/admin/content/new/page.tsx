/**
 * P4 — Create new content brief.
 */
import Link from "next/link";
import { db, ensureSchema } from "@/db/client";
import { sites } from "@/db/schema";
import { createBriefAction } from "@/app/actions/content-pipeline";
import { requireAdmin } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export default async function NewBriefPage() {
  await ensureSchema();
  await requireAdmin();
  const allSites = await db().select({ slug: sites.slug, name: sites.name }).from(sites).orderBy(sites.name);

  return (
    <div className="max-w-4xl space-y-6">
      <header className="brand-rule">
        <Link href="/admin/content" className="text-xs text-text-faint hover:text-text">
          ← Pipeline
        </Link>
        <h1 className="">New brief</h1>
        <p className="mt-1.5 text-xs text-text-muted">
          Start a piece of content. Once created, you can move it through the pipeline: drafting → review → approved → published.
        </p>
      </header>

      <form action={createBriefAction} className="space-y-4">
        <Field label="Site" name="siteSlug">
          <select
            name="siteSlug"
            required
            className="mt-1 w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            defaultValue=""
          >
            <option value="" disabled>Choose a site…</option>
            {allSites.map((s) => (
              <option key={s.slug} value={s.slug}>{s.name}</option>
            ))}
          </select>
        </Field>

        <Field label="Title" name="title">
          <input
            name="title"
            required
            placeholder="e.g. Villa Deep Cleaning in Palm Jumeirah — Fixed AED price"
            className="mt-1 w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
        </Field>

        <Field label="Target keyword (optional)" name="targetKeyword">
          <input
            name="targetKeyword"
            placeholder="teeth whitening austin"
            className="mt-1 w-full rounded-md border border-border bg-surface px-2.5 py-1.5 font-mono text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
        </Field>

        <Field label="Content type" name="contentType">
          <select
            name="contentType"
            defaultValue="post"
            className="mt-1 w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          >
            <option value="post">Post</option>
            <option value="page">Page</option>
          </select>
        </Field>

        <Field label="Brief (Markdown)" name="briefMarkdown">
          <textarea
            name="briefMarkdown"
            rows={10}
            placeholder={`# Audience\n# Search intent\n# Outline\n- H2: …\n- H2: …\n# Internal links\n# CTAs`}
            className="mt-1 w-full rounded-md border border-border bg-surface px-2.5 py-1.5 font-mono text-xs outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
        </Field>

        <div className="flex items-center gap-2">
          <button type="submit" className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-brand-navy-deep hover:bg-accent-hover">
            Create brief →
          </button>
          <Link href="/admin/content" className="rounded-md border border-border px-3 py-1.5 text-xs text-text hover:border-accent">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

function Field({ label, name, children }: { label: string; name: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium uppercase tracking-[0.06em] text-text-faint">{label}</span>
      {children}
    </label>
  );
}
