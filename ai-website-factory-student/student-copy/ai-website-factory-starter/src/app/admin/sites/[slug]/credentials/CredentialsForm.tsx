"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveSiteCredential } from "@/app/actions/site-credentials";

export function CredentialsForm({ siteId, domain }: { siteId: string; domain: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [username, setUsername] = useState("");
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = () => {
    if (!username.trim() || !pw.trim()) {
      setMsg({ ok: false, text: "Both fields are required." });
      return;
    }
    setMsg(null);
    start(async () => {
      const r = await saveSiteCredential({ siteId, username, appPassword: pw });
      if (r.ok) {
        setUsername("");
        setPw("");
        setMsg({ ok: true, text: `Verified — logged in as ${r.user?.name ?? r.user?.slug ?? "the user"} on ${domain}.` });
        router.refresh();
      } else {
        setMsg({ ok: false, text: r.error ?? `Verify failed (${r.status ?? "unknown"})` });
      }
    });
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block text-xs font-medium text-text-muted">
          WordPress username
          <input
            type="text"
            autoComplete="off"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="admin"
            className="mt-1 w-full rounded border border-border bg-surface px-3 py-2 text-sm text-text"
          />
        </label>
        <label className="block text-xs font-medium text-text-muted">
          Application Password
          <input
            type="password"
            autoComplete="off"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="xxxx xxxx xxxx xxxx xxxx xxxx"
            className="mt-1 w-full rounded border border-border bg-surface px-3 py-2 font-mono text-xs text-text"
          />
        </label>
      </div>
      <p className="text-xs text-text-faint">
        Spaces are stripped — paste it however WordPress shows it.
      </p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="inline-flex h-9 items-center rounded-md bg-accent px-4 text-md font-medium text-accent-fg shadow-xs transition hover:bg-accent-hover disabled:opacity-50"
        >
          {pending ? "Verifying…" : "Verify & save"}
        </button>
        {msg && (
          <span className={`text-xs ${msg.ok ? "text-success" : "text-danger"}`}>{msg.text}</span>
        )}
      </div>
    </div>
  );
}
