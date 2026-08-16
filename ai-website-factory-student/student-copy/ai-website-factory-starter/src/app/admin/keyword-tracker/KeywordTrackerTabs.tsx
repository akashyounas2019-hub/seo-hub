"use client";

import { useRouter, useSearchParams } from "next/navigation";

const TABS = [
  { key: "tracker", label: "Keyword Tracker" },
  { key: "research", label: "Keyword Research" },
] as const;

export type KeywordTrackerTab = (typeof TABS)[number]["key"];

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

export function KeywordTrackerTabs({ active }: { active: KeywordTrackerTab }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function navigate(tab: KeywordTrackerTab) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.push(`/admin/keyword-tracker?${params.toString()}`);
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
    </div>
  );
}
