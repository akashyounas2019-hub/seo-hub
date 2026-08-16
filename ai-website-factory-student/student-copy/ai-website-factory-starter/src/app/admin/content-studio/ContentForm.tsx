"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitContentGeneration } from "@/app/actions/content-studio";

interface SiteOption {
  id: string;
  name: string;
}

export function ContentForm({ sites }: { sites: SiteOption[] }) {
  const [keyword, setKeyword] = useState("");
  const [siteId, setSiteId] = useState(sites[0]?.id ?? "");
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: true; jobId: string } | { ok: false; error: string } | null>(null);
  const router = useRouter();

  const handleSubmit = () => {
    if (!keyword.trim() || !siteId) return;
    setResult(null);
    start(async () => {
      const res = await submitContentGeneration(keyword, siteId);
      setResult(res);
      if (res.ok) {
        setKeyword("");
        router.refresh();
      }
    });
  };

  return (
    <section className="rounded-xl border border-border bg-surface px-5 py-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-3">
        <div className="flex-1">
          <label className="mb-1.5 block text-xs font-medium text-text-faint">
            Target Keyword
          </label>
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            placeholder="e.g. deep cleaning Dubai"
            disabled={pending}
            className="h-9 w-full rounded-md border border-border bg-surface-2 px-3 text-sm text-text placeholder:text-text-faint focus-visible:border-border-strong focus-visible:outline-none disabled:opacity-50"
          />
        </div>
        <div className="sm:w-52">
          <label className="mb-1.5 block text-xs font-medium text-text-faint">
            Site
          </label>
          <select
            value={siteId}
            onChange={(e) => setSiteId(e.target.value)}
            disabled={pending || sites.length === 0}
            className="h-9 w-full rounded-md border border-border bg-surface-2 px-3 text-sm text-text focus-visible:border-border-strong focus-visible:outline-none disabled:opacity-50"
          >
            {sites.length === 0 && <option value="">No sites available</option>}
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={pending || !keyword.trim() || !siteId}
          className="h-9 shrink-0 rounded-md bg-accent px-4 text-sm font-semibold text-accent-fg hover:bg-accent-hover disabled:opacity-50"
        >
          {pending ? "Queuing..." : "Generate Content"}
        </button>
      </div>

      {result && result.ok && (
        <p className="mt-3 text-xs text-text-muted">
          Content generation queued — the AKS worker will pick this up.{" "}
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
