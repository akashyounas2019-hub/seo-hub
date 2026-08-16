import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { sitePages, sites } from "@/db/schema";
import {
  askAgentForDesignAction,
  clearPageDesignAction,
  previewPageDesignAction,
  pushPageDesignAction,
} from "@/app/actions/page-design";
import { requireAdmin } from "@/lib/server-auth";
import { formatRelative } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface PageProps {
  params: { slug: string; postId: string };
  searchParams: Record<string, string | undefined>;
}

export default async function PageDesignEditor({ params, searchParams }: PageProps) {
  await ensureSchema();
  await requireAdmin();
  const wpPostId = Number.parseInt(params.postId, 10);
  if (!Number.isFinite(wpPostId)) notFound();

  const [site] = await db().select().from(sites).where(eq(sites.slug, params.slug)).limit(1);
  if (!site) notFound();
  const [page] = await db()
    .select()
    .from(sitePages)
    .where(and(eq(sitePages.siteId, site.id), eq(sitePages.wpPostId, wpPostId)))
    .limit(1);
  if (!page) notFound();

  const previewUrl = searchParams.preview ?? page.url;
  // Pre-fill from agent proposal — search params like `pf_cta_bg=#000`.
  const prefillVar = (cssVar: string): string => searchParams[`pf_${cssVar}`] ?? "";
  const agentRationale = searchParams.rationale ?? null;
  const agentCustomCss = searchParams.pf_custom_css ?? "";

  const flashOk = searchParams.ok
    ? { pushed: "Override pushed. Reload the live page to see it.", cleared: "Override removed." }[searchParams.ok] ?? searchParams.ok
    : null;
  const flashErr = searchParams.error
    ? {
        "preview-failed": `Couldn't generate preview${searchParams.detail ? `: ${searchParams.detail}` : ""}`,
        "push-failed": `Couldn't push override${searchParams.detail ? `: ${searchParams.detail}` : ""}`,
        "clear-failed": "Couldn't clear override",
        "empty-design": "Nothing to push — set at least one knob or custom CSS.",
      }[searchParams.error] ?? searchParams.error
    : null;

  return (
    <div className="space-y-5">
      <header className="brand-rule">
        <Link href={`/admin/sites/${site.slug}/pages`} className="text-xs text-text-faint hover:text-text">
          ← All pages
        </Link>
        <h1 className="mt-1 text-2xl font-medium leading-tight tracking-tightish text-text">
          {page.title || "(untitled)"}
        </h1>
        <p className="mt-1.5 text-xs text-text-muted">
          <span className="font-mono">{site.domain}</span>
          {" · "}
          <span className="font-mono">#{page.wpPostId}</span>
          {" · "}last modified {page.modifiedAt ? formatRelative(page.modifiedAt) : "—"}
          {page.hasDesignOverride ? (
            <span className="ml-2 rounded-sm bg-accent-tint px-1.5 py-0.5 text-xs uppercase tracking-wide text-accent">
              override active
            </span>
          ) : null}
        </p>
      </header>

      {flashOk ? (
        <div className="rounded-md border border-success/30 bg-success-tint px-3 py-2 text-xs text-success">{flashOk}</div>
      ) : null}
      {flashErr ? (
        <div className="rounded-md border border-danger/30 bg-danger-tint px-3 py-2 text-xs text-danger">{flashErr}</div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Iframe preview */}
        <section className="rounded-xl border border-border bg-surface p-3">
          <div className="flex items-center justify-between gap-2 px-1 pb-2">
            <span className="text-xs uppercase tracking-[0.06em] text-text-faint">Live preview</span>
            <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-accent hover:underline">
              Open in new tab ↗
            </a>
          </div>
          <iframe
            src={previewUrl}
            title={`Preview of ${page.title}`}
            className="block h-[680px] w-full rounded-md border border-border bg-bg"
            sandbox="allow-scripts allow-same-origin allow-forms"
            referrerPolicy="no-referrer"
          />
          {searchParams.preview ? (
            <p className="mt-2 text-xs text-text-faint">
              Showing a draft preview (15 min token). Push to make it permanent, or load the live URL above to see the saved override.
            </p>
          ) : null}
        </section>

        {/* Editor form */}
        <form action={pushPageDesignAction} className="space-y-4 rounded-xl border border-border bg-surface p-5">
          <input type="hidden" name="siteSlug" value={site.slug} />
          <input type="hidden" name="postId" value={page.wpPostId} />

          <div>
            <h2 className="text-base font-medium text-text">Properties</h2>
            <p className="mt-1 text-xs text-text-muted">
              Each value below maps to a CSS custom property scoped to <code className="font-mono text-xs">body.page-id-{page.wpPostId}</code>. Hex colors / CSS lengths.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="CTA background" name="cta_bg" placeholder="#C9A961" defaultValue={prefillVar("--gyl-page-cta-bg")} />
            <Field label="CTA text color" name="cta_color" placeholder="#0B1E3F" defaultValue={prefillVar("--gyl-page-cta-color")} />
            <Field label="CTA radius" name="cta_radius" placeholder="8px" defaultValue={prefillVar("--gyl-page-cta-radius")} />
            <Field label="Hero background" name="hero_bg" placeholder="#FAF7EE" defaultValue={prefillVar("--gyl-page-hero-bg")} />
            <Field label="Hero padding" name="hero_pad" placeholder="64px 32px" defaultValue={prefillVar("--gyl-page-hero-pad")} />
            <Field label="Heading color" name="heading_color" placeholder="#0B1E3F" defaultValue={prefillVar("--gyl-page-heading-color")} />
            <Field label="Body text color" name="body_color" placeholder="#3F516E" defaultValue={prefillVar("--gyl-page-body-color")} />
            <Field label="Section padding" name="section_pad" placeholder="48px 0" defaultValue={prefillVar("--gyl-page-section-pad")} />
          </div>

          <div className="border-t border-border pt-4">
            <label className="block">
              <span className="block text-xs font-medium uppercase tracking-[0.06em] text-text-faint">
                Custom CSS <span className="lowercase tracking-normal text-text-faint">(scoped automatically to this page)</span>
              </span>
              <textarea
                name="custom_css"
                rows={6}
                defaultValue={agentCustomCss}
                placeholder=".hero h1 { font-size: 56px; }&#10;.cta-button { letter-spacing: 0.05em; }"
                className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-xs text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
              />
              <span className="mt-1 block text-xs text-text-faint">
                Stripped of <code className="font-mono">url()</code>, <code className="font-mono">@import</code>, scripts, and comments before save. Cap 8 KB.
              </span>
            </label>
          </div>

          {agentRationale ? (
            <div className="rounded-md border border-accent/30 bg-accent-tint px-3 py-2 text-xs text-text">
              <span className="font-medium">Agent:</span> {agentRationale}
            </div>
          ) : null}

          <div className="border-t border-border pt-4">
            <label className="block">
              <span className="block text-xs font-medium uppercase tracking-[0.06em] text-text-faint">
                Ask the agent <span className="lowercase tracking-normal text-text-faint">(natural language → CSS proposal, populates the fields above)</span>
              </span>
              <div className="mt-1 flex items-center gap-2">
                <input
                  name="request"
                  placeholder='e.g. "Make the CTA red with rounded corners and double the hero padding"'
                  className="flex-1 rounded-md border border-border bg-surface px-3 py-2 text-xs text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                />
                <button
                  formAction={askAgentForDesignAction}
                  className="rounded-md border border-accent bg-accent-tint px-3 py-2 text-xs font-medium text-accent hover:bg-accent hover:text-brand-navy-deep"
                >
                  Ask agent
                </button>
              </div>
              <span className="mt-1 block text-xs text-text-faint">
                Opus 4.7 + your brand theme. The proposal fills the form + renders a draft preview. Review, edit, then push.
              </span>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
            <button
              type="submit"
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-brand-navy-deep shadow-sm hover:bg-accent-hover focus-visible:shadow-glow"
            >
              Push to live site
            </button>
            <button
              formAction={previewPageDesignAction}
              className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text hover:bg-surface-2"
            >
              Generate preview
            </button>
            {page.hasDesignOverride ? (
              <form action={clearPageDesignAction}>
                <input type="hidden" name="siteSlug" value={site.slug} />
                <input type="hidden" name="postId" value={page.wpPostId} />
                <button
                  type="submit"
                  className="rounded-md border border-danger/30 bg-danger-tint px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger/15"
                >
                  Clear override
                </button>
              </form>
            ) : null}
            <span className="ml-auto text-xs text-text-faint">
              Plugin v0.8.0+ required for per-page overrides.
            </span>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, name, placeholder, defaultValue }: { label: string; name: string; placeholder?: string; defaultValue?: string }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium uppercase tracking-[0.06em] text-text-faint">{label}</span>
      <input
        name={name}
        placeholder={placeholder}
        defaultValue={defaultValue}
        className="mt-1 w-full rounded-md border border-border bg-surface px-2.5 py-1.5 font-mono text-xs text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
      />
    </label>
  );
}
