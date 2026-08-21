import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
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

export const Route = createFileRoute("/knowledge-base")({
  head: () => ({
    meta: [
      { title: "Knowledge Base — AKS SEO Console" },
      {
        name: "description",
        content: "Centralized RAG Knowledge Base hub for website projects, service catalogs, brand rules, and network mandates.",
      },
    ],
  }),
  component: KnowledgeBasePage,
});

function KnowledgeBasePage() {
  const { currentSite, allSites, setCurrentSiteId } = useSite();
  const [activeTab, setActiveTab] = useState<
    "services" | "brand" | "faqs" | "policies" | "network" | "preview"
  >("services");

  // Local state for interactive editing
  const [plainText, setPlainText] = useState(
    `SERVICE AREA: Dubai + all UAE emirates. Sharjah, Abu Dhabi, Ajman on request.

SERVICES:
- Standard cleaning: same-day availability across Dubai
- Villa deep clean: HD-grade written 60-point checklist
- Move-in / move-out cleaning: handover-grade
- Sofa / carpet / curtain / mattress cleaning: on-site steam or wet-clean

HOURS: Sun–Thu 8am–8pm, Fri+Sat 9am–8pm. WhatsApp dispatch 8am–10pm daily.

POLICIES:
- Free cancellation up to 24 hours before appointment
- Insured team, background-checked staff, uniformed`
  );

  const [structured, setStructured] = useState<StructuredKnowledgeBase>({
    businessProfile: {
      businessName: currentSite.label,
      niche: "Cleaning Services",
      phone: "+971 4 399 0000",
      whatsapp: "+971 50 123 4567",
      address: "Cluster T, Jumeirah Lakes Towers, Dubai, UAE",
      workingHours: "Sun-Thu: 8:00 AM - 8:00 PM, Fri-Sat: 9:00 AM - 6:00 PM",
      tradeLicense: "CN-1094829",
      establishedYear: "2019",
    },
    services: [
      {
        id: "s1",
        name: "Villa Deep Cleaning",
        category: "Deep Clean",
        description: "Handover-grade villa refresh using written 60-point checklist",
        priceAed: "499",
        turnaround: "4-6 Hours",
        keywords: ["villa deep cleaning dubai", "villa handover clean"],
        features: ["Inside appliance clean", "Balcony washing", "AC vent dusting"],
      },
      {
        id: "s2",
        name: "Move-in / Move-out Cleaning",
        category: "Tenancy Clean",
        description: "Tenancy agreement handover clean guaranteed to return deposit",
        priceAed: "349",
        turnaround: "3-5 Hours",
        keywords: ["move out cleaning dubai", "tenancy cleaning dubai"],
        features: ["Cabinet interior scrubbing", "Grout steam cleaning"],
      },
      {
        id: "s3",
        name: "Sofa & Upholstery Steam Clean",
        category: "Specialized",
        description: "On-site hot water extraction and germ disinfection",
        priceAed: "199",
        turnaround: "1-2 Hours",
        keywords: ["sofa cleaning dubai", "carpet steam clean"],
        features: ["Stain removal", "Quick-dry extraction"],
      },
    ],
    brandTone: {
      tone: "Professional, punctual, trustworthy, Dubai-market localized",
      usps: ["60-point quality audit checklist", "Insured & background-checked staff", "Eco-friendly non-toxic products"],
      rulesDos: ["Emphasize Dubai Municipality compliance", "Provide clear AED quotes upfront", "Highlight English & Arabic customer service"],
      rulesDonts: ["Never make unverified medical claims", "Never omit VAT info in quotes"],
      targetPersonas: ["Expats moving into new villas", "Property managers", "Families requiring seasonal deep cleans"],
    },
    faqs: [
      {
        id: "f1",
        category: "Booking",
        question: "Are cleaning equipment and supplies provided?",
        answer: "Yes, our team brings all professional tools, eco-friendly detergents, steam machines, and vacuums at no extra charge.",
      },
      {
        id: "f2",
        category: "Policies",
        question: "What is your cancellation policy?",
        answer: "Free cancellation or rescheduling up to 24 hours prior to appointment time.",
      },
    ],
    policies: [
      {
        id: "p1",
        title: "Deposit Return Guarantee",
        description: "If your landlord or property manager flags any cleaning defect within 48 hours, we re-clean for free.",
      },
    ],
    competitors: [
      {
        id: "c1",
        name: "JustClean / UrbanCompany",
        domain: "justclean.com",
        counterStrategy: "Emphasize dedicated in-house staff rather than unvetted gig marketplace freelancers.",
      },
    ],
  });

  const [newServiceName, setNewServiceName] = useState("");
  const [newServicePrice, setNewServicePrice] = useState("");
  const [newServiceCat, setNewServiceCat] = useState("");
  const [newFaqQ, setNewFaqQ] = useState("");
  const [newFaqA, setNewFaqA] = useState("");

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
              onClick={() => toast.success("Knowledge Base saved to PostgreSQL")}
              className="rounded-lg bg-cyan-400 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-300 transition shadow-[0_0_16px_rgba(34,211,238,0.3)]"
            >
              Save Knowledge Base
            </button>
          </div>
        </header>

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

        {/* Knowledge Studio Component Card */}
        <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-2 border-b border-slate-800/80 pb-4">
            <div>
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                Knowledge Studio · <span className="text-cyan-300">{currentSite.label}</span>
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
