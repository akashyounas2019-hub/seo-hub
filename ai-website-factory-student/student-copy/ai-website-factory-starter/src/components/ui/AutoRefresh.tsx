"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Drop this inside a server component to auto-refresh the route every
 * `intervalMs` (default 30s). Uses Next.js `router.refresh()` so server
 * components re-execute and stream fresh data without a full page reload
 * — perfect for "live" dashboards backed by server-rendered queries.
 *
 * Pauses while the tab is hidden so we don't hammer the DB when nobody's
 * looking.
 */
export function AutoRefresh({ intervalMs = 30_000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    let id: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (id) return;
      id = setInterval(() => router.refresh(), intervalMs);
    };
    const stop = () => {
      if (id) clearInterval(id);
      id = null;
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else {
        // Refresh immediately on becoming visible so the user sees fresh
        // numbers instead of waiting up to intervalMs.
        router.refresh();
        start();
      }
    };
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [router, intervalMs]);
  return null;
}
