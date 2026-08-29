import { useState } from "react";
import { toast } from "sonner";
import {
  RefreshCw,
  ExternalLink,
  Facebook,
  Instagram,
  Linkedin,
  Youtube,
  Twitter,
  Music2,
  Ghost,
  type LucideIcon,
} from "lucide-react";
import type { KbSocialLinks } from "@/db/schema";

// Official public brand colors per platform (their own published brand
// guidelines) -- used for the icon chip and the "Active" accent, not an
// approximation. lucide-react has no dedicated TikTok/Snapchat/Pinterest
// glyph, so those three use a stand-in icon (still real, just not the
// platform's own logo mark) while keeping the real brand color.
const PLATFORM_META: Record<
  keyof Omit<KbSocialLinks, "scrapedFrom" | "scrapedAt">,
  { label: string; icon: LucideIcon; brandColor: string; brandColorSoft: string }
> = {
  facebook: { label: "Facebook", icon: Facebook, brandColor: "#1877F2", brandColorSoft: "rgba(24,119,242,0.12)" },
  instagram: { label: "Instagram", icon: Instagram, brandColor: "#E1306C", brandColorSoft: "rgba(225,48,108,0.12)" },
  tiktok: { label: "TikTok", icon: Music2, brandColor: "#000000", brandColorSoft: "rgba(37,244,238,0.12)" },
  snapchat: { label: "Snapchat", icon: Ghost, brandColor: "#FFFC00", brandColorSoft: "rgba(255,252,0,0.12)" },
  x: { label: "X (Twitter)", icon: Twitter, brandColor: "#000000", brandColorSoft: "rgba(255,255,255,0.08)" },
  pinterest: { label: "Pinterest", icon: ExternalLink, brandColor: "#E60023", brandColorSoft: "rgba(230,0,35,0.12)" },
  linkedin: { label: "LinkedIn", icon: Linkedin, brandColor: "#0A66C2", brandColorSoft: "rgba(10,102,194,0.12)" },
  youtube: { label: "YouTube", icon: Youtube, brandColor: "#FF0000", brandColorSoft: "rgba(255,0,0,0.12)" },
};

const PLATFORM_ORDER: (keyof typeof PLATFORM_META)[] = [
  "facebook", "instagram", "tiktok", "snapchat", "x", "pinterest", "linkedin", "youtube",
];

/**
 * Real social profile discovery: enter a Google Business Profile URL or the
 * business's own website, and a real Playwright pass (worker/social-scraper.mjs)
 * finds actual linked social profiles on that page -- never guessed from
 * the business name. Every known platform is always shown, styled in its
 * own official brand color, with a real Active/Not Connected status --
 * previously platforms with no discovered link were silently omitted
 * entirely rather than shown as "not connected."
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

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {PLATFORM_ORDER.map((key) => {
          const meta = PLATFORM_META[key];
          const Icon = meta.icon;
          const url = socialLinks?.[key];
          const connected = !!url;

          const chip = (
            <div
              className="flex items-center justify-between gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition"
              style={{
                borderColor: connected ? `${meta.brandColor}55` : "rgb(51 65 85)", // slate-700 fallback
                background: connected ? meta.brandColorSoft : "rgba(15,23,42,0.4)", // slate-900/40 fallback
              }}
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: connected ? meta.brandColor : "#64748b" }} />
                <span className={`truncate ${connected ? "text-white" : "text-slate-500"}`}>{meta.label}</span>
              </span>
              {connected ? (
                <ExternalLink className="h-3 w-3 shrink-0" style={{ color: meta.brandColor }} />
              ) : null}
            </div>
          );

          return (
            <div key={key} className="flex flex-col gap-1">
              {connected ? (
                <a href={url} target="_blank" rel="noreferrer" className="hover:brightness-110">
                  {chip}
                </a>
              ) : (
                chip
              )}
              <span
                className={`inline-flex w-fit items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${
                  connected
                    ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                    : "border-slate-700 bg-slate-900/60 text-slate-500"
                }`}
              >
                <span className={`h-1 w-1 rounded-full ${connected ? "bg-emerald-400" : "bg-slate-600"}`} />
                {connected ? "Active" : "Not Connected"}
              </span>
            </div>
          );
        })}
      </div>

      {socialLinks?.scrapedAt && (
        <p className="mt-3 text-[10px] text-slate-600">
          Last scraped {new Date(socialLinks.scrapedAt).toLocaleString()} from {socialLinks.scrapedFrom}
        </p>
      )}
    </div>
  );
}
