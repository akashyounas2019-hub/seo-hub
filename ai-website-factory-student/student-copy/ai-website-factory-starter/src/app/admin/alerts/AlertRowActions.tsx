"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ackAlert, snoozeAlert, resolveAlert, dismissAlert } from "@/app/actions/alerts";

export function AlertRowActions({ alertId }: { alertId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function fire(fn: () => Promise<{ ok: boolean }>) {
    setErr(null);
    start(async () => {
      try {
        const r = await fn();
        if (!r.ok) setErr("action failed");
        else router.refresh();
      } catch (e) {
        setErr((e as Error).message);
      }
    });
  }

  const btn = "inline-flex h-7 items-center rounded-md border border-border bg-surface-2 px-2.5 text-xs font-medium text-text-muted shadow-xs transition hover:bg-surface-3 hover:text-text disabled:opacity-50";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" disabled={pending} onClick={() => fire(() => ackAlert(alertId))} className={btn}>
        Acknowledge
      </button>
      <button type="button" disabled={pending} onClick={() => fire(() => snoozeAlert(alertId, 4))} className={btn}>
        Snooze 4h
      </button>
      <button type="button" disabled={pending} onClick={() => fire(() => snoozeAlert(alertId, 24))} className={btn}>
        Snooze 24h
      </button>
      <button type="button" disabled={pending} onClick={() => fire(() => resolveAlert(alertId))} className={btn}>
        Resolve
      </button>
      <button type="button" disabled={pending} onClick={() => fire(() => dismissAlert(alertId))} className={btn + " text-danger"}>
        Dismiss
      </button>
      {err && <span className="text-xs text-danger">{err}</span>}
    </div>
  );
}
