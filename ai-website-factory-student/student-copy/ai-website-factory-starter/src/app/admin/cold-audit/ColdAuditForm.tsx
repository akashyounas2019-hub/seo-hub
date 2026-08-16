"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitColdAudit } from "@/app/actions/cold-audit";

export function ColdAuditForm() {
  const [url, setUrl] = useState("");
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: true; jobId: string } | { ok: false; error: string } | null>(null);
  const router = useRouter();

  const handleSubmit = () => {
    if (!url.trim()) return;
    setResult(null);
    start(async () => {
      const res = await submitColdAudit(url);
      setResult(res);
      if (res.ok) {
        setUrl("");
        router.refresh();
      }
    });
  };

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex gap-3">
        <div className="flex flex-1 flex-col">
          <label className="mb-1.5 text-xs font-medium text-text-faint">URL to audit</label>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            placeholder="e.g. competitor-cleaning.com"
            disabled={pending}
            className="h-9 w-full rounded-md border border-border bg-surface-2 px-3 text-sm text-text placeholder:text-text-faint focus-visible:border-border-strong focus-visible:outline-none disabled:opacity-50"
          />
        </div>
        <div className="flex items-end">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={pending || !url.trim()}
            className="h-9 shrink-0 rounded-md bg-accent px-4 text-sm font-semibold text-accent-fg hover:bg-accent-hover disabled:opacity-50"
          >
            {pending ? "Queuing..." : "Run Audit"}
          </button>
        </div>
      </div>

      {result && result.ok && (
        <p className="mt-3 text-xs text-text-muted">
          Audit queued — the AKS worker will pick this up.{" "}
          <span className="font-mono text-text-faint">Job {result.jobId.slice(0, 8)}</span>
        </p>
      )}
      {result && !result.ok && (
        <p className="mt-3 text-xs" style={{ color: "var(--danger)" }}>
          Error: {result.error}
        </p>
      )}
    </div>
  );
}
