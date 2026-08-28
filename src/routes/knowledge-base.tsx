import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Database,
  Globe,
  Layers,
  Sparkles,
  ShieldCheck,
  Bot,
  Plus,
  HelpCircle,
  FileText,
  ShieldAlert,
  CheckCircle2,
  Cpu,
  Server,
  ArrowRight,
  MapPin,
  RefreshCw,
  Pencil,
  Trash2,
  Check,
  X,
} from "lucide-react";
import { useSite } from "@/lib/site-context";
import { compileFullKnowledge } from "@/lib/ai-knowledge";
import type { StructuredKnowledgeBase, KbServiceItem, KbFaqItem } from "@/db/schema";
import { BUSINESS_CATEGORIES } from "@/lib/business-categories";
import { SitePagesPanel } from "@/components/site-pages-panel";
import { WordPressConnectionPanel } from "@/components/wordpress-connection-panel";

export const Route = createFileRoute("/knowledge-base")({
  head: () => ({
    meta: [
      { title: "Knowledge Base — AKS SEO Console" },
      {
        name: "description",
        content: "Centralized RAG Knowledge Base hub for website projects, service catalogs, brand rules, and the full site page inventory.",
      },
    ],
  }),
  component: KnowledgeBasePage,
});

function KnowledgeBasePage() {
  const { currentSite, allSites, setCurrentSiteId } = useSite();
  const [activeTab, setActiveTab] = useState<
    "services" | "brand" | "faqs" | "policies" | "network" | "pages" | "preview"
  >("services");

  // Local state for interactive editing — hydrated from the real Postgres
  // `sites` row on mount / site switch, and saved back via PATCH /api/sites/$id.
  const [plainText, setPlainText] = useState("");
  const [structured, setStructured] = useState<StructuredKnowledgeBase>({});
  const [businessCategory, setBusinessCategory] = useState<string>("");
  const [kbLoading, setKbLoading] = useState(true);
  const [kbSaving, setKbSaving] = useState(false);
  const [wpConnected, setWpConnected] = useState(false);
  const [wpSiteUrl, setWpSiteUrl] = useState<string | null>(null);
  const [wpUsername, setWpUsername] = useState<string | null>(null);

  const refetchSite = () => {
    if (!currentSite.id) return;
    fetch(`/api/sites/${currentSite.id}`)
      .then((r) => r.json())
      .then((json) => {
        if (!json?.ok || !json.site) return;
        setWpConnected(!!json.site.wpConnected);
        setWpSiteUrl(json.site.wpSiteUrl || null);
        setWpUsername(json.site.wpUsername || null);
      })
      .catch(() => {});
  };

  useEffect(() => {
    if (!currentSite.id) return;
    let cancelled = false;
    setKbLoading(true);
    fetch(`/api/sites/${currentSite.id}`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled || !json?.ok || !json.site) return;
        setPlainText(json.site.knowledgeBase || "");
        setStructured(json.site.structuredKb || {});
        setBusinessCategory(json.site.businessCategory || "");
        setWpConnected(!!json.site.wpConnected);
        setWpSiteUrl(json.site.wpSiteUrl || null);
        setWpUsername(json.site.wpUsername || null);
      })
      .catch(() => {
        if (!cancelled) toast.error("Failed to load Knowledge Base from Postgres");
      })
      .finally(() => {
        if (!cancelled) setKbLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentSite.id]);

  const saveBusinessCategory = async (categoryId: string) => {
    setBusinessCategory(categoryId);
    if (!currentSite.id) return;
    try {
      const res = await fetch(`/api/sites/${currentSite.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessCategory: categoryId }),
      });
      const json = await res.json();
      if (json?.ok) {
        toast.success("Business category saved — SEO Suite tools will use this to steer recommendations");
      } else {
        toast.error(json?.error || "Failed to save business category");
      }
    } catch {
      toast.error("Failed to save business category");
    }
  };

  const [gbpSyncing, setGbpSyncing] = useState(false);

  const syncFromGbp = async () => {
    if (!currentSite.id) return;
    setGbpSyncing(true);
    try {
      const res = await fetch(`/api/sites/${currentSite.id}/gbp-sync`, { method: "POST" });
      const json = await res.json();
      if (json?.ok) {
        toast.success(`Synced from Google Business Profile: ${json.synced.businessName || "location"}`);
        // Re-fetch the site so the structuredKb business profile reflects the sync.
        const siteRes = await fetch(`/api/sites/${currentSite.id}`);
        const siteJson = await siteRes.json();
        if (siteJson?.ok && siteJson.site) setStructured(siteJson.site.structuredKb || {});
      } else {
        toast.error(json?.error || "Failed to sync from Google Business Profile");
      }
    } catch {
      toast.error("Failed to sync from Google Business Profile");
    } finally {
      setGbpSyncing(false);
    }
  };

  const saveKnowledgeBase = async () => {
    if (!currentSite.id) return;
    setKbSaving(true);
    try {
      const res = await fetch(`/api/sites/${currentSite.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ knowledgeBase: plainText, structuredKb: structured }),
      });
      const json = await res.json();
      if (json?.ok) {
        toast.success("Knowledge Base saved to PostgreSQL");
      } else {
        toast.error(json?.error || "Failed to save Knowledge Base");
      }
    } catch {
      toast.error("Failed to save Knowledge Base");
    } finally {
      setKbSaving(false);
    }
  };

  const [newServiceName, setNewServiceName] = useState("");
  const [newServicePrice, setNewServicePrice] = useState("");
  const [newServiceCat, setNewServiceCat] = useState("");
  const [newFaqQ, setNewFaqQ] = useState("");
  const [newFaqA, setNewFaqA] = useState("");

  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [editServiceName, setEditServiceName] = useState("");
  const [editServiceCat, setEditServiceCat] = useState("");
  const [editServicePrice, setEditServicePrice] = useState("");
  const [editServiceTurnaround, setEditServiceTurnaround] = useState("");
  const [editServiceDesc, setEditServiceDesc] = useState("");

  // 1-Click URL Autonomy state: crawl → enqueue a claude_jobs row → poll it →
  // once the AKS worker completes it, re-fetch the site's real structuredKb.
  const [autocrawlUrl, setAutocrawlUrl] = useState(currentSite.domain ? `https://${currentSite.domain}/` : "");
  const [isCrawling, setIsCrawling] = useState(false);
  const [crawlStatus, setCrawlStatus] = useState<string>("");

  const pollJobUntilDone = async (jobId: string): Promise<{ status: string }> => {
    const POLL_MS = 3000;
    const MAX_ATTEMPTS = 100; // ~5 minutes
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      await new Promise((r) => setTimeout(r, POLL_MS));
      const res = await fetch(`/api/jobs/${jobId}`);
      const json = await res.json();
      const status = json?.job?.status;
      if (status === "done" || status === "failed") return { status };
      if (status === "running") setCrawlStatus("AKS worker is structuring the crawled pages…");
      else if (status === "claimed") setCrawlStatus("AKS worker claimed the job…");
      else setCrawlStatus("Waiting for the AKS worker — run `npm run worker` if none is running.");
    }
    return { status: "timeout" };
  };

  const handleLaunchAutonomy = async () => {
    if (!autocrawlUrl.trim() || !currentSite.id) return;
    setIsCrawling(true);
    setCrawlStatus("Crawling pages…");
    try {
      const res = await fetch("/api/knowledge/autocrawl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: autocrawlUrl.trim(), siteId: currentSite.id }),
      });
      const json = await res.json();

      if (!json.ok || !json.jobId) {
        toast.error(json.error || "Failed to crawl site");
        return;
      }

      toast.info(`Crawled ${json.pagesCrawled} page(s). Waiting for AKS worker to structure the Knowledge Base…`);
      setCrawlStatus("Waiting for the AKS worker — run `npm run worker` if none is running.");

      const { status } = await pollJobUntilDone(json.jobId);

      if (status === "done") {
        // The worker already PATCHed structuredKb directly; re-fetch the real row.
        const siteRes = await fetch(`/api/sites/${currentSite.id}`);
        const siteJson = await siteRes.json();
        if (siteJson?.ok && siteJson.site) {
          setPlainText(siteJson.site.knowledgeBase || "");
          setStructured(siteJson.site.structuredKb || {});
          toast.success(`Knowledge Base updated from ${autocrawlUrl}`);
        } else {
          toast.warning("Job completed but the Knowledge Base could not be reloaded — refresh the page.");
        }
      } else if (status === "failed") {
        toast.error("The AKS worker failed to structure this crawl. Check the Jobs Manager for the error.");
      } else {
        toast.info("Still waiting on the AKS worker. The job stays queued — check back or open the Jobs Manager.");
      }
    } catch {
      toast.error(`Failed to launch autonomy for ${autocrawlUrl}`);
    } finally {
      setIsCrawling(false);
      setCrawlStatus("");
    }
  };

  const addService = () => {
    if (!newServiceName.trim()) return;
    const item: KbServiceItem = {
      id: `s_${Date.now()}`,
      name: newServiceName.trim(),
      priceAed: newServicePrice.trim() || undefined,
      category: newServiceCat.trim() || "General",
    };
    setStructured((prev) => ({
      ...prev,
      services: [...(prev.services || []), item],
    }));
    setNewServiceName("");
    setNewServicePrice("");
    setNewServiceCat("");
    toast.success(`Added service: ${item.name}`);
  };

  const startEditService = (s: KbServiceItem) => {
    setEditingServiceId(s.id);
    setEditServiceName(s.name);
    setEditServiceCat(s.category || "");
    setEditServicePrice(s.priceAed || "");
    setEditServiceTurnaround(s.turnaround || "");
    setEditServiceDesc(s.description || "");
  };

  const saveEditService = (id: string) => {
    if (!editServiceName.trim()) {
      toast.error("Service name is required");
      return;
    }
    setStructured((prev) => ({
      ...prev,
      services: (prev.services || []).map((item) =>
        item.id === id
          ? {
              ...item,
              name: editServiceName.trim(),
              category: editServiceCat.trim() || "General",
              priceAed: editServicePrice.trim() || undefined,
              turnaround: editServiceTurnaround.trim() || undefined,
              description: editServiceDesc.trim() || undefined,
            }
          : item,
      ),
    }));
    setEditingServiceId(null);
    toast.success("Service updated");
  };

  const cancelEditService = () => {
    setEditingServiceId(null);
  };

  const addFaq = () => {
    if (!newFaqQ.trim() || !newFaqA.trim()) return;
    const item: KbFaqItem = {
      id: `f_${Date.now()}`,
      question: newFaqQ.trim(),
      answer: newFaqA.trim(),
    };
    setStructured((prev) => ({
      ...prev,
      faqs: [...(prev.faqs || []), item],
    }));
    setNewFaqQ("");
    setNewFaqA("");
    toast.success("Added new FAQ item");
  };

  const compiledPrompt = compileFullKnowledge({
    siteName: currentSite.label,
    city: currentSite.location,
    plainTextKb: plainText,
    structuredKb: structured,
  });

  return (
    <div className="min-h-screen bg-[#05070d] text-slate-200">
      <div className="mx-auto max-w-[1600px] px-3 sm:px-4 py-8 space-y-6">
        {/* Header */}
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-cyan-500/30 to-blue-600/30 ring-1 ring-cyan-400/40 shadow-[0_0_20px_rgba(34,211,238,0.25)]">
              <Database className="h-5 w-5 text-cyan-200" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-semibold text-white">Knowledge Base Hub</h1>
                <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-semibold text-cyan-200 uppercase tracking-wider">
                  PostgreSQL RAG
                </span>
              </div>
              <p className="text-sm text-slate-400">
                Grounding hub containing website project facts, service menus, pricing rules, FAQs, and brand specifications.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={saveKnowledgeBase}
              disabled={kbSaving || kbLoading}
              className="rounded-lg bg-cyan-400 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-300 transition shadow-[0_0_16px_rgba(34,211,238,0.3)] disabled:opacity-50"
            >
              {kbSaving ? "Saving…" : "Save Knowledge Base"}
            </button>
          </div>
        </header>

        {/* 1-Click URL Autonomous Setup Banner */}
        <div className="rounded-2xl border border-cyan-500/30 bg-gradient-to-r from-cyan-950/60 via-slate-900/80 to-slate-950 p-5 shadow-[0_0_30px_rgba(34,211,238,0.15)]">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-cyan-400 to-blue-500 text-slate-950 font-bold shadow-lg">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-white">⚡ URL → Knowledge Base</h3>
                  <span className="rounded-full border border-emerald-400/40 bg-emerald-400/10 px-2 py-0.5 text-[9px] font-mono font-bold text-emerald-300">
                    Live crawl + AKS worker
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Enter a website URL — crawls the homepage and a few interior pages (about/services/contact/pricing/FAQ), then the AKS worker (local Claude CLI) structures the real content into this Knowledge Base. Requires <code className="text-cyan-300">npm run worker</code> running somewhere.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <input
                type="text"
                placeholder="https://example.com/"
                value={autocrawlUrl}
                onChange={(e) => setAutocrawlUrl(e.target.value)}
                className="w-full sm:w-64 rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 font-mono text-xs text-cyan-200 focus:border-cyan-400 focus:outline-none"
              />
              <button
                onClick={handleLaunchAutonomy}
                disabled={isCrawling}
                className="shrink-0 inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 px-4 py-2 text-xs font-bold text-slate-950 hover:from-cyan-300 hover:to-blue-400 transition shadow-[0_0_16px_rgba(34,211,238,0.3)] disabled:opacity-50 cursor-pointer"
              >
                {isCrawling ? "Working…" : "Crawl & Structure"}
              </button>
            </div>
          </div>
          {isCrawling && crawlStatus && (
            <div className="mt-3 rounded-lg border border-cyan-500/20 bg-slate-950/60 px-3 py-2 text-[11px] text-cyan-200">
              {crawlStatus}
            </div>
          )}
        </div>

        {/* Status Band */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5">
            <div className="flex items-center justify-between text-slate-500 text-[10px] uppercase tracking-wider">
              <span>Database Engine</span>
              <Server className="h-3.5 w-3.5 text-cyan-300" />
            </div>
            <div className="mt-1 text-sm font-semibold text-white">Self-Hosted PostgreSQL</div>
            <div className="mt-0.5 text-[10px] text-emerald-300">pgvector extension ready</div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5">
            <div className="flex items-center justify-between text-slate-500 text-[10px] uppercase tracking-wider">
              <span>Active Site</span>
              <Globe className="h-3.5 w-3.5 text-cyan-300" />
            </div>
            <div className="mt-1 text-sm font-semibold text-cyan-200 truncate">{currentSite.label}</div>
            <div className="mt-0.5 text-[10px] text-slate-400 truncate">{currentSite.domain}</div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5">
            <div className="flex items-center justify-between text-slate-500 text-[10px] uppercase tracking-wider">
              <span>Services Catalog</span>
              <Layers className="h-3.5 w-3.5 text-cyan-300" />
            </div>
            <div className="mt-1 text-sm font-semibold text-white">{structured.services?.length || 0} Registered Services</div>
            <div className="mt-0.5 text-[10px] text-slate-400">Structured AED quotes</div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5">
            <div className="flex items-center justify-between text-slate-500 text-[10px] uppercase tracking-wider">
              <span>Agent Grounding</span>
              <Cpu className="h-3.5 w-3.5 text-cyan-300" />
            </div>
            <div className="mt-1 text-sm font-semibold text-emerald-300 flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> 100% Grounded
            </div>
            <div className="mt-0.5 text-[10px] text-slate-400">All 12 agents synced</div>
          </div>
        </div>

        {/* Site Selector Bar */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
          <div className="mb-2 text-[10px] uppercase tracking-wider text-slate-500">Select Website Project to Edit</div>
          <div className="flex flex-wrap gap-2">
            {allSites.map((s) => {
              const active = s.id === currentSite.id;
              return (
                <button
                  key={s.id}
                  onClick={() => setCurrentSiteId(s.id)}
                  className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs transition ${
                    active
                      ? "border-cyan-400 bg-cyan-500/20 text-white font-semibold shadow-[0_0_12px_rgba(34,211,238,0.25)]"
                      : "border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700 hover:text-white"
                  }`}
                >
                  <Globe className="h-3.5 w-3.5 text-cyan-300" />
                  <span>{s.label}</span>
                  <span className="text-[10px] text-slate-500">({s.domain})</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Business Category (steers SEO Suite tool prompts for this site) */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
          <div className="mb-2 text-[10px] uppercase tracking-wider text-slate-500">Business Category</div>
          <p className="mb-3 text-xs text-slate-500">
            Set the business vertical for {currentSite.label}. SEO Suite tools use this to steer recommendations
            (e.g. licensing/insurance for trades, E-E-A-T for medical/legal) instead of generic advice.
          </p>
          <select
            value={businessCategory}
            onChange={(e) => saveBusinessCategory(e.target.value)}
            className="w-full max-w-md rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-200 focus:border-cyan-400 focus:outline-none"
          >
            <option value="">Not set</option>
            {BUSINESS_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        {/* Google Business Profile sync — manual trigger, no scheduler in this app */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500">
                <MapPin className="h-3 w-3" /> Google Business Profile
              </div>
              <p className="text-xs text-slate-500">
                Pulls the real business name, address, and phone from your connected Google Business Profile into
                this site's Knowledge Base. Manual sync — click whenever the listing changes.
                {currentSite.gbpConnected && currentSite.gbpLocation && (
                  <span className="text-emerald-400"> Currently synced: {currentSite.gbpLocation}.</span>
                )}
              </p>
            </div>
            <button
              onClick={syncFromGbp}
              disabled={gbpSyncing}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-3 py-1.5 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-400/20 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${gbpSyncing ? "animate-spin" : ""}`} />
              {gbpSyncing ? "Syncing…" : "Sync from GBP"}
            </button>
          </div>
        </div>

        {/* WordPress publishing connection — required for the "To Review"
            approve-and-publish action on the agent dashboard's Kanban board */}
        <WordPressConnectionPanel
          siteId={currentSite.id}
          wpConnected={wpConnected}
          wpSiteUrl={wpSiteUrl}
          wpUsername={wpUsername}
          onConnected={refetchSite}
        />

        {/* Knowledge Studio Component Card */}
        <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-6 lg:p-8">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-2 border-b border-slate-800/80 pb-4">
            <div>
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                Knowledge Studio · <span className="text-cyan-300">{currentSite.label}</span>
                {kbLoading && <span className="ml-2 text-[10px] font-normal text-slate-500">Loading…</span>}
              </h2>
              <p className="mt-1 text-xs text-slate-400">
                All background agents (On-Page, Off-Page, Technical, Auditor, GEO, International) ground their prompts using this catalog.
              </p>
            </div>
            <Link
              to="/sites/$siteId"
              params={{ siteId: currentSite.id }}
              className="inline-flex items-center gap-1.5 text-xs text-cyan-300 hover:underline"
            >
              View full site profile <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {/* Navigation Tabs */}
          <div className="mb-5 flex flex-wrap gap-1 border-b border-slate-800 pb-2">
            {[
              { id: "services", label: "Services & Pricing Catalog", icon: Layers, count: structured.services?.length },
              { id: "brand", label: "Brand Voice & Personas", icon: Sparkles },
              { id: "faqs", label: "FAQs & Verified Q&A", icon: HelpCircle, count: structured.faqs?.length },
              { id: "policies", label: "Policies & Guarantees", icon: ShieldAlert, count: structured.policies?.length },
              { id: "network", label: "Network-Wide Mandates", icon: ShieldCheck },
              { id: "pages", label: "Site Pages", icon: FileText },
              { id: "preview", label: "Live Agent Prompt Dry-Run", icon: Bot },
            ].map((t) => {
              const active = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id as any)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-medium transition ${
                    active
                      ? "bg-cyan-400 text-slate-950 font-semibold shadow-[0_0_14px_rgba(34,211,238,0.3)]"
                      : "text-slate-300 hover:bg-slate-900 hover:text-white"
                  }`}
                >
                  <t.icon className="h-3.5 w-3.5" />
                  {t.label}
                  {t.count !== undefined && t.count > 0 && (
                    <span className={`ml-1 rounded-full px-1.5 py-0.2 text-[10px] ${active ? "bg-slate-950 text-cyan-200" : "bg-slate-800 text-cyan-300"}`}>
                      {t.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Site Pages Tab — real sitemap.xml inventory, replaces the old decorative Obsidian tab */}
          {activeTab === "pages" && <SitePagesPanel siteId={currentSite.id} domain={currentSite.domain} />}

          {/* 1. Services Catalog Tab */}
          {activeTab === "services" && (
            <div className="space-y-4">
              <div className="grid gap-2.5 rounded-xl border border-slate-800 bg-slate-950/80 p-3.5 sm:grid-cols-4">
                <input
                  placeholder="Service Name (e.g. Sofa Steam Clean)"
                  value={newServiceName}
                  onChange={(e) => setNewServiceName(e.target.value)}
                  className="rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-1.5 text-xs text-slate-100 focus:border-cyan-400/50 focus:outline-none"
                />
                <input
                  placeholder="Category (e.g. Deep Clean)"
                  value={newServiceCat}
                  onChange={(e) => setNewServiceCat(e.target.value)}
                  className="rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-1.5 text-xs text-slate-100 focus:border-cyan-400/50 focus:outline-none"
                />
                <input
                  placeholder="Price AED (e.g. 299)"
                  value={newServicePrice}
                  onChange={(e) => setNewServicePrice(e.target.value)}
                  className="rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-1.5 text-xs text-slate-100 focus:border-cyan-400/50 focus:outline-none"
                />
                <button
                  onClick={addService}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-cyan-400 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-cyan-300"
                >
                  <Plus className="h-4 w-4" /> Add Service
                </button>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-800">
                <table className="w-full text-xs">
                  <thead className="bg-slate-900/80 text-[10px] uppercase tracking-wider text-slate-400">
                    <tr>
                      <th className="px-4 py-2.5 text-left">Service Name</th>
                      <th className="px-4 py-2.5 text-left">Category</th>
                      <th className="px-4 py-2.5 text-left">Price (AED)</th>
                      <th className="px-4 py-2.5 text-left">Turnaround Time</th>
                      <th className="px-4 py-2.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(structured.services || []).map((s) => {
                      const isEditing = editingServiceId === s.id;
                      if (isEditing) {
                        return (
                          <tr key={s.id} className="border-t border-cyan-500/40 bg-cyan-950/20">
                            <td className="px-4 py-2.5">
                              <input
                                value={editServiceName}
                                onChange={(e) => setEditServiceName(e.target.value)}
                                placeholder="Service Name"
                                className="w-full rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs text-white focus:border-cyan-400 focus:outline-none"
                              />
                              <input
                                value={editServiceDesc}
                                onChange={(e) => setEditServiceDesc(e.target.value)}
                                placeholder="Optional description"
                                className="mt-1 w-full rounded-md border border-slate-800 bg-slate-900/80 px-2.5 py-0.5 text-[11px] text-slate-300 focus:border-cyan-400 focus:outline-none"
                              />
                            </td>
                            <td className="px-4 py-2.5">
                              <input
                                value={editServiceCat}
                                onChange={(e) => setEditServiceCat(e.target.value)}
                                placeholder="Category"
                                className="w-full rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs text-white focus:border-cyan-400 focus:outline-none"
                              />
                            </td>
                            <td className="px-4 py-2.5">
                              <input
                                value={editServicePrice}
                                onChange={(e) => setEditServicePrice(e.target.value)}
                                placeholder="Price AED"
                                className="w-24 rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs text-white font-mono focus:border-cyan-400 focus:outline-none"
                              />
                            </td>
                            <td className="px-4 py-2.5">
                              <input
                                value={editServiceTurnaround}
                                onChange={(e) => setEditServiceTurnaround(e.target.value)}
                                placeholder="e.g. Same Day"
                                className="w-28 rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs text-white focus:border-cyan-400 focus:outline-none"
                              />
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => saveEditService(s.id)}
                                  title="Save changes"
                                  className="inline-flex items-center justify-center rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-1.5 text-emerald-300 hover:bg-emerald-500/20 transition cursor-pointer"
                                >
                                  <Check className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={cancelEditService}
                                  title="Cancel"
                                  className="inline-flex items-center justify-center rounded-lg border border-slate-700 bg-slate-800 p-1.5 text-slate-400 hover:text-slate-200 transition cursor-pointer"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      }

                      return (
                        <tr key={s.id} className="border-t border-slate-800/70 hover:bg-slate-900/40">
                          <td className="px-4 py-2.5 font-medium text-white">
                            {s.name}
                            {s.description && <div className="text-[11px] text-slate-400">{s.description}</div>}
                          </td>
                          <td className="px-4 py-2.5 text-slate-300">{s.category || "General"}</td>
                          <td className="px-4 py-2.5 font-mono text-cyan-300">{s.priceAed ? `${s.priceAed} AED` : "Quote"}</td>
                          <td className="px-4 py-2.5 text-slate-400">{s.turnaround || "Same Day"}</td>
                          <td className="px-4 py-2.5 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => startEditService(s)}
                                title="Edit service"
                                className="inline-flex items-center justify-center rounded-lg border border-cyan-500/20 bg-cyan-500/10 p-1.5 text-cyan-300 hover:bg-cyan-500/20 hover:text-cyan-200 transition cursor-pointer"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setStructured((prev) => ({
                                    ...prev,
                                    services: prev.services?.filter((item) => item.id !== s.id),
                                  }));
                                  toast.info("Service removed");
                                }}
                                title="Delete service"
                                className="inline-flex items-center justify-center rounded-lg border border-rose-500/20 bg-rose-500/10 p-1.5 text-rose-400 hover:bg-rose-500/20 hover:text-rose-300 transition cursor-pointer"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {(!structured.services || structured.services.length === 0) && (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-500">
                          No services added to catalog yet. Add your first service above.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 2. Brand Voice Tab */}
          {activeTab === "brand" && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-300">Tone of Voice & Messaging Style</label>
                <input
                  defaultValue={structured.brandTone?.tone || "Professional, punctual, trustworthy, Dubai-market localized"}
                  onChange={(e) =>
                    setStructured((prev) => ({
                      ...prev,
                      brandTone: { ...(prev.brandTone || {}), tone: e.target.value },
                    }))
                  }
                  className="mt-1.5 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white focus:border-cyan-400/50 focus:outline-none"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-medium text-slate-300">Brand Rules — DOs (semicolon separated)</label>
                  <textarea
                    rows={4}
                    defaultValue={(structured.brandTone?.rulesDos || []).join("; ")}
                    onChange={(e) =>
                      setStructured((prev) => ({
                        ...prev,
                        brandTone: {
                          ...(prev.brandTone || {}),
                          rulesDos: e.target.value.split(";").map((s) => s.trim()).filter(Boolean),
                        },
                      }))
                    }
                    className="mt-1.5 w-full rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs text-white focus:border-cyan-400/50 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-300">Brand Rules — DON'Ts (semicolon separated)</label>
                  <textarea
                    rows={4}
                    defaultValue={(structured.brandTone?.rulesDonts || []).join("; ")}
                    onChange={(e) =>
                      setStructured((prev) => ({
                        ...prev,
                        brandTone: {
                          ...(prev.brandTone || {}),
                          rulesDonts: e.target.value.split(";").map((s) => s.trim()).filter(Boolean),
                        },
                      }))
                    }
                    className="mt-1.5 w-full rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs text-white focus:border-cyan-400/50 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* 3. FAQs Tab */}
          {activeTab === "faqs" && (
            <div className="space-y-4">
              <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-950/80 p-4">
                <input
                  placeholder="Question (e.g. Are eco-friendly cleaning supplies included?)"
                  value={newFaqQ}
                  onChange={(e) => setNewFaqQ(e.target.value)}
                  className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white focus:border-cyan-400/50 focus:outline-none"
                />
                <textarea
                  placeholder="Verified Answer for AI response grounding..."
                  rows={2}
                  value={newFaqA}
                  onChange={(e) => setNewFaqA(e.target.value)}
                  className="w-full rounded-lg border border-slate-800 bg-slate-900 p-3 text-xs text-white focus:border-cyan-400/50 focus:outline-none"
                />
                <button
                  onClick={addFaq}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-400 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-cyan-300"
                >
                  <Plus className="h-4 w-4" /> Add FAQ Item
                </button>
              </div>

              <div className="space-y-2.5">
                {(structured.faqs || []).map((f) => (
                  <div key={f.id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-semibold text-cyan-200 text-xs">Q: {f.question}</div>
                      <button
                        onClick={() => {
                          setStructured((prev) => ({
                            ...prev,
                            faqs: prev.faqs?.filter((item) => item.id !== f.id),
                          }));
                          toast.info("FAQ removed");
                        }}
                        className="text-xs text-rose-400 hover:underline"
                      >
                        Delete
                      </button>
                    </div>
                    <div className="mt-1.5 text-xs text-slate-300">A: {f.answer}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 4. Policies Tab */}
          {activeTab === "policies" && (
            <div className="space-y-3">
              {(structured.policies || []).map((p) => (
                <div key={p.id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                  <div className="font-semibold text-white text-xs">{p.title}</div>
                  <div className="mt-1 text-xs text-slate-400">{p.description}</div>
                </div>
              ))}
            </div>
          )}

          {/* 5. Network Tab */}
          {activeTab === "network" && (
            <div className="space-y-3">
              <label className="text-xs font-medium text-slate-300">
                Network-Wide AI Grounding Mandates (applies to every website in network)
              </label>
              <textarea
                rows={10}
                defaultValue={`OPERATOR: Ten By Ten Cleaning Company (Dubai). Parent brand behind every website project in this network.
SERVICE AREA: Dubai and wider UAE emirates (Sharjah, Abu Dhabi, Ajman, RAK on request).
HOURS: Sun-Thu 8am-8pm, Fri-Sat 9am-6pm.
POLICIES: Free cancellation up to 24h prior. Insured & background-checked staff. All quotes in AED including standard VAT.`}
                className="w-full rounded-xl border border-slate-800 bg-slate-950 p-4 font-mono text-xs text-slate-200 focus:border-cyan-400/50 focus:outline-none"
              />
            </div>
          )}

          {/* 6. Preview Tab */}
          {activeTab === "preview" && (
            <div>
              <div className="mb-2 text-xs text-slate-400">
                Live compiled Knowledge Base text injected into AI worker prompts when executing tasks for <span className="text-cyan-300 font-semibold">{currentSite.label}</span>:
              </div>
              <pre className="max-h-[400px] overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/90 p-4 font-mono text-xs text-cyan-200">
                {compiledPrompt}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
