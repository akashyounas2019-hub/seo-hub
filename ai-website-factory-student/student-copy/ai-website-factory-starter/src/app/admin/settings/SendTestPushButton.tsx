"use client";
import { useState, useTransition } from "react";
import { sendTestPush } from "@/app/actions/push-test";

export function SendTestPushButton() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const run = () => {
    setMsg(null);
    start(async () => {
      const r = await sendTestPush();
      if (r.ok) {
        setMsg({ ok: true, text: `Sent ${r.sent} test push${r.sent === 1 ? "" : "es"}.` });
      } else {
        setMsg({ ok: false, text: r.error ?? "Failed" });
      }
    });
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="inline-flex h-8 items-center rounded-md border border-border bg-surface-2 px-3 text-md font-medium text-text shadow-xs transition hover:bg-surface-3 disabled:opacity-50"
      >
        {pending ? "Sending…" : "Send test push"}
      </button>
      {msg && (
        <div className={`text-xs ${msg.ok ? "text-success" : "text-danger"}`}>{msg.text}</div>
      )}
    </div>
  );
}
