import Link from "next/link";
import type { SearchParams } from "@/components/ui/Pagination";

/**
 * Small 10 / 100 / 1000 per-page toggle for the Agent Jobs recent list.
 * Preserves all other query params and resets `page` back to 1 on change.
 */
export function PerPageSelector({
  current,
  options,
  searchParams,
  basePath = "/admin/agent/jobs",
}: {
  current: number;
  options: number[];
  searchParams: SearchParams;
  basePath?: string;
}) {
  function hrefFor(n: number): string {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
      if (key === "page" || key === "perPage") continue;
      if (Array.isArray(value)) value.forEach((v) => qs.append(key, v));
      else if (value != null) qs.set(key, value);
    }
    qs.set("perPage", String(n));
    qs.set("page", "1");
    return `${basePath}?${qs.toString()}`;
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-text-faint">
        Per page
      </span>
      <div className="flex overflow-hidden rounded-md border border-border">
        {options.map((n) => {
          const active = n === current;
          return (
            <Link
              key={n}
              href={hrefFor(n)}
              aria-current={active ? "page" : undefined}
              className={`px-2.5 py-1.5 text-xs tabular-nums transition-colors ${
                active
                  ? "bg-accent/15 text-accent"
                  : "text-text-muted hover:bg-surface-2 hover:text-text"
              } ${n !== options[0] ? "border-l border-border" : ""}`}
            >
              {n}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
