"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Polls the connection-status API every 4 seconds until the plugin
 * signs in. Once connected, advances to the next wizard step.
 *
 * Server-render gives an initial connected/not-connected state so the
 * UI is correct even before JS hydrates.
 */
export function ConnectionPoller({
  siteId,
  initiallyConnected,
  nextHref,
}: {
  siteId: string;
  initiallyConnected: boolean;
  nextHref: string;
}) {
  const router = useRouter();
  const [connected, setConnected] = useState(initiallyConnected);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [tries, setTries] = useState(0);

  useEffect(() => {
    if (connected) return;
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch(`/api/sites/${siteId}/connection-status`, { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as { connected: boolean };
        if (!alive) return;
        setLastChecked(new Date());
        setTries((n) => n + 1);
        if (json.connected) {
          setConnected(true);
          // Give the user a moment to see the success state before advancing.
          setTimeout(() => router.push(nextHref), 1200);
        }
      } catch {
        // network blip — try again on next tick
      }
    };
    void tick();
    const handle = setInterval(tick, 4000);
    return () => {
      alive = false;
      clearInterval(handle);
    };
  }, [connected, siteId, nextHref, router]);

  return (
    <div
      className={`rounded-xl border p-5 transition-colors ${
        connected
          ? "border-success bg-success-tint/30"
          : "border-border bg-surface"
      }`}
    >
      <div className="flex items-start gap-3">
        {connected ? (
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-success text-xs font-medium text-surface">
            ✓
          </span>
        ) : (
          <span className="relative grid h-7 w-7 shrink-0 place-items-center" aria-hidden>
            <span className="absolute inset-0 animate-ping rounded-full bg-accent/30" />
            <span className="relative h-3 w-3 rounded-full bg-accent" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-text">
            {connected ? "Plugin connected — opening configuration…" : "Waiting for the plugin to sign in"}
          </div>
          <p className="mt-1 text-xs text-text-muted">
            {connected
              ? "Heartbeat received. You're being redirected to the policy setup step."
              : "Once you activate the plugin and paste the credentials above, this card flips to green automatically."}
          </p>
          {!connected && lastChecked ? (
            <p className="mt-1 text-xs text-text-faint">
              Checked {tries} time{tries === 1 ? "" : "s"} · last at {lastChecked.toLocaleTimeString()}
            </p>
          ) : null}
        </div>
      </div>
      {!connected ? (
        <div className="mt-4 border-t border-border pt-3 text-xs text-text-faint">
          Already installed but waiting? Re-save the plugin settings on the WP side and the heartbeat fires immediately.
        </div>
      ) : null}
    </div>
  );
}
