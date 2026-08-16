"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createKeywordList } from "@/app/actions/keyword-lists";

export function KeywordListActions() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();

  function handleCreate() {
    if (!name.trim()) return;
    start(async () => {
      const result = await createKeywordList(name, desc);
      if (result.ok) {
        setOpen(false);
        setName("");
        setDesc("");
        router.refresh();
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="shrink-0 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg hover:bg-accent-hover"
      >
        + New List
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-lg">
            <h2 className="text-lg font-semibold text-text">Create Keyword List</h2>
            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="text-xs font-medium text-text-muted">List name</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Dubai cleaning services keywords"
                  className="mt-1 w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-text"
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-text-muted">Description (optional)</span>
                <input
                  type="text"
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  placeholder="Notes about this list"
                  className="mt-1 w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-text"
                />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md px-3 py-1.5 text-sm text-text-muted hover:text-text"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={pending || !name.trim()}
                className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-accent-fg hover:bg-accent-hover disabled:opacity-40"
              >
                {pending ? "Creating…" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
