"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addTrackedKeyword } from "@/app/actions/tracked-keywords";

export function AddKeywordForm({ siteId, siteUrl }: { siteId: string; siteUrl: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const [keyword, setKeyword] = useState("");
  const [targetUrl, setTargetUrl] = useState(siteUrl);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (!keyword.trim()) { setError("Keyword required"); return; }
    setError(null);
    start(async () => {
      const r = await addTrackedKeyword({ siteId, keyword, targetUrl, device });
      if (!r.ok) { setError(r.error === "already-tracked" ? "Already tracked" : r.error ?? "failed"); return; }
      setKeyword("");
      router.refresh();
    });
  };

  return (
    <div className="rounded-md border border-border bg-surface p-4 space-y-3">
      <div className="text-sm font-medium text-text">Track a new keyword</div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
        <input
          type="text"
          placeholder='e.g. "villa deep clean dubai marina"'
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          className="rounded border border-border bg-surface px-3 py-2 text-md text-text"
        />
        <input
          type="text"
          placeholder="Target URL"
          value={targetUrl}
          onChange={(e) => setTargetUrl(e.target.value)}
          className="rounded border border-border bg-surface px-3 py-2 text-md text-text"
        />
        <select
          value={device}
          onChange={(e) => setDevice(e.target.value as "desktop" | "mobile")}
          className="rounded border border-border bg-surface px-3 py-2 text-md text-text"
        >
          <option value="desktop">Desktop</option>
          <option value="mobile">Mobile</option>
        </select>
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="inline-flex h-9 items-center rounded-md bg-accent px-4 text-md font-medium text-accent-fg shadow-xs transition hover:bg-accent-hover disabled:opacity-50"
        >
          {pending ? "Adding…" : "Track"}
        </button>
      </div>
      {error && <div className="text-xs text-danger">{error}</div>}
    </div>
  );
}
