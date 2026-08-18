import { useState } from "react";
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  FileCode,
  Flag,
  Globe,
  Link2,
  ListChecks,
  ShieldCheck,
  Sparkles,
  Users,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import type { Priority, Status, Task } from "../types";
import { EXPERTS } from "@/lib/agents";

type SubItem = {
  id: string;
  urlOrTitle: string;
  detail: string;
  metricOrMeta?: string;
  status: "pending" | "approved" | "completed";
};

// Generates granular items for aggregated task metrics
function getSubItemsForTask(task: Task): SubItem[] {
  const t = task.title.toLowerCase();

  if (t.includes("canonical")) {
    return [
      { id: "c1", urlOrTitle: "https://safaeewala.com/services/deep-cleaning", detail: "Canonical points to /services/deep-cleaning/ (trailing slash mismatch)", metricOrMeta: "404 Risk", status: "pending" },
      { id: "c2", urlOrTitle: "https://safaeewala.com/services/sofa-cleaning", detail: "Self-referencing canonical missing HTTPS protocol prefix", metricOrMeta: "Protocol Mismatch", status: "pending" },
      { id: "c3", urlOrTitle: "https://safaeewala.com/services/carpet-cleaning", detail: "Canonical points to non-www HTTP variant", metricOrMeta: "Canonical Loop", status: "approved" },
      { id: "c4", urlOrTitle: "https://safaeewala.com/dubai-marina", detail: "Self-referencing canonical includes URL parameter ?ref=footer", metricOrMeta: "Param Leak", status: "pending" },
      { id: "c5", urlOrTitle: "https://safaeewala.com/business-bay", detail: "Canonical points to /dubai-cleaning-services (cross-domain duplication)", metricOrMeta: "Duplicate Content", status: "pending" },
      { id: "c6", urlOrTitle: "https://safaeewala.com/jlt-maid-service", detail: "Trailing slash missing on self-referencing link tag", metricOrMeta: "Syntax Error", status: "pending" },
      { id: "c7", urlOrTitle: "https://safaeewala.com/villa-deep-cleaning", detail: "Canonical tag capitalized: /Villa-Deep-Cleaning", metricOrMeta: "Case Mismatch", status: "approved" },
      { id: "c8", urlOrTitle: "https://safaeewala.com/palm-jumeirah-cleaning", detail: "Relative canonical path used instead of absolute URL", metricOrMeta: "Relative Link", status: "pending" },
      { id: "c9", urlOrTitle: "https://safaeewala.com/downtown-dubai", detail: "Multiple <link rel='canonical'> tags present in head", metricOrMeta: "Duplicate Tag", status: "pending" },
      { id: "c10", urlOrTitle: "https://safaeewala.com/silicon-oasis", detail: "Canonical points to 301 redirected URL", metricOrMeta: "Redirect Chain", status: "pending" },
      { id: "c11", urlOrTitle: "https://safaeewala.com/move-in-cleaning", detail: "Cross-language canonical pointing to Arabic version", metricOrMeta: "Hreflang Clash", status: "pending" },
      { id: "c12", urlOrTitle: "https://safaeewala.com/sofa-shampooing", detail: "Canonical tag inside body instead of head section", metricOrMeta: "Placement Error", status: "pending" },
      { id: "c13", urlOrTitle: "https://safaeewala.com/water-tank-cleaning", detail: "Canonical points to staging domain dev.safaeewala.com", metricOrMeta: "Staging Leak", status: "pending" },
      { id: "c14", urlOrTitle: "https://safaeewala.com/commercial-cleaning", detail: "Canonical points to HTTP port 80 variant", metricOrMeta: "Port Mismatch", status: "pending" },
    ];
  }

  if (t.includes("brand mention") || t.includes("reclaim") || t.includes("unlinked")) {
    return [
      { id: "b1", urlOrTitle: "https://dubailifestyle.ae/top-home-cleaning-2026", detail: "Mentioned: 'Safaeewala offers premium sofa shampooing across Dubai...'", metricOrMeta: "DR 64 · 1.2k Traffic", status: "pending" },
      { id: "b2", urlOrTitle: "https://whatsondubai.com/move-in-cleaning-guide", detail: "Mentioned: 'Companies like Safaeewala provide same-day deep cleaning...'", metricOrMeta: "DR 72 · 4.8k Traffic", status: "pending" },
      { id: "b3", urlOrTitle: "https://expatwoman.com/dubai/services-review", detail: "Mentioned: 'Safaeewala maid service is highly rated in JLT and Marina...'", metricOrMeta: "DR 58 · 950 Traffic", status: "approved" },
      { id: "b4", urlOrTitle: "https://timeoutdubai.com/home-hacks-uae", detail: "Mentioned: 'Safaeewala cleaning team uses eco-friendly products...'", metricOrMeta: "DR 81 · 12k Traffic", status: "pending" },
      { id: "b5", urlOrTitle: "https://khaleejtimes.com/business-spotlight-dubai", detail: "Mentioned: 'Safaeewala expanded disinfection services in Business Bay...'", metricOrMeta: "DR 88 · 45k Traffic", status: "pending" },
      { id: "b6", urlOrTitle: "https://yalladubai.com/best-maid-apps", detail: "Mentioned: 'Safaeewala cleaning booking platform simplifies villa care...'", metricOrMeta: "DR 51 · 600 Traffic", status: "pending" },
      { id: "b7", urlOrTitle: "https://gulfnews.com/lifestyle/home-maintenance", detail: "Mentioned: 'Safaeewala introduced steam upholstery cleaning...'", metricOrMeta: "DR 89 · 80k Traffic", status: "approved" },
      { id: "b8", urlOrTitle: "https://dubaiweek.ae/local-services-guide", detail: "Mentioned: 'Safaeewala is a trusted partner for post-tenancy cleaning...'", metricOrMeta: "DR 46 · 350 Traffic", status: "pending" },
    ];
  }

  if (t.includes("faq schema") || t.includes("schema")) {
    return [
      { id: "f1", urlOrTitle: "/services/villa-deep-cleaning", detail: "FAQ: 'What is included in villa deep cleaning in Dubai?'", metricOrMeta: "JSON-LD Validated", status: "approved" },
      { id: "f2", urlOrTitle: "/services/sofa-shampooing", detail: "FAQ: 'How long does sofa drying take in UAE humidity?'", metricOrMeta: "JSON-LD Validated", status: "pending" },
      { id: "f3", urlOrTitle: "/services/carpet-cleaning", detail: "FAQ: 'Are carpet cleaning chemicals safe for pets?'", metricOrMeta: "JSON-LD Validated", status: "pending" },
      { id: "f4", urlOrTitle: "/services/move-in-cleaning", detail: "FAQ: 'Do you provide move-in cleaning in Dubai Marina?'", metricOrMeta: "JSON-LD Validated", status: "pending" },
      { id: "f5", urlOrTitle: "/services/water-tank-cleaning", detail: "FAQ: 'How often should Dubai water tanks be disinfected?'", metricOrMeta: "JSON-LD Validated", status: "pending" },
      { id: "f6", urlOrTitle: "/services/commercial-cleaning", detail: "FAQ: 'Do you offer after-hours office cleaning in Business Bay?'", metricOrMeta: "JSON-LD Validated", status: "pending" },
      { id: "f7", urlOrTitle: "/dubai-marina", detail: "FAQ: 'What is the response time for maid service in Dubai Marina?'", metricOrMeta: "JSON-LD Validated", status: "approved" },
      { id: "f8", urlOrTitle: "/downtown-dubai", detail: "FAQ: 'Are deep cleaning teams licensed for Downtown high-rises?'", metricOrMeta: "JSON-LD Validated", status: "pending" },
      { id: "f9", urlOrTitle: "/palm-jumeirah-cleaning", detail: "FAQ: 'Do you clean luxury villas on Palm Jumeirah?'", metricOrMeta: "JSON-LD Validated", status: "pending" },
      { id: "f10", urlOrTitle: "/jlt-maid-service", detail: "FAQ: 'Is monthly maid subscription available in JLT?'", metricOrMeta: "JSON-LD Validated", status: "pending" },
      { id: "f11", urlOrTitle: "/business-bay", detail: "FAQ: 'Can commercial offices get weekend deep cleaning?'", metricOrMeta: "JSON-LD Validated", status: "pending" },
      { id: "f12", urlOrTitle: "/al-barsha", detail: "FAQ: 'Do cleaning rates include equipment and supplies?'", metricOrMeta: "JSON-LD Validated", status: "pending" },
    ];
  }

  if (t.includes("lcp") || t.includes("speed") || t.includes("pricing")) {
    return [
      { id: "l1", urlOrTitle: "hero-pricing-banner.jpg (2.4 MB)", detail: "Action: Convert unoptimized PNG/JPEG to WebP format", metricOrMeta: "-1.8 MB savings", status: "pending" },
      { id: "l2", urlOrTitle: "Google Fonts Outfit (render-blocking)", detail: "Action: Add font-display: swap and rel='preload' resource hint", metricOrMeta: "-420ms LCP", status: "approved" },
      { id: "l3", urlOrTitle: "Live Chat Widget Script (chat-widget.js)", detail: "Action: Defer 3rd-party script execution until user scroll/interaction", metricOrMeta: "-310ms TBT", status: "pending" },
      { id: "l4", urlOrTitle: "Unused CSS in /assets/pricing.css", detail: "Action: Purge unused keyframe animations and modal stylesheets", metricOrMeta: "-85 KB CSS", status: "pending" },
    ];
  }

  // Generic item generator for any other task
  return [
    { id: "g1", urlOrTitle: "Audit Target URL 1", detail: "Verify page structure, title tags, and meta description alignment", metricOrMeta: "Step 1", status: "approved" },
    { id: "g2", urlOrTitle: "Review Competitor Benchmark", detail: "Compare SERP top-3 positions against target URL metrics", metricOrMeta: "Step 2", status: "pending" },
    { id: "g3", urlOrTitle: "Apply Technical / On-Page Fixes", detail: "Implement schema tags, canonical links, and content edits", metricOrMeta: "Step 3", status: "pending" },
    { id: "g4", urlOrTitle: "Submit to Search Console Indexing API", detail: "Trigger instant URL inspection re-crawl on GSC", metricOrMeta: "Step 4", status: "pending" },
  ];
}

