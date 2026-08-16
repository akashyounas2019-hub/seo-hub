/**
 * P3 — Visual regression inbox.
 *
 * Lists all screenshots flagged 'changed' or 'major_change' since the
 * admin's last review. Click any to see the side-by-side comparison.
 */
import Link from "next/link";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { siteScreenshots, sites } from "@/db/schema";
import { reviewScreenshotAction } from "@/app/actions/screenshots";
import { Pill, Row, RowList } from "@/components/ui/Row";
import { Pagination, pageParams, type SearchParams } from "@/components/ui/Pagination";
import { requireAdmin } from "@/lib/server-auth";
import { formatRelative } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ScreenshotsInboxPage({
  searchParams = {},
}: {
  searchParams?: SearchParams & { tab?: "changes" | "all" };
}) {
  await ensureSchema();
  await requireAdmin();
  const d = db();
  const tab = (typeof searchParams.tab === "string" ? searchParams.tab : "") || "changes";
  const { page, perPage } = pageParams(searchParams);
  const offset = (page - 1) * perPage;

  const changesWhere = and(
    inArray(siteScreenshots.status, ["changed", "major_change"]),
    eq(siteScreenshots.reviewed, false),
  );

  let rows;
  let listTotal: number;
  if (tab === "changes") {
    const [cnt, list] = await Promise.all([
      d.select({ n: sql<number>`count(*)::int` }).from(siteScreenshots).where(changesWhere),
      d
        .select({
          s: siteScreenshots,
          siteSlug: sites.slug,
          siteName: sites.name,
        })
        .from(siteScreenshots)
        .innerJoin(sites, eq(sites.id, siteScreenshots.siteId))
        .where(changesWhere)
        .orderBy(desc(siteScreenshots.capturedAt))
        .limit(perPage)
        .offset(offset),
    ]);
    listTotal = cnt[0]?.n ?? 0;
    rows = list;
  } else {
    const [cnt, list] = await Promise.all([
      d.select({ n: sql<number>`count(*)::int` }).from(siteScreenshots),
      d
        .select({
          s: siteScreenshots,
          siteSlug: sites.slug,
          siteName: sites.name,
        })
        .from(siteScreenshots)
        .innerJoin(sites, eq(sites.id, siteScreenshots.siteId))
        .orderBy(desc(siteScreenshots.capturedAt))
        .limit(perPage)
        .offset(offset),
    ]);
    listTotal = cnt[0]?.n ?? 0;
    rows = list;
  }

  const [stats] = await d
    .select({
      total: sql<number>`count(*)::int`,
      changed: sql<number>`count(*) filter (where status in ('changed','major_change') and reviewed = false)::int`,
      major: sql<number>`count(*) filter (where status = 'major_change' and reviewed = false)::int`,
    })
    .from(siteScreenshots);

  return (
    <div className="space-y-6">
      <header className="brand-rule">
        <h1 className="">Screenshots</h1>
        <p className="mt-1.5 text-xs text-text-muted">
          Visual regression inbox — nightly captures across every site, flagged when the home page&apos;s look has shifted noticeably.
        </p>
      </header>

      <nav className="flex items-center gap-1 border-b border-border">
        <TabLink href="/admin/screenshots?tab=changes" current={tab} value="changes" label={`Open changes (${stats?.changed ?? 0})`} />
        <TabLink href="/admin/screenshots?tab=all" current={tab} value="all" label={`All captures (${stats?.total ?? 0})`} />
      </nav>

      {listTotal === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-6 text-xs text-text-muted">
          <p className="font-medium text-text">No {tab === "changes" ? "open visual changes" : "captures yet"}.</p>
          <p className="mt-1">
            {tab === "changes" ? (
              "Every flagged change has been reviewed. The capture cron runs nightly at 02:30 UTC."
            ) : (
              <>
                Run the capture: install playwright on the VPS and run{" "}
                <code className="font-mono">npm run screenshots:capture</code>.
              </>
            )}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((r) => {
            const s = r.s;
            const statusTone = s.status === "major_change" ? "danger" : s.status === "changed" ? "warning" : "neutral";
            return (
              <div key={s.id} className="overflow-hidden rounded-lg border border-border bg-surface">
                <a
                  href={`/api/screenshots/${s.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block aspect-video bg-surface-soft"
                >
                  <img
                    src={`/api/screenshots/${s.id}`}
                    alt={`${r.siteName} ${s.viewport}`}
                    className="h-full w-full object-cover object-top"
                    loading="lazy"
                  />
                </a>
                <div className="space-y-1.5 p-3">
                  <div className="flex items-center justify-between">
                    <Link href={`/admin/sites/${r.siteSlug}`} className="truncate text-xs font-medium text-text hover:underline">
                      {r.siteName}
                    </Link>
                    <Pill tone={statusTone}>{s.status.replace("_", " ")}</Pill>
                  </div>
                  <div className="flex items-baseline justify-between text-xs text-text-faint">
                    <span>{s.viewport} · {s.width}×{s.height}</span>
                    <span>{formatRelative(s.capturedAt)}</span>
                  </div>
                  {s.diffPct !== null ? (
                    <p className="text-xs text-text-muted">
                      Pixel diff vs previous: <span className="tnum font-medium text-text">{s.diffPct}%</span>
                    </p>
                  ) : (
                    <p className="text-xs text-text-faint">First capture — no baseline yet.</p>
                  )}
                  {!s.reviewed && (s.status === "changed" || s.status === "major_change") ? (
                    <form action={reviewScreenshotAction} className="pt-1">
                      <input type="hidden" name="screenshotId" value={s.id} />
                      <button type="submit" className="w-full rounded-md border border-border px-2 py-1 text-xs text-text hover:border-accent hover:text-accent">
                        Mark reviewed
                      </button>
                    </form>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Pagination
        basePath="/admin/screenshots"
        page={page}
        totalItems={listTotal}
        perPage={perPage}
        searchParams={searchParams}
      />
    </div>
  );
}

function TabLink({ href, current, value, label }: { href: string; current: string; value: string; label: string }) {
  const active = current === value;
  return (
    <Link
      href={href}
      className={`border-b-2 px-3 py-2 text-xs ${
        active ? "border-accent text-text" : "border-transparent text-text-muted hover:text-text"
      }`}
    >
      {label}
    </Link>
  );
}
