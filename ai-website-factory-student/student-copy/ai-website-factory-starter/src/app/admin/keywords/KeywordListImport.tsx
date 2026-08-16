"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createKeywordList } from "@/app/actions/keyword-lists";
import { addKeywordToList } from "@/app/actions/keyword-lists";

export function KeywordListImport() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  const router = useRouter();

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const listName = file.name.replace(/\.(csv|xlsx|xls|txt)$/i, "");
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      if (!text) return;
      const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const hasHeader = /keyword/i.test(lines[0]);
      const dataLines = hasHeader ? lines.slice(1) : lines;
      const keywords = dataLines
        .map((l) => l.split(",")[0].trim().replace(/^"|"$/g, ""))
        .filter(Boolean);
      if (keywords.length === 0) {
        setMsg("No keywords found in file");
        setTimeout(() => setMsg(""), 3000);
        return;
      }
      start(async () => {
        const result = await createKeywordList(listName, `Imported from ${file.name}`);
        if (result.ok && result.id) {
          let added = 0;
          for (const kw of keywords) {
            const r = await addKeywordToList(result.id, kw);
            if (r.ok) added++;
          }
          setMsg(`Created "${listName}" with ${added} keywords`);
          router.refresh();
        } else {
          setMsg("Failed to create list");
        }
        setTimeout(() => setMsg(""), 4000);
      });
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  return (
    <div className="flex items-center gap-2">
      <label className={`cursor-pointer rounded-md border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:border-border-strong hover:text-text ${pending ? "opacity-50 pointer-events-none" : "text-text-muted"}`}>
        {pending ? "Importing…" : "Import CSV"}
        <input type="file" accept=".csv,.xlsx,.xls,.txt" onChange={handleFile} className="hidden" disabled={pending} />
      </label>
      {msg && <span className="text-xs text-success">{msg}</span>}
    </div>
  );
}
