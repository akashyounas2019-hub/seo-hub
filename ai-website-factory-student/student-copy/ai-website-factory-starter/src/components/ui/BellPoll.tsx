"use client";

import { useEffect, useState } from "react";

/**
 * Bell-badge unread counter that polls every 30s.
 *
 * The initial value comes from the server render (so the badge isn't blank on
 * first paint). After mount, we poll `/api/notifications/unread-count` and
 * update local state. Polling pauses when the tab is hidden to avoid
 * unnecessary load.
 */
export function BellPoll({ initial }: { initial: number }) {
  const [count, setCount] = useState(initial);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        const resp = await fetch("/api/notifications/unread-count", {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (!resp.ok) return;
        const json = (await resp.json()) as { ok?: boolean; unread?: number };
        if (cancelled) return;
        if (json.ok && typeof json.unread === "number") setCount(json.unread);
      } catch {
        // Ignore network blips — next poll will try again.
      }
    };
    const id = setInterval(tick, 30_000);
    // Also tick once on first focus to catch up after a tab was hidden.
    const onVisible = () => {
      if (!document.hidden) void tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (count <= 0) return null;
  return (
    <span className="tnum absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-xs font-semibold text-brand-ivory">
      {count}
    </span>
  );
}