export function TaskItemDetailModal({
  task,
  onClose,
  onUpdate,
  onDelete,
}: {
  task: Task;
  onClose: () => void;
  onUpdate: (id: string, patch: Partial<Task>) => void;
  onDelete: (id: string) => void;
}) {
  const [subItems, setSubItems] = useState<SubItem[]>(() => getSubItemsForTask(task));
  const [priority, setPriority] = useState<Priority>(task.priority);
  const [status, setStatus] = useState<Status>(task.status);
  const [assignee, setAssignee] = useState<string>(task.assignee);

  const toggleSubItem = (itemId: string) => {
    setSubItems((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? { ...item, status: item.status === "approved" ? "pending" : "approved" }
          : item
      )
    );
  };

  const approveAll = () => {
    setSubItems((prev) => prev.map((item) => ({ ...item, status: "approved" })));
    setStatus("done");
    onUpdate(task.id, { status: "done" });
    toast.success("All items approved & task marked as Completed!");
  };

  const handleSave = () => {
    onUpdate(task.id, { priority, status, assignee });
    toast.success("Task & items updated successfully!");
    onClose();
  };

  const approvedCount = subItems.filter((i) => i.status === "approved").length;
  const progressPct = Math.round((approvedCount / (subItems.length || 1)) * 100);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl flex flex-col">
        {/* Top Accent Line */}
        <div
          className={`h-1 w-full bg-gradient-to-r ${
            priority === "critical"
              ? "from-rose-500 to-red-500"
              : priority === "high"
              ? "from-amber-400 to-orange-500"
              : priority === "medium"
              ? "from-cyan-400 to-blue-500"
              : "from-slate-600 to-slate-700"
          }`}
        />

        {/* Modal Header */}
        <div className="flex items-start justify-between border-b border-slate-800/80 p-6">
          <div className="min-w-0 flex-1 pr-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-mono text-cyan-300">
                <ListChecks className="h-3 w-3" /> Aggregated Items Drill-Down
              </span>
              <span className="rounded-full border border-slate-800 bg-slate-900 px-2 py-0.5 text-[10px] font-semibold text-slate-400">
                ID: {task.id}
              </span>
            </div>
            <h2 className="mt-2 text-xl font-bold text-white leading-snug">{task.title}</h2>
            {task.desc && <p className="mt-1 text-xs text-slate-400">{task.desc}</p>}
          </div>

          <button
            onClick={onClose}
            className="rounded-lg border border-slate-800 bg-slate-900/60 p-2 text-slate-400 hover:border-slate-700 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Controls Bar */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 rounded-xl border border-slate-800/70 bg-slate-900/40 p-4">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-slate-500">Assignee</label>
              <select
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-xs font-semibold text-white focus:border-cyan-400 focus:outline-none"
              >
                {EXPERTS.map((e) => (
                  <option key={e.id} value={e.title}>
                    {e.title}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-wider text-slate-500">Stage / Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as Status)}
                className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-xs font-semibold text-white focus:border-cyan-400 focus:outline-none"
              >
                <option value="todo">To-Do / Backlog</option>
                <option value="inprogress">In Progress</option>
                <option value="review">Under Review</option>
                <option value="done">Done / Approved</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-wider text-slate-500">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
                className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-xs font-semibold text-white focus:border-cyan-400 focus:outline-none"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
          </div>

          {/* Sub-Items Progress Header */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white">Specific Items & Pages Involved ({subItems.length})</h3>
              <p className="text-[11px] text-slate-400">
                Review, manage, and approve individual items or batch approve all.
              </p>
            </div>
            <button
              onClick={approveAll}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 px-3 py-1.5 text-xs font-bold text-slate-950 shadow-md transition hover:brightness-110"
            >
              <CheckCircle2 className="h-3.5 w-3.5" /> Approve All ({subItems.length})
            </button>
          </div>

          {/* Progress Bar */}
          <div>
            <div className="flex justify-between text-[11px] font-mono text-slate-400 mb-1">
              <span>Approval Progress: {approvedCount} of {subItems.length} items</span>
              <span>{progressPct}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-900">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400 transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          {/* Granular Items List */}
          <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
            {subItems.map((item, idx) => {
              const isApproved = item.status === "approved";
              return (
                <div
                  key={item.id}
                  className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3.5 transition ${
                    isApproved
                      ? "border-emerald-500/30 bg-emerald-500/5 text-slate-200"
                      : "border-slate-800/80 bg-slate-900/50 text-slate-300 hover:border-slate-700"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-slate-500">#{idx + 1}</span>
                      <span className="truncate text-xs font-semibold text-white">{item.urlOrTitle}</span>
                      {item.metricOrMeta && (
                        <span className="rounded border border-slate-700 bg-slate-950 px-1.5 py-0.5 text-[9px] font-mono text-cyan-300">
                          {item.metricOrMeta}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[11px] text-slate-400">{item.detail}</p>
                  </div>

                  <button
                    onClick={() => toggleSubItem(item.id)}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      isApproved
                        ? "border border-emerald-400/40 bg-emerald-400/20 text-emerald-200"
                        : "border border-slate-700 bg-slate-800 text-slate-300 hover:border-cyan-400/40 hover:text-white"
                    }`}
                  >
                    <CheckCircle2 className={`h-3.5 w-3.5 ${isApproved ? "text-emerald-400" : "text-slate-500"}`} />
                    {isApproved ? "Approved" : "Approve Item"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex flex-wrap items-center justify-between border-t border-slate-800/80 p-4 bg-slate-950/80">
          <button
            onClick={() => {
              onDelete(task.id);
              toast.error("Task deleted");
              onClose();
            }}
            className="text-xs font-semibold text-rose-400 hover:text-rose-300 hover:underline"
          >
            Delete Task
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="rounded-lg bg-cyan-500 px-5 py-2 text-xs font-bold text-slate-950 shadow-md transition hover:bg-cyan-400"
            >
              Save & Apply Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
