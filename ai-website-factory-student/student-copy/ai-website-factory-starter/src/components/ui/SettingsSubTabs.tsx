"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

export type SettingsSection = "general" | "apis" | "integrations";

const SUB_TABS: { id: SettingsSection; label: string }[] = [
  { id: "general", label: "General" },
  { id: "apis", label: "APIs" },
  { id: "integrations", label: "Integrations" },
];

export function SettingsSubTabs({ active }: { active: SettingsSection }) {
  const router = useRouter();
  return (
    <nav aria-label="Settings sub-sections" className="mb-6 flex flex-wrap gap-1.5">
      {SUB_TABS.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() =>
              router.push(
                `/admin/settings${tab.id === "general" ? "" : `?section=${tab.id}`}`,
              )
            }
            className={cn(
              "rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
              isActive
                ? "bg-accent text-accent-fg"
                : "bg-surface-2 text-text-muted hover:bg-surface-3 hover:text-text",
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}
