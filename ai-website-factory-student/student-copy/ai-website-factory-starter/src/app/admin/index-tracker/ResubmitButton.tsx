"use client";

import { useState, useTransition } from "react";
import { resubmitUrl } from "@/app/actions/index-tracker";

export function ResubmitButton({ siteId, url }: { siteId: string; url: string }) {
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    start(async () => {
      const result = await resubmitUrl(siteId, url);
      if (result.ok) {
        setDone(true);
        setTimeout(() => setDone(false), 3000);
      } else {
        setError(result.error ?? "failed");
        setTimeout(() => setError(null), 4000);
      }
    });
  }

  if (done) {
    return <span className="text-xs font-medium text-success">✓ Submitted</span>;
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-text-muted transition-colors hover:border-border-strong hover:text-text disabled:opacity-50"
    >
      {pending ? "Submitting…" : error ? `Failed — ${error}` : "Resubmit"}
    </button>
  );
}

export function ResubmitAllButton({ siteId, count }: { siteId: string; count: number }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function handleClick() {
    start(async () => {
      const { resubmitAllForSite } = await import("@/app/actions/index-tracker");
      const result = await resubmitAllForSite(siteId);
      if (result.ok) {
        setMsg(`Submitted ${result.submitted} URL${result.submitted === 1 ? "" : "s"}`);
      } else {
        setMsg(`Failed: ${result.error}`);
      }
      setTimeout(() => setMsg(null), 4000);
    });
  }

  if (count === 0) return null;

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg hover:bg-accent-hover disabled:opacity-50"
    >
      {pending ? "Submitting…" : msg ?? `Resubmit all (${count}) →`}
    </button>
  );
}
