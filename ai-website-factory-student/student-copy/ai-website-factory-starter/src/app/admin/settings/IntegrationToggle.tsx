"use client";

import { useState } from "react";

export function IntegrationToggle({
  title,
  enabled: initialEnabled,
  children,
}: {
  title: string;
  enabled: boolean;
  children: React.ReactNode;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);

  return (
    <div className="mt-4 rounded-lg border border-border bg-surface p-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">{title}</div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => setEnabled(!enabled)}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${enabled ? "bg-accent" : "bg-surface-3"}`}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm ring-0 transition-transform ${enabled ? "translate-x-5" : "translate-x-0"}`}
          />
        </button>
      </div>
      {enabled && <div className="mt-3">{children}</div>}
    </div>
  );
}
