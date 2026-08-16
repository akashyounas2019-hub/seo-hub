"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { revokeSiteCredential, verifyExistingCredential } from "@/app/actions/site-credentials";

export function ManageCredentialButtons({ siteId }: { siteId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const reverify = () => {
    setMsg(null);
    start(async () => {
      const r = await verifyExistingCredential(siteId);
      setMsg({ ok: r.ok, text: r.ok ? "Verified ✓" : `Failed: ${r.error ?? r.status}` });
      router.refresh();
    });
  };

  const revoke = () => {
    if (!confirm("Revoke this credential? The agent will lose access until you add a new one. (You should also delete the app password in wp-admin.)")) return;
    setMsg(null);
    start(async () => {
      const r = await revokeSiteCredential(siteId);
      setMsg({ ok: r.ok, text: r.ok ? "Revoked." : "Failed." });
      router.refresh();
    });
  };

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={reverify}
        disabled={pending}
        className="inline-flex h-8 items-center rounded-md border border-border bg-surface-2 px-3 text-md font-medium text-text shadow-xs transition hover:bg-surface-3 disabled:opacity-50"
      >
        {pending ? "…" : "Re-verify"}
      </button>
      <button
        type="button"
        onClick={revoke}
        disabled={pending}
        className="inline-flex h-8 items-center rounded-md border border-danger/40 bg-danger-tint px-3 text-md font-medium text-danger transition hover:bg-danger/15 disabled:opacity-50"
      >
        Revoke
      </button>
      {msg && (
        <span className={`text-xs ${msg.ok ? "text-success" : "text-danger"}`}>{msg.text}</span>
      )}
    </div>
  );
}
