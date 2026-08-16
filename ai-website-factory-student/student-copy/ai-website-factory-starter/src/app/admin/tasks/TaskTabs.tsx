"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

const TABS = [
  { key: "tasks", label: "Assigned Tasks" },
  { key: "todo", label: "To-Do List" },
] as const;

export function TaskTabs() {
  const searchParams = useSearchParams();
  const activeTab = searchParams.get("view") === "todo" ? "todo" : "tasks";

  return (
    <div className="flex gap-1 rounded-lg bg-surface-2 p-1">
      {TABS.map((tab) => {
        const isActive = activeTab === tab.key;
        const href = tab.key === "tasks" ? "/admin/tasks" : "/admin/tasks?view=todo";
        return (
          <Link
            key={tab.key}
            href={href}
            className={
              isActive
                ? "rounded-md bg-surface px-4 py-2 text-sm font-semibold text-text shadow-sm"
                : "rounded-md px-4 py-2 text-sm font-medium text-text-muted transition-colors hover:text-text"
            }
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
