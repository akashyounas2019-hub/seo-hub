"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Global keyboard shortcuts. Two-press "g" then a letter pattern, plus a
 * cheat-sheet that opens on `?`.
 *
 * Bindings:
 *   g b → /admin/build (new website)
 *   g t → /admin/tasks
 *   g k → /admin/keywords
 *   g s → /admin/sites
 *   g a → /admin/seo (autopilot)
 *   g h → /admin/seo-health
 *   g c → /admin/chat
 *   g m → /admin/me
 *   ?   → open cheat sheet
 *   ESC → close cheat sheet
 *
 * Skipped when focus is in an editable element so it doesn't fight with
 * the user typing.
 */
const ROUTES: Record<string, string> = {
  b: "/admin/build",
  t: "/admin/tasks",
  k: "/admin/keywords",
  s: "/admin/sites",
  a: "/admin/seo",
  h: "/admin/seo-health",
  c: "/admin/chat",
  m: "/admin/me",
};

const CHEAT = Object.entries(ROUTES).map(([k, path]) => ({
  combo: `g ${k}`,
  label: path.replace(/^\/admin\/?/, "") || "overview",
  path,
}));

function inEditable(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export function KeyboardShortcuts() {
  const router = useRouter();
  const [waitingForG, setWaitingForG] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    let resetHandle: number | undefined;
    const onKey = (e: KeyboardEvent) => {
      if (inEditable(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "?" || (e.shiftKey && e.key === "/")) {
        e.preventDefault();
        setSheetOpen((v) => !v);
        return;
      }
      if (e.key === "Escape" && sheetOpen) {
        setSheetOpen(false);
        return;
      }

      if (!waitingForG && e.key === "g") {
        setWaitingForG(true);
        window.clearTimeout(resetHandle);
        resetHandle = window.setTimeout(() => setWaitingForG(false), 1100);
        return;
      }
      if (waitingForG) {
        setWaitingForG(false);
        window.clearTimeout(resetHandle);
        const path = ROUTES[e.key.toLowerCase()];
        if (path) {
          e.preventDefault();
          router.push(path);
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.clearTimeout(resetHandle);
    };
  }, [router, waitingForG, sheetOpen]);

  if (!sheetOpen) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <button
        type="button"
        aria-label="Close shortcuts"
        onClick={() => setSheetOpen(false)}
        className="absolute inset-0 bg-brand-navy-deep/40 backdrop-blur-[2px]"
      />
      <div role="dialog" aria-modal="true" className="relative w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-pop">
        <h2 className="font-serif text-md text-text">Keyboard shortcuts</h2>
        <p className="mt-1 text-xs text-text-muted">
          Press <kbd>g</kbd> then a letter to jump. Press <kbd>?</kbd> any time to reopen this.
        </p>
        <ul className="mt-4 space-y-1.5">
          {CHEAT.map((c) => (
            <li key={c.combo} className="flex items-center justify-between text-xs">
              <span className="text-text">{c.label}</span>
              <span className="flex items-center gap-1">
                <kbd>g</kbd>
                <kbd>{c.combo.slice(2)}</kbd>
              </span>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => setSheetOpen(false)}
          className="mt-5 w-full rounded-md bg-surface-2 px-3 py-1.5 text-xs font-medium text-text-muted hover:bg-surface-3 hover:text-text"
        >
          Close (ESC)
        </button>
      </div>
    </div>
  );
}
