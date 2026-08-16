"use client";

import { useEffect, useState } from "react";

type ThemePref = "light" | "dark" | "system";

/**
 * 3-state theme switcher — Light / Dark / System.
 *
 * Lives in the user menu (top-right of AppShell). Writes
 * `localStorage.gyl-theme` and `data-theme` on <html>. The pre-paint
 * script in src/app/layout.tsx reads this on first load.
 */
export function ThemeToggle() {
  const [pref, setPref] = useState<ThemePref>("system");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = (localStorage.getItem("gyl-theme") as ThemePref | null) ?? "system";
    setPref(saved);
  }, []);

  function apply(next: ThemePref) {
    setPref(next);
    if (next === "system") {
      localStorage.removeItem("gyl-theme");
    } else {
      localStorage.setItem("gyl-theme", next);
    }
    const resolved =
      next === "system"
        ? window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : next;
    document.documentElement.setAttribute("data-theme", resolved);
    document.documentElement.setAttribute("data-theme-pref", next);
  }

  // Re-apply when system preference changes (only if pref=system)
  useEffect(() => {
    if (pref !== "system") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pref]);

  // Render a stable shell on the server to avoid hydration mismatch.
  if (!mounted) {
    return (
      <div className="inline-flex rounded-md border border-border bg-surface p-0.5" aria-hidden>
        <div className="h-6 w-6" />
        <div className="h-6 w-6" />
        <div className="h-6 w-6" />
      </div>
    );
  }

  return (
    <div
      role="group"
      aria-label="Theme"
      className="inline-flex rounded-md border border-border bg-surface p-0.5"
    >
      <Option label="Light" value="light" current={pref} onPick={apply}>
        <SunIcon />
      </Option>
      <Option label="System" value="system" current={pref} onPick={apply}>
        <SystemIcon />
      </Option>
      <Option label="Dark" value="dark" current={pref} onPick={apply}>
        <MoonIcon />
      </Option>
    </div>
  );
}

function Option({
  label,
  value,
  current,
  onPick,
  children,
}: {
  label: string;
  value: ThemePref;
  current: ThemePref;
  onPick: (v: ThemePref) => void;
  children: React.ReactNode;
}) {
  const selected = current === value;
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={selected}
      onClick={() => onPick(value)}
      className={`grid h-6 w-6 place-items-center rounded transition ${
        selected
          ? "bg-surface-2 text-text shadow-xs"
          : "text-text-faint hover:text-text"
      }`}
    >
      {children}
    </button>
  );
}

function SunIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" />
      <path d="m19.07 4.93-1.41 1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  );
}

function SystemIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path d="M8 20h8" />
      <path d="M12 17v3" />
    </svg>
  );
}
