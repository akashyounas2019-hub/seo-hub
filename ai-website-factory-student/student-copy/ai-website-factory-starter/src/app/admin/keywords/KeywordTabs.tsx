"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

const TABS = [
  { key: "scout", label: "Keyword Research" },
  { key: "rank-tracker", label: "Rank Tracker" },
  { key: "lists", label: "Keyword Lists" },
] as const;

export type KeywordTab = (typeof TABS)[number]["key"];

/** Links out to the existing /admin/keyword-tracker page (separate route,
 *  not a query-param tab) — surfaced here too since tracking ranks is a
 *  natural next step after researching keywords. Same pattern as Designing
 *  Scout's "Build Agent" tab linking out to /admin/build. */
const EXTERNAL_TAB = { href: "/admin/keyword-tracker", label: "Arabic Keyword Tracker" };

/** Inline style shared by every pill — active = green, inactive = info tint. */
function pillStyle(isActive: boolean): React.CSSProperties {
  return isActive
    ? {
        background: "var(--success)",
        color: "var(--success-fg, #06281b)",
        boxShadow: "0 1px 2px var(--success-tint)",
      }
    : {
        background: "var(--info-tint)",
        color: "var(--info)",
        border: "1px solid var(--border-strong)",
      };
}

export function KeywordTabs({ active }: { active: KeywordTab }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function navigate(tab: KeywordTab) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    params.delete("page");
    router.push(`/admin/keywords?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap gap-2">
      {TABS.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => navigate(t.key)}
          aria-pressed={active === t.key}
          className="rounded-full px-4 py-2 text-sm font-semibold transition-all"
          style={pillStyle(active === t.key)}
        >
          {t.label}
        </button>
      ))}
      <Link
        href={EXTERNAL_TAB.href}
        className="rounded-full px-4 py-2 text-sm font-semibold transition-all"
        style={pillStyle(false)}
      >
        {EXTERNAL_TAB.label}
      </Link>
    </div>
  );
}
