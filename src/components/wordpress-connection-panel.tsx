import { useState } from "react";
import { toast } from "sonner";
import { Globe, RefreshCw, CheckCircle2, XCircle } from "lucide-react";

/**
 * Real WordPress Application Password connection form. Saves credentials
 * via PATCH /api/sites/$id (the app password is encrypted server-side,
 * src/lib/crypto.ts) and verifies them with a real call to the site's own
 * /wp-json/wp/v2/users/me before marking the site connected -- never marks
 * "connected" without an actual successful auth check.
 */
export function WordPressConnectionPanel({
  siteId,
  wpConnected,
  wpSiteUrl,
  wpUsername,
  onConnected,
}: {
  siteId: string;
  wpConnected: boolean;
  wpSiteUrl: string | null;
  wpUsername: string | null;
  onConnected: () => void;
}) {
  const [siteUrl, setSiteUrl] = useState(wpSiteUrl || "");
  const [username, setUsername] = useState(wpUsername || "");
  const [appPassword, setAppPassword] = useState("");
  const [verifying, setVerifying] = useState(false);

  const connect = async () => {
    if (!siteUrl.trim() || !username.trim() || !appPassword.trim()) {
      toast.error("Site URL, username, and Application Password are all required");
      return;
    }
    setVerifying(true);
    try {
      // Save credentials first (encrypted server-side), then verify the
      // real connection against the site's own REST API.
      const saveRes = await fetch(`/api/sites/${siteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wpSiteUrl: siteUrl.trim(),
          wpUsername: username.trim(),
          wpAppPassword: appPassword,
        }),
      });
      const saveJson = await saveRes.json();
      if (!saveJson?.ok) {
        toast.error(saveJson?.error || "Failed to save WordPress credentials");
        return;
      }

      const verifyRes = await fetch(`/api/sites/${siteId}/wp-verify`, { method: "POST" });
      const verifyJson = await verifyRes.json();
      if (verifyJson?.ok) {
        toast.success(`Connected to WordPress as ${verifyJson.userName || username}`);
        setAppPassword("");
        onConnected();
      } else {
        toast.error(verifyJson?.error || "Credentials saved, but the connection check failed");
      }
    } catch {
      toast.error("Failed to connect to WordPress");
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500">
            <Globe className="h-3 w-3" /> WordPress Publishing
          </div>
          <p className="text-xs text-slate-500">
            Real WordPress REST API connection (Application Password) — used to actually publish approved "To
            Review" tasks as live posts. Create one under wp-admin → Users → Profile → Application Passwords.
          </p>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
            wpConnected ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300" : "border-slate-700 bg-slate-900/60 text-slate-400"
          }`}
        >
          {wpConnected ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
          {wpConnected ? "Connected" : "Not connected"}
        </span>
      </div>

      <div className="mt-3 grid gap-2.5 sm:grid-cols-3">
        <input
          value={siteUrl}
          onChange={(e) => setSiteUrl(e.target.value)}
          placeholder="https://example.com"
          className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-200 focus:border-cyan-400 focus:outline-none"
        />
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="WordPress username"
          className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-200 focus:border-cyan-400 focus:outline-none"
        />
        <input
          value={appPassword}
          onChange={(e) => setAppPassword(e.target.value)}
          placeholder="xxxx xxxx xxxx xxxx xxxx xxxx"
          type="password"
          className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-200 focus:border-cyan-400 focus:outline-none"
        />
      </div>

      <button
        onClick={connect}
        disabled={verifying}
        className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-3 py-1.5 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-400/20 disabled:opacity-50"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${verifying ? "animate-spin" : ""}`} />
        {verifying ? "Verifying…" : wpConnected ? "Update & re-verify" : "Connect & verify"}
      </button>
    </div>
  );
}
