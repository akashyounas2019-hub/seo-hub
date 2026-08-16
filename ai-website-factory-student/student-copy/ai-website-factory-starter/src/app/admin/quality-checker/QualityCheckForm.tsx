"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitQualityCheck } from "@/app/actions/quality-check";

export function QualityCheckForm() {
  const [url, setUrl] = useState("");
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: true; jobId: string } | { ok: false; error: string } | null>(null);
  const router = useRouter();

  const handleSubmit = () => {
    if (!url.trim()) return;
    setResult(null);
    start(async () => {
      const res = await submitQualityCheck(url);
      setResult(res);
      if (res.ok) {
        setUrl("");
        router.refresh();
      }
    });
  };

  return (
    <section className="rounded-xl border border-border bg-surface px-5 py-4">
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="mb-1.5 block text-xs font-medium text-text-faint">Page URL</label>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            placeholder="e.g. safaeewala.com/deep-cleaning-dubai"
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
            {pending ? "Queuing..." : "Analyze"}
          </button>
        </div>
      </div>

      {result && result.ok && (
        <p className="mt-3 text-xs text-text-muted">
          Quality check queued — the AKS worker will pick this up.{" "}
          <span className="font-mono text-text-faint">Job {result.jobId.slice(0, 8)}</span>
        </p>
      )}
      {result && !result.ok && (
        <p className="mt-3 text-xs" style={{ color: "var(--danger)" }}>
          Error: {result.error}
        </p>
      )}
    </section>
  );
}
