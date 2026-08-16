import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { sitePages, sites } from "@/db/schema";
import { bulkPushPageDesignAction } from "@/app/actions/page-design";
import { Pill, Row, RowList } from "@/components/ui/Row";
import { Pagination, pageParams, paginate, type SearchParams } from "@/components/ui/Pagination";
import { SiteTabs } from "../SiteTabs";
import { requireAdmin } from "@/lib/server-auth";
import { formatRelative } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function SitePagesIndex({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { error?: string; ok?: string; n?: string; failed?: string; page?: string; perPage?: string };
}) {
  await ensureSchema();
  await requireAdmin();
  const [site] = await db().select().from(sites).where(eq(sites.slug, params.slug)).limit(1);
  if (!site) notFound();

  const { page, perPage } = pageParams(searchParams as SearchParams, 50);

  const allPages = await db()
    .select()
    .from(sitePages)
    .where(eq(sitePages.siteId, site.id))
    .orderBy(desc(sitePages.modifiedAt));
  const pages = paginate(allPages, page, perPage);

  return (
    <div className="space-y-6">
      <header className="brand-rule">
        <Link href={`/admin/sites/${site.slug}`} className="text-xs text-text-faint hover:text-text">
          ← {site.name}
        </Link>
        <h1 className="">Pages</h1>
        <p className="mt-1.5 text-xs text-text-muted">
          Every WordPress page + post on this site. Click any one to open the per-page design editor.
        </p>
      </header>
      <SiteTabs slug={params.slug} />

      {searchParams.error === "page-not-found" ? (
        <div className="rounded-md border border-danger/30 bg-danger-tint px-3 py-2 text-xs text-danger">
          That page isn&apos;t in the catalogue. Run <code className="font-mono">npm run sync:inventory -- --site={site.slug}</code> on the VPS to refresh.
        </div>
      ) : null}
      {searchParams.error === "no-selection" ? (
        <div className="rounded-md border border-warning/30 bg-warning-tint px-3 py-2 text-xs text-warning">
          Select at least one page below.
        </div>
      ) : null}
      {searchParams.error === "empty-design" ? (
        <div className="rounded-md border border-warning/30 bg-warning-tint px-3 py-2 text-xs text-warning">
          Set at least one field in the bulk panel before pushing.
        </div>
      ) : null}
      {searchParams.ok === "bulk-pushed" ? (
        <div className="rounded-md border border-success/30 bg-success-tint px-3 py-2 text-xs text-success">
          Bulk push complete — {searchParams.n ?? "?"} ok{searchParams.failed && searchParams.failed !== "0" ? `, ${searchParams.failed} failed` : ""}.
        </div>
      ) : null}

      {allPages.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-6 text-xs text-text-muted">
          <p className="font-medium text-text">Catalogue empty.</p>
          <p className="mt-1">
            The platform needs to pull this site&apos;s page list from the plugin first. Run <code className="font-mono">npm run sync:inventory -- --site={site.slug}</code> on the VPS, or wait for the nightly cron at 06:00 UTC.
          </p>
        </div>
      ) : (
        <form action={bulkPushPageDesignAction} className="space-y-3">
          <input type="hidden" name="siteSlug" value={site.slug} />

          <details className="rounded-lg border border-border bg-surface">
            <summary className="cursor-pointer select-none px-4 py-2 text-xs font-medium text-text">
              Bulk design panel — apply the same override to many pages
            </summary>
            <div className="grid gap-3 border-t border-border p-4 sm:grid-cols-2">
              <BulkField label="CTA background" name="cta_bg" placeholder="#C9A961" />
              <BulkField label="CTA text color" name="cta_color" placeholder="#0B1E3F" />
              <BulkField label="CTA radius" name="cta_radius" placeholder="8px" />
              <BulkField label="Section padding" name="section_pad" placeholder="48px 0" />
              <label className="block sm:col-span-2">
                <span className="block text-xs font-medium uppercase tracking-[0.06em] text-text-faint">Custom CSS</span>
                <textarea
                  name="custom_css"
                  rows={3}
                  placeholder=".cta-button { letter-spacing: 0.05em; }"
                  className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-xs text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                />
              </label>
              <div className="sm:col-span-2">
                <button type="submit" className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-brand-navy-deep shadow-sm hover:bg-accent-hover">
                  Push to selected pages →
                </button>
                <span className="ml-3 text-xs text-text-faint">
                  Tick the checkboxes below to choose targets.
                </span>
              </div>
            </div>
          </details>

          <RowList footer={`${allPages.length} page${allPages.length === 1 ? "" : "s"}`}>
            {pages.map((p) => (
              <Row key={p.id} className="!items-center">
                <input
                  type="checkbox"
                  name="postId"
                  value={p.wpPostId}
                  className="h-4 w-4 cursor-pointer accent-accent"
                  aria-label={`Select ${p.title}`}
                />
                <Link
                  href={`/admin/sites/${site.slug}/pages/${p.wpPostId}/design`}
                  className="flex flex-1 items-center gap-2"
                >
                  <Pill tone={p.postType === "page" ? "info" : "accent"}>{p.postType}</Pill>
              <Pill tone={p.status === "publish" ? "success" : p.status === "draft" ? "warning" : "neutral"}>{p.status}</Pill>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="truncate text-sm font-medium text-text">{p.title || "(no title)"}</span>
                  <span className="font-mono text-xs text-text-faint">#{p.wpPostId}</span>
                </div>
                <a href={p.url} target="_blank" rel="noopener noreferrer" className="truncate font-mono text-xs text-text-faint hover:text-accent hover:underline">
                  {p.url}
                </a>
              </div>
              {p.hasDesignOverride ? (
                <Pill tone="accent">override</Pill>
              ) : null}
                  <span className="tnum w-16 text-right text-xs text-text-faint">{p.wordCount}w</span>
                  <span className="tnum w-20 text-right text-xs text-text-faint">
                    {p.modifiedAt ? formatRelative(p.modifiedAt) : "—"}
                  </span>
                </Link>
              </Row>
            ))}
          </RowList>
          <Pagination
            basePath={`/admin/sites/${site.slug}/pages`}
            page={page}
            totalItems={allPages.length}
            perPage={perPage}
            searchParams={searchParams as SearchParams}
          />
        </form>
      )}
    </div>
  );
}

function BulkField({ label, name, placeholder }: { label: string; name: string; placeholder?: string }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium uppercase tracking-[0.06em] text-text-faint">{label}</span>
      <input
        name={name}
        placeholder={placeholder}
        className="mt-1 w-full rounded-md border border-border bg-surface px-2.5 py-1.5 font-mono text-xs text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
      />
    </label>
  );
}
