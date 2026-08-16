"use client";

import { useEffect, useRef } from "react";

/**
 * Slide-over panel — opens from the right, full-height, with backdrop.
 *
 * Behaviour:
 *   - Backdrop click closes
 *   - ESC closes
 *   - Focus returns to the trigger after close (passed via `returnFocusRef`)
 *   - Body scroll-locked while open
 *   - Off-canvas slide-in animation respects prefers-reduced-motion
 */
export function Slideover({
  open,
  onClose,
  title,
  subtitle,
  children,
  width = 480,
  returnFocusRef,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  width?: number;
  returnFocusRef?: React.RefObject<HTMLElement>;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  // ESC to close + focus management.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    // Lock body scroll.
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Focus the panel for screen-reader announce.
    setTimeout(() => panelRef.current?.focus(), 60);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = original;
      returnFocusRef?.current?.focus?.();
    };
  }, [open, onClose, returnFocusRef]);

  return (
    <div
      aria-hidden={!open}
      className={`fixed inset-0 z-50 transition-opacity duration-200 ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close panel"
        onClick={onClose}
        className="absolute inset-0 bg-brand-navy-deep/30 backdrop-blur-[2px]"
        tabIndex={open ? 0 : -1}
      />
      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="slideover-title"
        tabIndex={-1}
        className={`absolute right-0 top-0 flex h-full flex-col border-l border-border bg-surface shadow-pop transition-transform duration-200 ${open ? "translate-x-0" : "translate-x-full"}`}
        style={{ width: `min(${width}px, 100vw)` }}
      >
        <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 id="slideover-title" className="font-serif text-md leading-tight text-text">
              {title}
            </h2>
            {subtitle ? <p className="mt-0.5 text-xs text-text-muted">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-md p-1 text-text-faint hover:bg-surface-2 hover:text-text focus-visible:bg-surface-2"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path d="M5 5l8 8M13 5l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
            </svg>
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 text-sm text-text">
          {children}
        </div>
      </div>
    </div>
  );
}
