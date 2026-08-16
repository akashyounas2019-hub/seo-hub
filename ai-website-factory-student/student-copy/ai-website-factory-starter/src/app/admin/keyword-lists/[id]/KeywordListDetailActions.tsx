"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  deleteKeywordList,
  addKeywordToList,
  removeKeywordsFromList,
} from "@/app/actions/keyword-lists";

export function KeywordListDetailActions({ listId }: { listId: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const [keyword, setKeyword] = useState("");
  const [addMsg, setAddMsg] = useState("");

  function handleDelete() {
    if (!confirm("Delete this keyword list and all its keywords?")) return;
    start(async () => {
      await deleteKeywordList(listId);
      router.push("/admin/keyword-lists");
    });
  }

  function handleAdd() {
    if (!keyword.trim()) return;
    start(async () => {
      const result = await addKeywordToList(listId, keyword);
      if (result.ok) {
        setKeyword("");
        setAddMsg("Added!");
        router.refresh();
      } else {
        setAddMsg(result.error ?? "Error");
      }
      setTimeout(() => setAddMsg(""), 2000);
    });
  }

  function handleCsvImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      if (!text) return;
      const lines = text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
      if (lines.length === 0) return;
      const hasHeader = /keyword/i.test(lines[0]);
      const dataLines = hasHeader ? lines.slice(1) : lines;
      const keywords = dataLines.map((l) => l.split(",")[0].trim().replace(/^"|"$/g, "")).filter(Boolean);
      if (keywords.length === 0) { setAddMsg("No keywords found in file"); setTimeout(() => setAddMsg(""), 3000); return; }
      start(async () => {
        let added = 0;
        for (const kw of keywords) {
          const result = await addKeywordToList(listId, kw);
          if (result.ok) added++;
        }
        setAddMsg(`Imported ${added} keyword${added === 1 ? "" : "s"}`);
        router.refresh();
        setTimeout(() => setAddMsg(""), 3000);
      });
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex items-end gap-2">
        <label className="block">
          <span className="text-xs font-medium text-text-muted">Add keyword manually</span>
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="e.g. deep cleaning Dubai"
            className="mt-1 block w-64 rounded-md border border-border bg-surface-2 px-3 py-1.5 text-sm text-text"
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          />
        </label>
        <button
          type="button"
          onClick={handleAdd}
          disabled={pending || !keyword.trim()}
          className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg hover:bg-accent-hover disabled:opacity-40"
        >
          {pending ? "Adding…" : "Add"}
        </button>
        <label className="cursor-pointer rounded-md border border-border px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:border-border-strong hover:text-text">
          Import CSV
          <input type="file" accept=".csv,.xlsx,.xls,.txt" onChange={handleCsvImport} className="hidden" />
        </label>
        {addMsg && <span className="text-xs text-success">{addMsg}</span>}
      </div>
      <div className="ml-auto">
        <button
          type="button"
          onClick={handleDelete}
          disabled={pending}
          className="rounded-md border border-danger/30 bg-danger-tint px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger/20 disabled:opacity-40"
        >
          {pending ? "Deleting…" : "Delete List"}
        </button>
      </div>
    </div>
  );
}

export function KeywordListTable({
  items,
}: {
  items: {
    id: string;
    keyword: string;
    volume: number | null;
    difficulty: number | null;
    cpc: string | null;
    intent: string | null;
    addedAt: Date;
  }[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const router = useRouter();

  function toggleAll() {
    if (selected.size === items.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(items.map((i) => i.id)));
    }
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleDeleteSelected() {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} selected keyword${selected.size === 1 ? "" : "s"}?`)) return;
    start(async () => {
      await removeKeywordsFromList(Array.from(selected));
      setSelected(new Set());
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {selected.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg bg-surface-2 px-4 py-2">
          <span className="text-sm text-text">
            {selected.size} keyword{selected.size === 1 ? "" : "s"} selected
          </span>
          <button
            type="button"
            onClick={handleDeleteSelected}
            disabled={pending}
            className="rounded-md border border-danger/30 bg-danger-tint px-3 py-1 text-xs font-medium text-danger hover:bg-danger/20 disabled:opacity-40"
          >
            {pending ? "Deleting…" : "Delete Selected"}
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="text-xs text-text-muted hover:text-text"
          >
            Clear
          </button>
        </div>
      )}
      <div className="overflow-x-auto rounded-xl bg-surface shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-text-faint">
              <th className="px-4 py-3 w-10">
                <input
                  type="checkbox"
                  checked={selected.size === items.length && items.length > 0}
                  onChange={toggleAll}
                  className="accent-accent"
                />
              </th>
              <th className="px-4 py-3">Keyword</th>
              <th className="px-4 py-3 text-right">Volume</th>
              <th className="px-4 py-3 text-right">KD</th>
              <th className="px-4 py-3 text-right">CPC</th>
              <th className="px-4 py-3">Intent</th>
              <th className="px-4 py-3 text-right">Added</th>
            </tr>
          </thead>
          <tbody className="text-text">
            {items.map((item) => (
              <tr
                key={item.id}
                className={`border-b border-border/50 ${selected.has(item.id) ? "bg-accent/5" : ""}`}
              >
                <td className="px-4 py-2.5">
                  <input
                    type="checkbox"
                    checked={selected.has(item.id)}
                    onChange={() => toggle(item.id)}
                    className="accent-accent"
                  />
                </td>
                <td className="px-4 py-2.5 font-medium">{item.keyword}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {item.volume?.toLocaleString() ?? "—"}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  <span
                    className={
                      item.difficulty != null && item.difficulty < 35
                        ? "text-success"
                        : item.difficulty != null && item.difficulty > 60
                          ? "text-danger"
                          : ""
                    }
                  >
                    {item.difficulty ?? "—"}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {item.cpc ? `$${item.cpc}` : "—"}
                </td>
                <td className="px-4 py-2.5">
                  {item.intent ? (
                    <span className="rounded-full bg-accent-tint px-2 py-0.5 text-xs font-medium text-accent">
                      {item.intent}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-2.5 text-right text-xs text-text-faint">
                  {new Date(item.addedAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
