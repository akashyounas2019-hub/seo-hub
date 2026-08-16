/**
 * Shared pagination atom — URL-querystring driven (`?page=N`).
 *
 * Server-component-friendly: renders Prev / Next + "Page X of Y" + numbered
 * page links as plain <Link>s, each PRESERVING the existing query params (so
 * filters/search survive page changes). No client JS, no state.
 *
 * Phase note: this is the reusable piece for the NEXT phase — list pages will
 * adopt it uniformly. Not yet wired into any page.
 *
 * Usage (server component):
 *   const { page, perPage } = pageParams(searchParams);          // parse
 *   const slice = paginate(rows, page, perPage);                 // slice
 *   <Pagination basePath="/admin/leads" page={page}
 *     totalItems={rows.length} perPage={perPage}
 *     searchParams={searchParams} />
 */
import Link from "next/link";

/** Raw Next.js searchParams shape (string | string[] | undefined per key). */
export type SearchParams = Record<string, string | string[] | undefined>;

/** Parse `?page` / `?perPage` out of searchParams with sane clamps. */
export function pageParams(
  searchParams: SearchParams,
  defaultPerPage = 25,
): { page: number; perPage: number } {
  const rawPage = Array.isArray(searchParams.page) ? searchParams.page[0] : searchParams.page;
  const rawPer = Array.isArray(searchParams.perPage) ? searchParams.perPage[0] : searchParams.perPage;
  const page = Math.max(1, Number.parseInt(rawPage ?? "1", 10) || 1);
  const perPage = Math.min(200, Math.max(1, Number.parseInt(rawPer ?? "", 10) || defaultPerPage));
  return { page, perPage };
}

/** Slice an in-memory array for the given 1-based page. */
export function paginate<T>(items: T[], page: number, perPage: number): T[] {
  const start = (page - 1) * perPage;
  return items.slice(start, start + perPage);
}

/** Build an href preserving all existing params, overriding `page`. */
function hrefWithPage(basePath: string, searchParams: SearchParams, page: number): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (key === "page") continue;
    if (Array.isArray(value)) value.forEach((v) => qs.append(key, v));
    else if (value != null) qs.set(key, value);
  }
  qs.set("page", String(page));
  return `${basePath}?${qs.toString()}`;
}

/** Compute the windowed page numbers to render (with -1 sentinels for gaps). */
function pageWindow(page: number, totalPages: number, span = 1): number[] {
  const out: number[] = [];
  const push = (n: number) => out.push(n);
  const lo = Math.max(2, page - span);
  const hi = Math.min(totalPages - 1, page + span);
  push(1);
  if (lo > 2) push(-1); // leading gap
  for (let n = lo; n <= hi; n++) push(n);
  if (hi < totalPages - 1) push(-1); // trailing gap
  if (totalPages > 1) push(totalPages);
  return out;
}

const cellBase =
  "inline-flex h-11 min-w-11 items-center justify-center rounded-md px-3 text-xs transition-colors";

export function Pagination({
  basePath,
  page,
  totalItems,
  perPage,
  searchParams = {},
  className,
}: {
  /** Path without query (e.g. "/admin/leads"). */
  basePath: string;
  /** Current 1-based page. */
  page: number;
  /** Total number of items across all pages. */
  totalItems: number;
  /** Items per page. */
  perPage: number;
  /** Existing query params to preserve on every link. */
  searchParams?: SearchParams;
  className?: string;
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / perPage));
  if (totalPages <= 1) return null;

  const current = Math.min(Math.max(1, page), totalPages);
  const hasPrev = current > 1;
  const hasNext = current < totalPages;
  const window = pageWindow(current, totalPages);

  const disabled = "cursor-default text-text-faint/50";
  const enabled = "text-text-muted hover:bg-surface-2 hover:text-text border border-border";

  return (
    <nav
      aria-label="Pagination"
      className={["flex flex-wrap items-center justify-between gap-2 py-2", className].filter(Boolean).join(" ")}
    >
      <span className="text-xs text-text-faint">
        Page <span className="tabular-nums text-text-muted">{current}</span> of{" "}
        <span className="tabular-nums text-text-muted">{totalPages}</span>
      </span>

      <div className="flex items-center gap-1">
        {hasPrev ? (
          <Link href={hrefWithPage(basePath, searchParams, current - 1)} className={`${cellBase} ${enabled}`} rel="prev">
            ← Prev
          </Link>
        ) : (
          <span aria-disabled className={`${cellBase} ${disabled}`}>
            ← Prev
          </span>
        )}

        {window.map((n, i) =>
          n === -1 ? (
            <span key={`gap-${i}`} className="px-1 text-text-faint/60">
              …
            </span>
          ) : n === current ? (
            <span
              key={n}
              aria-current="page"
              className={`${cellBase} border border-border-strong bg-accent-tint font-medium text-accent`}
            >
              {n}
            </span>
          ) : (
            <Link key={n} href={hrefWithPage(basePath, searchParams, n)} className={`${cellBase} ${enabled}`}>
              {n}
            </Link>
          ),
        )}

        {hasNext ? (
          <Link href={hrefWithPage(basePath, searchParams, current + 1)} className={`${cellBase} ${enabled}`} rel="next">
            Next →
          </Link>
        ) : (
          <span aria-disabled className={`${cellBase} ${disabled}`}>
            Next →
          </span>
        )}
      </div>
    </nav>
  );
}
