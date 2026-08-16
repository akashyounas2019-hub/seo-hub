import Link from "next/link";
import type { CompareMode, RangeId } from "@/lib/dashboard-traffic";
import { RANGE_OPTIONS } from "@/lib/dashboard-traffic";

/**
 * Range + comparison toggles for a dashboard widget.
 *
 * Renders as URL-driven <Link>s so state survives full page reloads and
 * comparison choices don't reset when the operator navigates away. The
 * caller passes a key prefix (`gsc` / `ga4`) so each widget owns its own
 * query params.
 */
export function FilterBar({
  keyPrefix,
  currentRange,
  currentCompare,
  currentParams,
  accent,
}: {
  keyPrefix: "gsc" | "ga4";
  currentRange: RangeId;
  currentCompare: CompareMode;
  /** All existing searchParams for this request — we preserve the other widget's
   *  filters when the user changes this one. */
  currentParams: Record<string, string | string[] | undefined>;
  /** Tailwind color class for the active tint (e.g. "emerald" or "indigo"). */
  accent: "emerald" | "indigo";
}) {
  const rangeKey = `${keyPrefix}Range`;
  const compareKey = `${keyPrefix}Compare`;

  function hrefFor(overrides: Record<string, string>): string {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(currentParams)) {
      if (k === rangeKey || k === compareKey) continue;
      if (Array.isArray(v)) v.forEach((x) => qs.append(k, x));
      else if (v != null) qs.set(k, v);
    }
    for (const [k, v] of Object.entries(overrides)) qs.set(k, v);
    return `?${qs.toString()}`;
  }

  const compareOptions: Array<{ id: CompareMode; label: string }> = [
    { id: "none", label: "None" },
    { id: "period", label: "Previous period" },
    { id: "year", label: "Previous year" },
  ];

  const activeCls =
    accent === "emerald"
      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 ring-1 ring-inset ring-emerald-500/30"
      : "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 ring-1 ring-inset ring-indigo-500/30";
  const inactiveCls =
    "text-text-muted hover:bg-surface-2 hover:text-text ring-1 ring-inset ring-border";

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Range pills */}
      <div className="flex items-center gap-1">
        {RANGE_OPTIONS.map((r) => {
          const active = r.id === currentRange;
          return (
            <Link
              key={r.id}
              href={hrefFor({ [rangeKey]: r.id, [compareKey]: currentCompare })}
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${active ? activeCls : inactiveCls}`}
            >
              {r.label}
            </Link>
          );
        })}
      </div>

      {/* Comparison dropdown */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-faint">
          Compare
        </span>
        <div className="flex items-center gap-1">
          {compareOptions.map((c) => {
            const active = c.id === currentCompare;
            return (
              <Link
                key={c.id}
                href={hrefFor({ [rangeKey]: currentRange, [compareKey]: c.id })}
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${active ? activeCls : inactiveCls}`}
              >
                {c.label}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
