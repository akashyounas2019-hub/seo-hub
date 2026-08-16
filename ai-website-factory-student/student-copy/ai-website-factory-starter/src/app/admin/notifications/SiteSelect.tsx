"use client";

import { useRouter, useSearchParams } from "next/navigation";

/**
 * Tiny client island for the site-filter dropdown on /admin/notifications.
 * Lives in the same folder as page.tsx so it's colocated with its only caller.
 *
 * The notifications page itself is a server component — it can't attach
 * `onChange` to a DOM element. Putting just this select in a client component
 * lets the page stay server-rendered while the dropdown auto-submits.
 */
export function SiteSelect({
  sites,
  defaultSlug,
  kind,
  period,
}: {
  sites: Array<{ id: string; slug: string; city: string | null }>;
  defaultSlug: string;
  kind: string; // "" when active filter is "all"
  period: string;
}) {
  const router = useRouter();
  const params = useSearchParams();

  return (
    <select
      defaultValue={defaultSlug}
      onChange={(e) => {
        const next = new URLSearchParams(params?.toString() ?? "");
        const value = e.target.value;
        if (value) next.set("site", value);
        else next.delete("site");
        // Preserve kind/period if they came through props (in case the URL
        // dropped them — e.g. user clicked a Link that omitted defaults).
        if (kind) next.set("kind", kind);
        else next.delete("kind");
        if (period) next.set("period", period);
        else next.delete("period");
        const qs = next.toString();
        router.push(qs ? `/admin/notifications?${qs}` : "/admin/notifications");
      }}
      className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
    >
      <option value="">All sites</option>
      {sites.map((s) => (
        <option key={s.id} value={s.slug}>
          {s.slug}
          {s.city ? ` · ${s.city}` : ""}
        </option>
      ))}
    </select>
  );
}
