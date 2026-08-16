"use client";

import { useState, useTransition } from "react";
import { requestRemoval, clearRemovalRequest } from "@/app/actions/index-tracker";

/**
 * "De-index" action. Google's Indexing API only accepts removals for
 * JobPosting/BroadcastEvent pages — it rejects ordinary content pages, so a
 * literal API call here would mostly fail. Instead this flags the URL and
 * shows the noindex instructions an admin needs to actually get it removed.
 */
export function RemovalButton({ siteId, url, requested }: { siteId: string; url: string; requested: boolean }) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");

  if (requested) {
    return (
      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => { await clearRemovalRequest(siteId, url); })}
        className="rounded-md border border-warning/30 bg-warning-tint px-2.5 py-1 text-xs font-medium text-warning transition-colors hover:border-warning/50 disabled:opacity-50"
      >
        {pending ? "Clearing…" : "Clear removal flag"}
      </button>
    );
  }

  if (open) {
    return (
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Reason (optional)"
          className="w-32 rounded-md border border-border bg-surface px-2 py-1 text-xs text-text placeholder:text-text-faint focus:border-accent focus:outline-none"
        />
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              await requestRemoval(siteId, url, note);
              setOpen(false);
            })
          }
          className="rounded-md bg-danger px-2.5 py-1 text-xs font-medium text-danger-fg hover:bg-danger/90 disabled:opacity-50"
        >
          {pending ? "Flagging…" : "Confirm"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md border border-border px-2 py-1 text-xs text-text-faint hover:text-text"
        >
          ×
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-text-muted transition-colors hover:border-danger/40 hover:text-danger"
      title="Google has no removal API for ordinary pages — this flags the page and shows noindex instructions instead of calling a non-functional API."
    >
      Request removal
    </button>
  );
}
