"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addCitation } from "@/app/actions/citation-queue";

const COMMON = ["yelp", "yellowpages", "bbb", "foursquare", "bing-places", "apple-maps"];

export function AddCitationForm({ siteId }: { siteId: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const [directory, setDirectory] = useState("");
  const [napState, setNapState] = useState<"unknown" | "not_listed" | "inconsistent" | "listed">("unknown");
  const [listingUrl, setListingUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (!directory.trim()) { setError("Directory required"); return; }
    setError(null);
    start(async () => {
      const r = await addCitation({ siteId, directory, napState, listingUrl });
      if (!r.ok) { setError(r.error === "already-tracked" ? "Already tracked" : r.error ?? "failed"); return; }
      setDirectory("");
      setListingUrl("");
      router.refresh();
    });
  };

  return (
    <div className="rounded-md border border-border bg-surface p-4 space-y-3">
      <div className="text-sm font-medium text-text">Track a citation</div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
        <input
          type="text"
          placeholder="Directory (yelp, yellowpages…)"
          value={directory}
          onChange={(e) => setDirectory(e.target.value)}
          list="common-directories"
          className="rounded border border-border bg-surface px-3 py-2 text-md text-text"
        />
        <datalist id="common-directories">
          {COMMON.map((d) => <option key={d} value={d} />)}
        </datalist>
        <input
          type="text"
          placeholder="Listing URL (optional)"
          value={listingUrl}
          onChange={(e) => setListingUrl(e.target.value)}
          className="rounded border border-border bg-surface px-3 py-2 text-md text-text"
        />
        <select
          value={napState}
          onChange={(e) => setNapState(e.target.value as "unknown" | "not_listed" | "inconsistent" | "listed")}
          className="rounded border border-border bg-surface px-3 py-2 text-md text-text"
        >
          <option value="unknown">Unknown</option>
          <option value="not_listed">Not listed</option>
          <option value="inconsistent">Inconsistent</option>
          <option value="listed">Listed</option>
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
