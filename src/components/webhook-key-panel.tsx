import { useEffect, useState } from "react";
import { toast } from "sonner";
import { KeyRound, RefreshCw, Copy, AlertTriangle, CheckCircle2 } from "lucide-react";

type WebhookKey = { id: string; keyId: string; active: boolean; createdAt: string; lastUsedAt: string | null };

/**
 * Real inbound-webhook API key for this site -- what a connected WordPress
 * site's lead-form plugin authenticates with when POSTing to
 * /api/events/ingest (HMAC-signed, src/lib/hmac.ts). Previously no UI
 * anywhere ever surfaced or generated one of these, so the real, correctly-
 * built ingest endpoint had nothing to actually authenticate against in
 * production. The secret is shown exactly once, right after generation --
 * it's never stored in plaintext and never returned again after this.
 */
export function WebhookKeyPanel({ siteId }: { siteId: string }) {
  const [key, setKey] = useState<WebhookKey | null>(null);
  const [loading, setLoading] = useState(true);
  const [rotating, setRotating] = useState(false);
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    fetch(`/api/sites/${siteId}/webhook-key`)
      .then((res) => res.json())
      .then((json) => {
        if (json?.ok) setKey(json.key);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    setRevealedSecret(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId]);

  const rotate = async () => {
    setRotating(true);
    try {
      const res = await fetch(`/api/sites/${siteId}/webhook-key`, { method: "POST" });
      const json = await res.json();
      if (json?.ok) {
        setRevealedSecret(json.secret);
        toast.success(key ? "Webhook key rotated — copy the new secret now, it won't be shown again" : "Webhook key generated — copy the secret now, it won't be shown again");
        load();
      } else {
        toast.error(json?.error || "Failed to generate webhook key");
      }
    } catch {
      toast.error("Failed to generate webhook key");
    } finally {
      setRotating(false);
    }
  };

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => toast.success(`${label} copied`));
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500">
            <KeyRound className="h-3 w-3" /> Inbound Webhook Key
          </div>
          <p className="text-xs text-slate-500">
            Real HMAC-signed credential a connected WordPress site's lead-form plugin uses to POST submissions to
            this app (<code className="text-cyan-300">/api/events/ingest</code>). Generate one, then configure it in
            your site's plugin.
          </p>
        </div>
        {!loading && (
          <span
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
              key ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300" : "border-slate-700 bg-slate-900/60 text-slate-400"
            }`}
          >
            {key ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
            {key ? "Key active" : "No key yet"}
          </span>
        )}
      </div>

      {!loading && key && (
        <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Key ID</div>
            <code className="text-xs text-cyan-200">{key.keyId}</code>
          </div>
          <button
            onClick={() => copy(key.keyId, "Key ID")}
            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-700 bg-slate-900/60 px-2 py-1 text-[11px] text-slate-300 hover:border-cyan-400/40 hover:text-cyan-200"
          >
            <Copy className="h-3 w-3" /> Copy
          </button>
        </div>
      )}

      {revealedSecret && (
        <div className="mt-3 rounded-lg border border-amber-400/30 bg-amber-500/5 p-3">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-300">
            <AlertTriangle className="h-3.5 w-3.5" /> Copy this secret now — it will not be shown again
          </div>
          <div className="mt-2 flex items-center justify-between gap-2 rounded-md border border-slate-800 bg-slate-950/80 px-3 py-2">
            <code className="min-w-0 flex-1 truncate text-xs text-white">{revealedSecret}</code>
            <button
              onClick={() => copy(revealedSecret, "Secret")}
              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-cyan-400/30 bg-cyan-400/10 px-2 py-1 text-[11px] text-cyan-200 hover:bg-cyan-400/20"
            >
              <Copy className="h-3 w-3" /> Copy
            </button>
          </div>
        </div>
      )}

      <button
        onClick={rotate}
        disabled={rotating}
        className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-3 py-1.5 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-400/20 disabled:opacity-50"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${rotating ? "animate-spin" : ""}`} />
        {rotating ? "Generating…" : key ? "Rotate key" : "Generate key"}
      </button>
    </div>
  );
}
