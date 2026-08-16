"use client";

import Link from "next/link";
import { useState } from "react";

/**
 * Bottom-right floating hamburger that opens an overlay nav on phones.
 * Hidden on >= md (desktop has the static sidebar).
 */
export function MobileSidebar({ isAdmin }: { isAdmin: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        className="fixed bottom-4 right-4 z-40 grid h-11 w-11 place-items-center rounded-full border border-border bg-surface shadow-lg md:hidden"
      >
        <span className="grid gap-1">
          <span className="block h-0.5 w-5 bg-text" />
          <span className="block h-0.5 w-5 bg-text" />
          <span className="block h-0.5 w-5 bg-text" />
        </span>
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/40"
          />
          <nav className="absolute right-0 top-0 flex h-full w-72 max-w-[80vw] flex-col gap-1 overflow-y-auto border-l border-border bg-surface p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-base font-medium text-text">Menu</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-sm px-2 py-1 text-text-faint hover:bg-surface-2 hover:text-text"
              >
                ×
              </button>
            </div>
            <Item href="/admin/dashboard-overview" label="Dashboard" onClose={() => setOpen(false)} />
            <Item href="/admin/agency" label="Agency Health" onClose={() => setOpen(false)} />
            <Item href="/admin/agent/jobs" label="Agent Jobs" onClose={() => setOpen(false)} />
            <Item href="/admin/tasks" label="Assign Tasks" onClose={() => setOpen(false)} />
            <Item href="/admin/suggestions" label="Suggestions" onClose={() => setOpen(false)} />
            <Item href="/admin/alerts" label="Alert Manager" onClose={() => setOpen(false)} />
            {isAdmin ? (
              <>
                <MGroup label="Scout Team" />
                <Item href="/admin/keywords" label="Keyword Scout" onClose={() => setOpen(false)} />
                <Item href="/admin/content-studio" label="Content Scout" onClose={() => setOpen(false)} />
                <Item href="/admin/design-research" label="Designing Scout" onClose={() => setOpen(false)} />
                <Item href="/admin/rubric" label="GMB Scout" onClose={() => setOpen(false)} />
                <Item href="/admin/competitors" label="Competitor Scout" onClose={() => setOpen(false)} />
                <Item href="/admin/seo-health" label="Audit and Reporting Scout" onClose={() => setOpen(false)} />
                <Item href="/admin/tech-watchdog" label="Technical Scout" onClose={() => setOpen(false)} />

                <MGroup label="GitHub Cloud SEO" />
                <Item href="/admin/cloud-seo" label="SEO Suite Hub" onClose={() => setOpen(false)} />
                <Item href="/admin/cloud-seo/audit" label="Full SEO Audit" onClose={() => setOpen(false)} />
                <Item href="/admin/cloud-seo/page-analysis" label="Page Analysis" onClose={() => setOpen(false)} />
                <Item href="/admin/cloud-seo/technical" label="Technical SEO" onClose={() => setOpen(false)} />
                <Item href="/admin/cloud-seo/content" label="Content & E-E-A-T" onClose={() => setOpen(false)} />
                <Item href="/admin/cloud-seo/content-brief" label="Content Brief" onClose={() => setOpen(false)} />
                <Item href="/admin/cloud-seo/schema" label="Schema Markup" onClose={() => setOpen(false)} />
                <Item href="/admin/cloud-seo/local-seo" label="Local SEO" onClose={() => setOpen(false)} />
                <Item href="/admin/cloud-seo/images" label="Image SEO" onClose={() => setOpen(false)} />
                <Item href="/admin/cloud-seo/competitor" label="Competitor Analysis" onClose={() => setOpen(false)} />
                <Item href="/admin/cloud-seo/sitemap" label="Sitemap Analysis" onClose={() => setOpen(false)} />
                <Item href="/admin/cloud-seo/backlinks" label="Backlink Analysis" onClose={() => setOpen(false)} />
                <Item href="/admin/cloud-seo/cluster" label="Keyword Clustering" onClose={() => setOpen(false)} />
                <Item href="/admin/cloud-seo/hreflang" label="Hreflang Audit" onClose={() => setOpen(false)} />
                <Item href="/admin/cloud-seo/seo-plan" label="SEO Strategy Plan" onClose={() => setOpen(false)} />
                <Item href="/admin/cloud-seo/programmatic" label="Programmatic SEO" onClose={() => setOpen(false)} />
                <Item href="/admin/cloud-seo/geo" label="AI & GEO Visibility" onClose={() => setOpen(false)} />
                <Item href="/admin/cloud-seo/sxo" label="Search Experience" onClose={() => setOpen(false)} />
                <Item href="/admin/cloud-seo/drift" label="Drift Monitor" onClose={() => setOpen(false)} />

                <MGroup label="System" />
                <Item href="/admin/chat" label="Assistant" onClose={() => setOpen(false)} />
                <Item href="/admin/build" label="Build Agent" onClose={() => setOpen(false)} />
                <Item href="/admin/agent/qa" label="QA Suite" onClose={() => setOpen(false)} />
                <Item href="/admin/logs" label="Logs" onClose={() => setOpen(false)} />
                <Item href="/admin/settings" label="Settings" onClose={() => setOpen(false)} />
              </>
            ) : null}
          </nav>
        </div>
      ) : null}
    </>
  );
}

function MGroup({ label }: { label: string }) {
  return (
    <div className="mt-3 px-2 text-xs font-semibold uppercase tracking-[0.1em] text-text-faint first:mt-0">
      {label}
    </div>
  );
}

function Item({ href, label, onClose }: { href: string; label: string; onClose: () => void }) {
  return (
    <Link
      href={href}
      onClick={onClose}
      className="block rounded-sm px-2 py-2 text-base text-text hover:bg-surface-2"
    >
      {label}
    </Link>
  );
}
