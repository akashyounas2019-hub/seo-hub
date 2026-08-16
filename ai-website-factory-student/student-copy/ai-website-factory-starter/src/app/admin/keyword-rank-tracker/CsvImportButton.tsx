"use client";

import { useState } from "react";

export function CsvImportButton() {
  const [msg, setMsg] = useState("");
  const [importing, setImporting] = useState(false);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      if (!text) { setImporting(false); return; }
      const lines = text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
      const hasHeader = /keyword/i.test(lines[0]);
      const dataLines = hasHeader ? lines.slice(1) : lines;
      const keywords = dataLines
        .map((l) => l.split(",")[0].trim().replace(/^"|"$/g, ""))
        .filter(Boolean);
      setMsg(`${keywords.length} keyword${keywords.length === 1 ? "" : "s"} imported from ${file.name}`);
      setImporting(false);
      setTimeout(() => setMsg(""), 4000);
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  return (
    <div className="flex items-center gap-2">
      <label className="cursor-pointer rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-muted transition-colors hover:border-border-strong hover:text-text">
        {importing ? "Importing…" : "Import CSV / Excel"}
        <input
          type="file"
          accept=".csv,.xlsx,.xls,.txt"
          onChange={handleFile}
          className="hidden"
          disabled={importing}
        />
      </label>
      {msg && (
        <span className="text-xs text-success">{msg}</span>
      )}
    </div>
  );
}
