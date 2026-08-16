"use client";

import { useState } from "react";

interface ImportedRow {
  keyword: string;
  volume: string;
  difficulty: string;
  cpc: string;
  intent: string;
}

export function ImportedKeywordsWidget() {
  const [rows, setRows] = useState<ImportedRow[]>([]);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editRow, setEditRow] = useState<ImportedRow>({ keyword: "", volume: "", difficulty: "", cpc: "", intent: "" });
  const [fileName, setFileName] = useState<string | null>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      if (!text) return;
      const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      if (lines.length === 0) return;

      const firstLine = lines[0].toLowerCase();
      const hasHeader = /keyword/i.test(firstLine);
      const dataLines = hasHeader ? lines.slice(1) : lines;

      const parsed: ImportedRow[] = dataLines.map((line) => {
        const cols = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
        return {
          keyword: cols[0] || "",
          volume: cols[1] || "",
          difficulty: cols[2] || "",
          cpc: cols[3] || "",
          intent: cols[4] || "",
        };
      }).filter((r) => r.keyword.length > 0);

      setRows(parsed);
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  function startEdit(idx: number) {
    setEditIdx(idx);
    setEditRow({ ...rows[idx] });
  }

  function saveEdit() {
    if (editIdx === null) return;
    setRows((prev) => prev.map((r, i) => (i === editIdx ? { ...editRow } : r)));
    setEditIdx(null);
  }

  function deleteRow(idx: number) {
    setRows((prev) => prev.filter((_, i) => i !== idx));
    if (editIdx === idx) setEditIdx(null);
  }

  function addRow() {
    setRows((prev) => [...prev, { keyword: "", volume: "", difficulty: "", cpc: "", intent: "" }]);
    setEditIdx(rows.length);
    setEditRow({ keyword: "", volume: "", difficulty: "", cpc: "", intent: "" });
  }

  if (rows.length === 0) {
    return (
      <section className="rounded-xl border border-dashed border-border bg-surface p-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-sm font-medium text-text">Import Keywords from CSV / Excel</p>
          <p className="max-w-md text-xs text-text-faint">
            Upload a CSV file with columns: Keyword, Volume, Difficulty, CPC, Intent.
            The first row can be a header — it will be auto-detected and skipped.
          </p>
          <label className="cursor-pointer rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition-colors hover:bg-accent-hover">
            Choose File
            <input type="file" accept=".csv,.xlsx,.xls,.txt" onChange={handleFile} className="hidden" />
          </label>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-text">Imported Keywords</h3>
          {fileName && <p className="text-xs text-text-faint">From: {fileName} · {rows.length} rows</p>}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={addRow}
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg hover:bg-accent-hover"
          >
            + Add Row
          </button>
          <label className="cursor-pointer rounded-md border border-border px-3 py-1.5 text-xs font-medium text-text-muted hover:border-border-strong hover:text-text">
            Import More
            <input type="file" accept=".csv,.xlsx,.xls,.txt" onChange={handleFile} className="hidden" />
          </label>
          <button
            type="button"
            onClick={() => { setRows([]); setFileName(null); }}
            className="rounded-md border border-danger/30 bg-danger-tint px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger/20"
          >
            Clear All
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-text-faint">
                <th className="px-4 py-3 font-medium">#</th>
                <th className="px-4 py-3 font-medium">Keyword</th>
                <th className="px-3 py-3 font-medium text-right">Volume</th>
                <th className="px-3 py-3 font-medium text-right">KD</th>
                <th className="px-3 py-3 font-medium text-right">CPC</th>
                <th className="px-3 py-3 font-medium">Intent</th>
                <th className="px-3 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-b border-border last:border-0 transition-colors hover:bg-surface-2">
                  {editIdx === i ? (
                    <>
                      <td className="px-4 py-2 text-xs text-text-faint">{i + 1}</td>
                      <td className="px-4 py-2">
                        <input
                          type="text"
                          value={editRow.keyword}
                          onChange={(e) => setEditRow({ ...editRow, keyword: e.target.value })}
                          className="w-full rounded border border-border-strong bg-surface-2 px-2 py-1 text-xs text-text"
                          autoFocus
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input type="text" value={editRow.volume} onChange={(e) => setEditRow({ ...editRow, volume: e.target.value })} className="w-20 rounded border border-border-strong bg-surface-2 px-2 py-1 text-right text-xs text-text" />
                      </td>
                      <td className="px-3 py-2">
                        <input type="text" value={editRow.difficulty} onChange={(e) => setEditRow({ ...editRow, difficulty: e.target.value })} className="w-16 rounded border border-border-strong bg-surface-2 px-2 py-1 text-right text-xs text-text" />
                      </td>
                      <td className="px-3 py-2">
                        <input type="text" value={editRow.cpc} onChange={(e) => setEditRow({ ...editRow, cpc: e.target.value })} className="w-16 rounded border border-border-strong bg-surface-2 px-2 py-1 text-right text-xs text-text" />
                      </td>
                      <td className="px-3 py-2">
                        <input type="text" value={editRow.intent} onChange={(e) => setEditRow({ ...editRow, intent: e.target.value })} className="w-24 rounded border border-border-strong bg-surface-2 px-2 py-1 text-xs text-text" />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button onClick={saveEdit} className="mr-1 text-xs font-medium text-success hover:underline">Save</button>
                        <button onClick={() => setEditIdx(null)} className="text-xs text-text-faint hover:underline">Cancel</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-2.5 text-xs text-text-faint">{i + 1}</td>
                      <td className="px-4 py-2.5 text-sm font-medium text-text">{row.keyword}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs text-text-muted">{row.volume || "—"}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs text-text-muted">{row.difficulty || "—"}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs text-text-muted">{row.cpc ? `$${row.cpc}` : "—"}</td>
                      <td className="px-3 py-2.5 text-xs text-text-muted">{row.intent || "—"}</td>
                      <td className="px-3 py-2.5 text-right">
                        <button onClick={() => startEdit(i)} className="mr-2 text-xs text-accent hover:underline">Edit</button>
                        <button onClick={() => deleteRow(i)} className="text-xs text-danger hover:underline">Delete</button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
