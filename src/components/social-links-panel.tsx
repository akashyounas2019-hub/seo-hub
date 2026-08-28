import { useState } from "react";
import { toast } from "sonner";
import { RefreshCw, ExternalLink, Facebook } from "lucide-react";
import type { KbSocialLinks } from "@/db/schema";

const PLATFORM_META: Record<
  keyof Omit<KbSocialLinks, "scrapedFrom" | "scrapedAt">,
  { label: string; color: string }
> = {
  facebook: { label: "Facebook", color: "border-blue-400/30 bg-blue-500/10 text-blue-200" },
  instagram: { label: "Instagram", color: "border-pink-400/30 bg-pink-500/10 text-pink-200" },
  tiktok: { label: "TikTok", color: "border-slate-500/30 bg-slate-700/30 text-slate-200" },
  snapchat: { label: "Snapchat", color: "border-yellow-400/30 bg-yellow-500/10 text-yellow-200" },
  x: { label: "X (Twitter)", color: "border-slate-400/30 bg-slate-700/30 text-slate-200" },
  pinterest: { label: "Pinterest", color: "border-red-400/30 bg-red-500/10 text-red-200" },
  linkedin: { label: "LinkedIn", color: "border-sky-400/30 bg-sky-500/10 text-sky-200" },
  youtube: { label: "YouTube", color: "border-rose-400/30 bg-rose-500/10 text-rose-200" },
};

/**
 * Real social profile discovery: enter a Google Business Profile URL or the
 * business's own website, and a real Playwright pass (worker/social-scraper.mjs)
 * finds actual linked social profiles on that page -- never guessed from
 * the business name. Results are stored in structuredKb.socialLinks and
 * shown here once found.
 */
export function SocialLinksPanel({
  siteId,
  socialLinks,
  onScraped,
}: {
  siteId: string;
  socialLinks: KbSocialLinks | undefined;
  onScraped: () => void;
}) {
  const [targetUrl, setTargetUrl] = useState("");
  const [scraping, setScraping] = useState(false);
  const [status, setStatus] = useState("");

  const pollJob = async (jobId: string): Promise<string> => {
    const POLL_MS = 3000;
    const MAX_ATTEMPTS = 60; // ~3 minutes -- one page nav + optional follow-through
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      await new Promise((r) => setTimeout(r, POLL_MS));
      const res = await fetch(`/api/jobs/${jobId}`);
      const json = await res.json();
      const jobStatus = json?.job?.status;
      if (jobStatus === "done" || jobStatus === "failed") return jobStatus;
      if (jobStatus === "running") setStatus("AKS worker is scraping the page…");
      else if (jobStatus === "claimed") setStatus("AKS worker claimed the job…");
      else setStatus("Waiting for the AKS worker — run `npm run worker` if none is running.");
    }
    return "timeout";
  };

  const scrape = async () => {
    if (!targetUrl.trim()) {
      toast.error("Enter a Google Business Profile URL or website URL");
      return;
    }
    setScraping(true);
    setStatus("Starting scrape…");
    try {
      const res = await fetch("/api/social/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId, targetUrl: targetUrl.trim() }),
      });
      const json = await res.json();
      if (!json?.ok || !json.jobId) {
        toast.error(json?.error || "Failed to start scrape");
        return;
      }
      setStatus("Waiting for the AKS worker — run `npm run worker` if none is running.");
      const finalStatus = await pollJob(json.jobId);
      if (finalStatus === "done") {
        toast.success("Social profiles scraped");
        onScraped();
      } else if (finalStatus === "failed") {
        toast.error("Scrape failed — check the worker logs.");
      } else {
        toast.info("Still running in the background — check back shortly.");
      }
    } catch {
      toast.error("Failed to start scrape");
    } finally {
      setScraping(false);
      setStatus("");
    }
  };

  const platformEntries = socialLinks
    ? (Object.entries(socialLinks) as [string, string][]).filter(
        ([k, v]) => k !== "scrapedFrom" && k !== "scrapedAt" && !!v,
      )
    : [];

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
      <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500">
        <Facebook className="h-3 w-3" /> Social Profiles
      </div>
      <p className="mb-3 text-xs text-slate-500">
        Enter a Google Business Profile URL (or the business website) — a real Playwright pass finds actual linked
        social profiles on that page. Nothing here is guessed from the business name.
      </p>

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={targetUrl}
          onChange={(e) => setTargetUrl(e.target.value)}
          placeholder="https://g.page/... or https://example.com"
          className="flex-1 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-200 focus:border-cyan-400 focus:outline-none"
        />
        <button
          onClick={scrape}
          disabled={scraping}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-400/20 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${scraping ? "animate-spin" : ""}`} />
          {scraping ? (status || "Scraping…") : "Scrape social profiles"}
        </button>
      </div>

      {platformEntries.length > 0 ? (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {platformEntries.map(([key, url]) => {
            const meta = PLATFORM_META[key as keyof typeof PLATFORM_META];
            if (!meta) return null;
            return (
              <a
                key={key}
                href={url}
                target="_blank"
                rel="noreferrer"
                className={`flex items-center justify-between gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition hover:brightness-110 ${meta.color}`}
              >
                <span className="truncate">{meta.label}</span>
                <ExternalLink className="h-3 w-3 shrink-0" />
              </a>
            );
          })}
        </div>
      ) : (
        <div className="mt-4 rounded-lg border border-dashed border-slate-800 bg-slate-900/30 p-4 text-center text-[11px] text-slate-500">
          No social profiles found yet. Enter a URL above and scrape.
        </div>
      )}

      {socialLinks?.scrapedAt && (
        <p className="mt-2 text-[10px] text-slate-600">
          Last scraped {new Date(socialLinks.scrapedAt).toLocaleString()} from {socialLinks.scrapedFrom}
        </p>
      )}
    </div>
  );
}
