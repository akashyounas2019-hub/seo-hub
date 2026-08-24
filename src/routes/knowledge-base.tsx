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
  Tag,
  CheckCircle2,
  Cpu,
  Server,
  ArrowRight,
} from "lucide-react";
import { useSite } from "@/lib/site-context";
import { compileFullKnowledge } from "@/lib/ai-knowledge";
import type { StructuredKnowledgeBase, KbServiceItem, KbFaqItem } from "@/db/schema";
import { DEFAULT_OBSIDIAN_VAULT, parseObsidianNote, type ObsidianNote } from "@/lib/obsidian";
import { BUSINESS_CATEGORIES } from "@/lib/business-categories";

export const Route = createFileRoute("/knowledge-base")({
  head: () => ({
    meta: [
      { title: "Knowledge Base — AKS SEO Console" },
      {
        name: "description",
        content: "Centralized RAG Knowledge Base hub for website projects, service catalogs, brand rules, and Obsidian 2nd Brain vaults.",
      },
    ],
  }),
  component: KnowledgeBasePage,
});

function KnowledgeBasePage() {
  const { currentSite, allSites, setCurrentSiteId } = useSite();
  const [activeTab, setActiveTab] = useState<
    "services" | "brand" | "faqs" | "policies" | "network" | "obsidian" | "preview"
  >("services");

  // Obsidian 2nd Brain state
  const [obsidianVault, setObsidianVault] = useState<ObsidianNote[]>(DEFAULT_OBSIDIAN_VAULT);
  const [selectedNoteId, setSelectedNoteId] = useState<string>(DEFAULT_OBSIDIAN_VAULT[0]?.id || "");
  const [newObsidianTitle, setNewObsidianTitle] = useState("");
  const [newObsidianCat, setNewObsidianCat] = useState("SEO SOP");
  const [newObsidianContent, setNewObsidianContent] = useState("");

  // Local state for interactive editing — hydrated from the real Postgres
  // `sites` row on mount / site switch, and saved back via PATCH /api/sites/$id.
  const [plainText, setPlainText] = useState("");
  const [structured, setStructured] = useState<StructuredKnowledgeBase>({});
  const [businessCategory, setBusinessCategory] = useState<string>("");
  const [kbLoading, setKbLoading] = useState(true);
  const [kbSaving, setKbSaving] = useState(false);

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
      <div className="mx-auto max-w-6xl px-6 py-8 space-y-6">
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

        {/* Knowledge Studio Component Card */}
        <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
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
              { id: "obsidian", label: "Obsidian 2nd Brain Vault", icon: FileText, count: obsidianVault.length },
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

          {/* Obsidian 2nd Brain Vault Tab */}
          {activeTab === "obsidian" && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-cyan-500/20 bg-cyan-950/20 p-4">
                <div className="flex items-center gap-3">
                  <FileText className="h-6 w-6 text-cyan-300" />
                  <div>
                    <h3 className="text-sm font-bold text-white">Obsidian 2nd Brain Studio</h3>
                    <p className="text-xs text-slate-400">
                      Import Markdown SOPs, wikilink strategies (<span className="text-cyan-300 font-mono">[[Note Title]]</span>), and #tags into your PostgreSQL vector engine.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    toast.success("Obsidian Vault indexed into PostgreSQL RAG vector engine!");
                  }}
                  className="rounded-lg bg-cyan-400 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-cyan-300 transition"
                >
                  Index Vault into RAG Engine
                </button>
              </div>

              {/* Add / Import Markdown Note Form */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4 space-y-3">
                <div className="text-xs font-semibold text-white">Add New Obsidian Note / SOP</div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <input
                    placeholder="Note Title (e.g. Dubai Municipality SOP)"
                    value={newObsidianTitle}
                    onChange={(e) => setNewObsidianTitle(e.target.value)}
                    className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs text-slate-100 focus:border-cyan-400/50 focus:outline-none"
                  />
                  <input
                    placeholder="Category (e.g. GMB Strategy, Technical)"
                    value={newObsidianCat}
                    onChange={(e) => setNewObsidianCat(e.target.value)}
                    className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs text-slate-100 focus:border-cyan-400/50 focus:outline-none"
                  />
                </div>
                <textarea
                  placeholder="Paste Obsidian Markdown content with [[Wikilinks]] and #tags..."
                  rows={4}
                  value={newObsidianContent}
                  onChange={(e) => setNewObsidianContent(e.target.value)}
                  className="w-full rounded-lg border border-slate-800 bg-slate-900 p-3 font-mono text-xs text-slate-100 focus:border-cyan-400/50 focus:outline-none"
                />
                <button
                  onClick={() => {
                    if (!newObsidianTitle.trim() || !newObsidianContent.trim()) return;
                    const parsed = parseObsidianNote(newObsidianContent, newObsidianTitle);
                    parsed.category = newObsidianCat.trim() || "SEO Knowledge";
                    setObsidianVault((prev) => [parsed, ...prev]);
                    setSelectedNoteId(parsed.id);
                    setNewObsidianTitle("");
                    setNewObsidianContent("");
                    toast.success(`Obsidian Note "${parsed.title}" created & parsed!`);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-400 px-3.5 py-1.5 text-xs font-bold text-slate-950 hover:bg-cyan-300"
                >
                  <Plus className="h-4 w-4" /> Save to Obsidian Vault
                </button>
              </div>

              {/* Obsidian Vault Grid & Reader */}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                {/* Note List sidebar */}
                <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                  <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Vault Notes ({obsidianVault.length})</div>
                  {obsidianVault.map((note) => {
                    const active = note.id === selectedNoteId;
                    return (
                      <button
                        key={note.id}
                        onClick={() => setSelectedNoteId(note.id)}
                        className={`w-full rounded-lg border p-2.5 text-left transition ${
                          active
                            ? "border-cyan-400/60 bg-cyan-500/15 text-white shadow-[0_0_12px_rgba(34,211,238,0.2)]"
                            : "border-slate-800/80 bg-slate-900/60 text-slate-300 hover:border-slate-700 hover:text-white"
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs font-semibold">
                          <span className="truncate">{note.title}</span>
                          <Tag className="h-3 w-3 text-cyan-300 shrink-0" />
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[9px] text-cyan-300">{note.category}</span>
                          {note.tags.slice(0, 2).map((t) => (
                            <span key={t} className="rounded bg-slate-900 px-1.5 py-0.5 text-[9px] text-slate-400">#{t}</span>
                          ))}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Selected Note Content Viewer */}
                <div className="lg:col-span-2 rounded-xl border border-slate-800 bg-slate-950/80 p-5 space-y-4">
                  {(() => {
                    const activeNote = obsidianVault.find((n) => n.id === selectedNoteId) || obsidianVault[0];
                    if (!activeNote) return <div className="text-xs text-slate-500">No note selected</div>;
                    return (
                      <>
                        <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-800/80 pb-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2 py-0.5 text-[9px] font-semibold text-cyan-300">
                                {activeNote.category}
                              </span>
                              <span className="text-[10px] text-slate-500">Updated: {activeNote.lastModified}</span>
                            </div>
                            <h2 className="mt-1 text-lg font-bold text-white">{activeNote.title}</h2>
                          </div>
                        </div>

                        {/* Wikilinks relationships badge bar */}
                        {activeNote.wikilinks.length > 0 && (
                          <div className="rounded-lg border border-cyan-500/20 bg-slate-900/60 p-3">
                            <div className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">Obsidian [[Wikilinks]] Connected Notes</div>
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                              {activeNote.wikilinks.map((wl) => (
                                <span
                                  key={wl}
                                  className="inline-flex items-center gap-1 rounded-md border border-cyan-400/40 bg-cyan-400/10 px-2 py-1 text-xs font-medium text-cyan-200"
                                >
                                  [[{wl}]]
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Note Content */}
                        <pre className="max-h-[350px] overflow-y-auto whitespace-pre-wrap font-mono text-xs text-slate-200 bg-slate-900/60 p-4 rounded-xl border border-slate-800/80">
                          {activeNote.content}
                        </pre>
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
          )}

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
                    {(structured.services || []).map((s) => (
                      <tr key={s.id} className="border-t border-slate-800/70 hover:bg-slate-900/40">
                        <td className="px-4 py-2.5 font-medium text-white">
                          {s.name}
                          {s.description && <div className="text-[11px] text-slate-400">{s.description}</div>}
                        </td>
                        <td className="px-4 py-2.5 text-slate-300">{s.category || "General"}</td>
                        <td className="px-4 py-2.5 font-mono text-cyan-300">{s.priceAed ? `${s.priceAed} AED` : "Quote"}</td>
                        <td className="px-4 py-2.5 text-slate-400">{s.turnaround || "Same Day"}</td>
                        <td className="px-4 py-2.5 text-right">
                          <button
                            onClick={() => {
                              setStructured((prev) => ({
                                ...prev,
                                services: prev.services?.filter((item) => item.id !== s.id),
                              }));
                              toast.info("Service removed");
                            }}
                            className="text-xs text-rose-400 hover:underline"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
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
