"use client";
import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { bulkApproveByKind, bulkRejectByKind } from "@/app/actions/seo-bulk";

type Item = {
  id: string;
  siteName: string;
  siteDomain: string;
  siteSlug: string;
  preview: ReactNode;
  createdAtIso: string;
};

/**
 * Collapsible group card. One per proposal kind.
 *
 * Props:
 *  - kind       canonical kind string (matches enum)
 *  - label      human label (META TITLE, VISUAL CSS, etc.)
 *  - tone       "safe" | "blocked" — drives default-open state + color
 *  - items      proposals in this group (already preview-rendered)
 *  - reason     for blocked groups: one-line explanation why bulk-approve is disabled
 *
 * Collapsed by default for "blocked" groups (visual_css / manual-review-only).
 * "Approve all N" disabled for blocked groups — operator must approve individually.
 */
export function SeoGroupCard({
  kind,
  label,
  tone,
  items,
  reason,
}: {
  kind: string;
  label: string;
  tone: "safe" | "blocked";
  items: Item[];
  reason?: string;
}) {
  const [open, setOpen] = useState(tone === "safe" && items.length <= 5);
  const [pending, start] = useTransition();
  const [flash, setFlash] = useState<string | null>(null);
  const router = useRouter();

  const approveAll = () => {
    if (tone === "blocked") return;
    if (!confirm(`Approve all ${items.length} ${label} proposals?`)) return;
    setFlash(null);
    start(async () => {
      const r = await bulkApproveByKind({ kind });
      setFlash(r.ok ? `Approved ${r.approved}${r.failed ? `, ${r.failed} failed` : ""}.` : "Failed.");
      router.refresh();
    });
  };

  const rejectAll = () => {
    if (!confirm(`Reject all ${items.length} ${label} proposals?`)) return;
    setFlash(null);
    start(async () => {
      const r = await bulkRejectByKind({ kind });
      setFlash(r.ok ? `Rejected ${r.rejected}.` : "Failed.");
      router.refresh();
    });
  };

  const sites = Array.from(new Set(items.map((i) => i.siteDomain)));

  return (
    <div className="rounded-lg border border-border bg-surface">
      {/* Header row — always visible */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2 focus-visible:outline-none focus-visible:bg-surface-2"
      >
        <span className={`grid h-6 w-6 shrink-0 place-items-center rounded text-xs font-medium ${
          tone === "blocked" ? "bg-warning-tint text-warning" : "bg-info-tint text-info"
        }`}>
          {open ? "−" : "+"}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-sm font-medium tracking-wide uppercase text-text">{label}</span>
            <span className="tnum text-xs text-text-faint">{items.length} proposals</span>
            <span className="text-xs text-text-faint">·</span>
            <span className="text-xs text-text-faint">{sites.length} site{sites.length === 1 ? "" : "s"}</span>
            {tone === "blocked" ? (
              <span className="rounded-sm bg-warning-tint px-1.5 py-0.5 text-xs uppercase tracking-wide text-warning">
                manual review
              </span>
            ) : (
              <span className="rounded-sm bg-success-tint px-1.5 py-0.5 text-xs uppercase tracking-wide text-success">
                bulk-safe
              </span>
            )}
          </div>
          {reason && tone === "blocked" ? (
            <div className="mt-0.5 text-xs text-text-muted">{reason}</div>
          ) : (
            <div className="mt-0.5 truncate text-xs text-text-faint">
              {sites.slice(0, 3).join(" · ")}{sites.length > 3 ? ` · +${sites.length - 3}` : ""}
            </div>
          )}
        </div>
        <div className="hidden shrink-0 items-center gap-2 sm:flex" onClick={(e) => e.stopPropagation()}>
          {tone === "safe" ? (
            <button
              type="button"
              onClick={approveAll}
              disabled={pending}
              className="inline-flex h-7 items-center rounded-sm bg-accent px-2.5 text-xs font-medium text-brand-navy-deep hover:bg-accent/90 disabled:opacity-50"
            >
              {pending ? "…" : `Approve all ${items.length}`}
            </button>
          ) : null}
          <button
            type="button"
            onClick={rejectAll}
            disabled={pending}
            className="inline-flex h-7 items-center rounded-sm bg-surface-2 px-2.5 text-xs font-medium text-text-muted hover:bg-surface-3 hover:text-text disabled:opacity-50"
          >
            {pending ? "…" : `Reject all`}
          </button>
        </div>
      </button>

      {flash && (
        <div className="border-t border-border px-4 py-2 text-xs text-text-muted">{flash}</div>
      )}

      {/* Expanded item list */}
      {open && (
        <div className="border-t border-border">
          {items.map((it) => (
            <div key={it.id} className="border-b border-border px-4 py-3 last:border-b-0">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-xs font-medium text-text">{it.siteName}</span>
                <span className="font-mono text-xs text-text-faint">{it.siteDomain}</span>
                <span className="text-xs text-text-faint">· {timeAgo(it.createdAtIso)}</span>
              </div>
              <div className="mt-1 text-xs text-text">{it.preview}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.round(ms / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
