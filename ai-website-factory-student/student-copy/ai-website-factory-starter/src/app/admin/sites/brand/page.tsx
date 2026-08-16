import Link from "next/link";
import { eq } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { siteThemes, sites } from "@/db/schema";
import { bulkApplyThemesAction, bulkExtractThemesAction } from "@/app/actions/site-theme-bulk";
import { Pill, Row, RowList } from "@/components/ui/Row";
import { requireAdmin } from "@/lib/server-auth";
import { formatRelative } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function BulkBrandPage({
  searchParams,
}: {
  searchParams: { ok?: string; n?: string; failed?: string; error?: string };
}) {
  await ensureSchema();
  await requireAdmin();
  const rows = await db()
    .select({
      siteId: sites.id,
      slug: sites.slug,
      name: sites.name,
      domain: sites.domain,
      primaryColor: siteThemes.primaryColor,
      surface: siteThemes.surface,
      accent: siteThemes.accent,
      source: siteThemes.source,
      appliedAt: siteThemes.appliedAt,
      applyError: siteThemes.applyError,
      updatedAt: siteThemes.updatedAt,
    })
    .from(sites)
    .leftJoin(siteThemes, eq(siteThemes.siteId, sites.id))
    .orderBy(sites.slug);

  const flashOk = searchParams.ok
    ? searchParams.ok === "extracted"
      ? `Re-extracted ${searchParams.n ?? "0"} site${searchParams.n === "1" ? "" : "s"}${searchParams.failed && searchParams.failed !== "0" ? ` (${searchParams.failed} failed)` : ""}.`
      : searchParams.ok === "applied"
        ? `Pushed ${searchParams.n ?? "0"} theme${searchParams.n === "1" ? "" : "s"} to plugins${searchParams.failed && searchParams.failed !== "0" ? ` (${searchParams.failed} failed)` : ""}.`
        : searchParams.ok
    : null;

  const sitesWithTheme = rows.filter((r) => r.primaryColor !== null);

  return (
    <div className="space-y-6">
      <header className="brand-rule">
        <Link href="/admin/sites" className="text-xs text-text-faint hover:text-text">← Sites</Link>
        <h1 className="">
          Bulk brand match
        </h1>
        <p className="mt-1.5 text-xs text-text-muted">
          Re-extract themes across many sites at once, or push the saved themes to their plugins in a single sweep.
          Extraction runs sequentially (~3-8s per site) — be patient.
        </p>
      </header>

      {flashOk ? (
        <div className="rounded-md border border-success/30 bg-success-tint px-3 py-2 text-xs text-success">{flashOk}</div>
      ) : null}
      {searchParams.error === "no-selection" ? (
        <div className="rounded-md border border-danger/30 bg-danger-tint px-3 py-2 text-xs text-danger">
          Select at least one site.
        </div>
      ) : null}

      <form id="bulk-form" className="rounded-xl border border-border bg-surface p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="">Select sites</h2>
          <div className="flex items-center gap-2 text-xs">
            <button type="button" onClick={() => selectAll(true)} className="text-accent hover:underline">Select all</button>
            <span className="text-text-faint">·</span>
            <button type="button" onClick={() => selectAll(false)} className="text-text-faint hover:text-text">Clear</button>
          </div>
        </div>

        <RowList footer={`${rows.length} site${rows.length === 1 ? "" : "s"} · ${sitesWithTheme.length} with theme`}>
          {rows.map((r) => (
            <Row key={r.siteId} className="!items-start py-2.5">
              <label className="flex w-full cursor-pointer items-center gap-3">
                <input type="checkbox" name="siteId" value={r.siteId} className="bulk-site-check h-4 w-4 cursor-pointer accent-accent" />
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-border" style={{ background: r.surface ?? "#FFF", color: r.primaryColor ?? "#666" }}>
                  <span className="text-xs font-semibold uppercase">{r.slug.slice(0, 2)}</span>
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="truncate text-sm font-medium text-text">{r.name}</span>
                    <span className="truncate font-mono text-xs text-text-faint">{r.domain}</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-text-faint">
                    {r.primaryColor ? (
                      <>
                        <ColorChip color={r.primaryColor} label="primary" />
                        {r.accent ? <ColorChip color={r.accent} label="accent" /> : null}
                        {r.surface ? <ColorChip color={r.surface} label="surface" /> : null}
                      </>
                    ) : (
                      <span className="text-warning">No theme yet</span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {r.source ? (
                    <Pill tone={r.source === "agent_vision" ? "accent" : r.source === "agent_extracted" ? "success" : r.source === "manual" ? "info" : "warning"}>
                      {r.source.replace(/_/g, " ")}
                    </Pill>
                  ) : null}
                  {r.appliedAt ? (
                    <span className="text-xs text-text-faint">applied {formatRelative(r.appliedAt)}</span>
                  ) : r.primaryColor ? (
                    <span className="text-xs text-warning">not pushed</span>
                  ) : null}
                  {r.applyError ? (
                    <span className="text-xs text-danger">push error</span>
                  ) : null}
                </div>
              </label>
            </Row>
          ))}
        </RowList>

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-4">
          <button formAction={bulkExtractThemesAction} className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text hover:bg-surface-2">
            Re-extract selected
          </button>
          <button formAction={bulkApplyThemesAction} className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-brand-navy-deep shadow-sm hover:bg-accent-hover focus-visible:shadow-glow">
            Push selected to plugins
          </button>
          <span className="text-xs text-text-faint">
            Tip: extract first to refresh proposals, then review individual sites at <code className="font-mono text-xs">/admin/sites/[slug]/brand</code>, then come back here to push the approved ones.
          </span>
        </div>
      </form>

      <script
        // Tiny vanilla helper for the select-all buttons. No client component needed.
        dangerouslySetInnerHTML={{
          __html: `
            function selectAll(on) {
              document.querySelectorAll('.bulk-site-check').forEach((c) => { c.checked = on; });
            }
          `,
        }}
      />
    </div>
  );
}

function ColorChip({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="inline-block h-2.5 w-2.5 rounded-sm border border-border" style={{ background: color }} aria-hidden />
      <span className="font-mono text-xs text-text-faint">{label}</span>
    </span>
  );
}

// Declared so TS doesn't complain about the inline-script reference.
declare global {
  // eslint-disable-next-line no-var
  var selectAll: (on: boolean) => void;
}
