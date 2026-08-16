/**
 * /admin/build/[id]/pages/[pageId] — page editor + live iframe preview.
 *
 * Layout: vertical split. Top = metadata + actions. Bottom = two-column:
 * editor on the left (markdown), preview on the right (rendered HTML in
 * a sandboxed iframe with the Design DNA palette applied).
 *
 * The iframe is server-rendered via srcDoc — no extra route, no client
 * fetch, sandboxed so user content can't escape.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq, sql } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { claudeJobs, siteBuildPages, siteBuildProjects } from "@/db/schema";
import { generatePageAction, publishSinglePageAction, updatePageAction } from "@/app/actions/site-build";
import { Pill } from "@/components/ui/Row";
import { markdownToHtml } from "@/lib/markdown";
import { renderCityPageFromSpec } from "@/lib/city-page-renderer";
import { requireAdmin } from "@/lib/server-auth";
import { formatRelative } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "info" | "warning" | "success" | "danger" | "neutral"> = {
  pending: "neutral",
  generating: "info",
  ready: "success",
  edited: "warning",
  published: "success",
  failed: "danger",
};

export default async function BuildPageDetail({
  params,
}: {
  params: { id: string; pageId: string };
}) {
  await ensureSchema();
  await requireAdmin();

  const [page] = await db().select().from(siteBuildPages).where(eq(siteBuildPages.id, params.pageId)).limit(1);
  if (!page || page.projectId !== params.id) notFound();
  const [project] = await db().select().from(siteBuildProjects).where(eq(siteBuildProjects.id, params.id)).limit(1);
  if (!project) notFound();

  // Latest job for this page, if any
  const [job] = page.jobId
    ? await db().select().from(claudeJobs).where(eq(claudeJobs.id, page.jobId)).limit(1)
    : await db()
        .select()
        .from(claudeJobs)
        .where(sql`${claudeJobs.kind} = 'build:page_generate' AND ${claudeJobs.input}->>'pageId' = ${params.pageId}`)
        .orderBy(desc(claudeJobs.createdAt))
        .limit(1);

  const html = page.bodyHtml || (page.bodyMarkdown ? markdownToHtml(page.bodyMarkdown) : "");

  // Pull design palette from project DNA (best-effort regex over the markdown).
  // Falls back to operator defaults if not parseable.
  const palette = extractPaletteFromDna(
    typeof project.designDna === "object" &&
      project.designDna !== null &&
      "markdown" in project.designDna
      ? String((project.designDna as { markdown: string }).markdown)
      : "",
  );

  // The content agent emits a rich "## SECTION: …" spec. When present, render it
  // through the premium city-page renderer (designed, mobile-first, DNA-styled)
  // instead of the plain markdown→HTML editorial preview.
  const isSectionSpec = /##\s*SECTION:/i.test(page.bodyMarkdown ?? "");
  const facts = (project.businessFacts && typeof project.businessFacts === "object"
    ? (project.businessFacts as Record<string, unknown>)
    : {});
  const factPhone = typeof facts.phone === "string" ? facts.phone : "";

  const iframeDoc = isSectionSpec
    ? renderCityPageFromSpec({
        markdown: page.bodyMarkdown ?? "",
        businessName: project.businessName,
        city: project.city ?? "",
        phone: factPhone,
        palette: { ink: palette.primary, gold: palette.accent, cream: palette.surface, text: palette.text, muted: palette.muted },
      })
    : buildPreviewDoc({
        h1: page.h1 ?? page.title,
        bodyHtml: html,
        metaTitle: page.metaTitle ?? page.title,
        palette,
      });

  return (
    <div className="space-y-5">
      {/* Header */}
      <header className="flex items-baseline justify-between gap-3 border-b border-border pb-3">
        <div className="space-y-1">
          <Link
            href={`/admin/build/${project.id}/pages`}
            className="text-xs text-text-faint hover:text-text"
          >
            ← Pages
          </Link>
          <h1 className="text-xl font-medium tracking-tightish text-text">{page.title}</h1>
          <p className="font-mono text-xs text-text-faint">
            {page.pageType} · {page.pageSlug}
            {page.publishedAt ? <> · published {formatRelative(page.publishedAt)}</> : null}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Pill tone={STATUS_TONE[page.status] ?? "neutral"}>{page.status}</Pill>
          {page.aiOverviewScore !== null ? (
            <span className="tnum text-xs text-text-muted">
              AI <strong className="text-text">{page.aiOverviewScore}</strong>
            </span>
          ) : null}
          {page.seoScore !== null ? (
            <span className="tnum text-xs text-text-muted">
              SEO <strong className="text-text">{page.seoScore}</strong>
            </span>
          ) : null}
          <form action={generatePageAction}>
            <input type="hidden" name="pageId" value={page.id} />
            <button
              type="submit"
              className="rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-medium text-text transition hover:border-accent hover:text-accent"
            >
              {page.bodyMarkdown ? "Regenerate" : "Generate"}
            </button>
          </form>
          {/* P6 · single-page (re)publish via WP REST receiver. Idempotent —
              same slug updates the existing wp_post via /content/update-page,
              new slug creates via /content/create-page. */}
          {(page.status === "ready" || page.status === "edited" || page.status === "published") ? (
            <form action={publishSinglePageAction}>
              <input type="hidden" name="pageId" value={page.id} />
              <button
                type="submit"
                className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-accent-fg shadow-xs transition hover:bg-accent-hover"
                title={page.wpPostId ? `Update wp_post ${page.wpPostId}` : "Create new WP post"}
              >
                {page.wpPostId ? "Republish →" : "Publish →"}
              </button>
            </form>
          ) : null}
        </div>
      </header>

      {/* Job status (when generating / failed) */}
      {job && page.status !== "ready" && page.status !== "edited" && page.status !== "published" ? (
        <section className="rounded-md border border-border bg-surface p-3 text-base">
          <div className="flex items-center gap-2">
            <Pill
              tone={
                job.status === "done"
                  ? "success"
                  : job.status === "failed"
                    ? "danger"
                    : "info"
              }
            >
              {job.status}
            </Pill>
            <Link href={`/admin/agent/jobs/${job.id}`} className="text-xs text-accent hover:underline">
              Open job ↗
            </Link>
            <span className="text-xs text-text-faint">queued {formatRelative(job.createdAt)}</span>
          </div>
          {job.status === "pending" || job.status === "claimed" || job.status === "running" ? (
            <p className="mt-2 text-base text-text-muted">
              The worker is on it. This view auto-refreshes when you reload. Typical generation time: 4-8 minutes.
            </p>
          ) : null}
          {job.error ? (
            <pre className="mt-2 whitespace-pre-wrap rounded bg-danger-tint px-2 py-1 font-mono text-xs text-danger">
              {job.error}
            </pre>
          ) : null}
        </section>
      ) : null}

      {/* Editor + preview */}
      {page.bodyMarkdown ? (
        <form action={updatePageAction} className="space-y-3">
          <input type="hidden" name="pageId" value={page.id} />

          {/* Meta fields */}
          <section className="grid gap-3 rounded-lg border border-border bg-surface p-4 sm:grid-cols-2">
            <label className="block">
              <span className="block text-xs font-medium uppercase tracking-[0.08em] text-text-faint">Page title</span>
              <input
                name="title"
                defaultValue={page.title}
                className="mt-1 h-8 w-full rounded-md border border-border bg-surface-2 px-2.5 text-base text-text outline-none transition focus:border-accent focus:ring-2 focus:ring-accent-ring"
              />
            </label>
            <label className="block">
              <span className="block text-xs font-medium uppercase tracking-[0.08em] text-text-faint">H1</span>
              <input
                name="h1"
                defaultValue={page.h1 ?? ""}
                className="mt-1 h-8 w-full rounded-md border border-border bg-surface-2 px-2.5 text-base text-text outline-none transition focus:border-accent focus:ring-2 focus:ring-accent-ring"
              />
            </label>
            <label className="block">
              <span className="block text-xs font-medium uppercase tracking-[0.08em] text-text-faint">
                Meta title · {page.metaTitle?.length ?? 0} chars (target 30-60)
              </span>
              <input
                name="metaTitle"
                defaultValue={page.metaTitle ?? ""}
                className="mt-1 h-8 w-full rounded-md border border-border bg-surface-2 px-2.5 text-base text-text outline-none transition focus:border-accent focus:ring-2 focus:ring-accent-ring"
              />
            </label>
            <label className="block">
              <span className="block text-xs font-medium uppercase tracking-[0.08em] text-text-faint">
                Meta description · {page.metaDescription?.length ?? 0} chars (target 140-160)
              </span>
              <input
                name="metaDescription"
                defaultValue={page.metaDescription ?? ""}
                className="mt-1 h-8 w-full rounded-md border border-border bg-surface-2 px-2.5 text-base text-text outline-none transition focus:border-accent focus:ring-2 focus:ring-accent-ring"
              />
            </label>
          </section>

          {/* Editor + preview split */}
          <section className="grid gap-3 lg:grid-cols-2">
            <div className="flex flex-col rounded-lg border border-border bg-surface">
              <div className="flex items-center justify-between border-b border-border px-3 py-2">
                <span className="text-xs font-medium uppercase tracking-[0.08em] text-text-faint">
                  Body · Markdown
                </span>
                <span className="text-xs text-text-faint">
                  {(page.bodyMarkdown?.length ?? 0).toLocaleString()} chars
                </span>
              </div>
              <textarea
                name="bodyMarkdown"
                defaultValue={page.bodyMarkdown ?? ""}
                rows={28}
                className="flex-1 rounded-b-lg bg-surface-2 px-3 py-2 font-mono text-base text-text outline-none transition focus:bg-surface focus:ring-2 focus:ring-accent-ring"
              />
            </div>

            <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-surface">
              <div className="flex items-center justify-between border-b border-border px-3 py-2">
                <span className="text-xs font-medium uppercase tracking-[0.08em] text-text-faint">
                  Live preview
                </span>
                <span className="text-xs text-text-faint">
                  Sandbox · Design DNA palette applied
                </span>
              </div>
              <iframe
                title="Page preview"
                srcDoc={iframeDoc}
                sandbox="allow-same-origin"
                className="h-[640px] w-full bg-white"
              />
            </div>
          </section>

          {/* Schema panel */}
          {Array.isArray(page.schemaJson) && (page.schemaJson as unknown[]).length > 0 ? (
            <details className="rounded-lg border border-border bg-surface p-4">
              <summary className="cursor-pointer text-base font-medium text-text">
                JSON-LD schema · {(page.schemaJson as unknown[]).length} block(s)
              </summary>
              <pre className="mt-3 max-h-96 overflow-y-auto whitespace-pre-wrap rounded bg-surface-2 px-3 py-2 font-mono text-xs text-text-muted">
                {JSON.stringify(page.schemaJson, null, 2)}
              </pre>
            </details>
          ) : null}

          {/* Save */}
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3">
            <p className="text-xs text-text-faint">
              Edits land instantly. Status flips to <span className="font-mono text-text">edited</span> so we know
              this page diverged from the agent&apos;s draft.
            </p>
            <button
              type="submit"
              className="rounded-md bg-accent px-3 py-1.5 text-md font-medium text-accent-fg shadow-xs transition hover:bg-accent-hover"
            >
              Save changes
            </button>
          </div>
        </form>
      ) : (
        <div className="rounded-lg border border-dashed border-border-strong bg-surface px-6 py-12 text-center">
          <p className="text-md font-medium text-text">Page hasn&apos;t been generated yet.</p>
          <p className="mt-1 text-base text-text-muted">
            Click <strong>Generate</strong> above. The worker picks it up within 30 seconds and produces:
            full markdown body, meta title/description, JSON-LD schema (LocalBusiness / Service / FAQPage),
            and internal-link suggestions.
          </p>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Helpers — preview iframe builder + palette extractor
// ────────────────────────────────────────────────────────────────────

interface Palette {
  primary: string;
  accent: string;
  surface: string;
  text: string;
  muted: string;
}

function extractPaletteFromDna(md: string): Palette {
  const fallback: Palette = {
    primary: "#0B1E3F",
    accent: "#C9A961",
    surface: "#FFFFFF",
    text: "#0B1E3F",
    muted: "#3F516E",
  };
  if (!md) return fallback;
  const match = md.match(/```json\s*([\s\S]*?)```/);
  if (!match) return fallback;
  // Only accept real CSS color literals — these get interpolated into a <style>
  // block, so a raw LLM string could break out with </style><script>. (audit C1)
  const safe = (v: unknown, fb: string) =>
    typeof v === "string" && /^#[0-9a-fA-F]{3,8}$|^[a-z]{3,20}$/.test(v.trim()) ? v.trim() : fb;
  try {
    const parsed = JSON.parse(match[1]) as Record<string, string>;
    return {
      primary: safe(parsed.primary, fallback.primary),
      accent: safe(parsed.accent, fallback.accent),
      surface: safe(parsed.surface, fallback.surface),
      text: safe(parsed.text, fallback.text),
      muted: safe(parsed.muted, fallback.muted),
    };
  } catch {
    return fallback;
  }
}

function buildPreviewDoc(opts: { h1: string; bodyHtml: string; metaTitle: string; palette: Palette }): string {
  const { h1, bodyHtml, metaTitle, palette } = opts;
  // Minimal stylesheet that gives the preview a "realistic site" feel
  // without pretending to be the final theme. Uses the Design DNA palette
  // so brand identity is recognizable at a glance.
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(metaTitle)}</title>
<style>
  :root {
    --primary: ${palette.primary};
    --accent: ${palette.accent};
    --surface: ${palette.surface};
    --text: ${palette.text};
    --muted: ${palette.muted};
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: var(--surface); color: var(--text); }
  body {
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    font-size: 16px;
    line-height: 1.55;
  }
  .frame {
    max-width: 760px;
    margin: 0 auto;
    padding: 28px 28px 96px;
  }
  .crumb {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted);
    margin-bottom: 8px;
  }
  h1 {
    font-size: 32px;
    line-height: 1.15;
    letter-spacing: -0.018em;
    margin: 0 0 18px;
    color: var(--primary);
  }
  h2 { font-size: 22px; line-height: 1.25; margin: 36px 0 10px; color: var(--primary); }
  h3 { font-size: 18px; line-height: 1.3;  margin: 28px 0 8px;  color: var(--primary); }
  p, ul, ol, blockquote { margin: 0 0 14px; }
  ul, ol { padding-left: 20px; }
  li { margin: 4px 0; }
  a { color: var(--accent); text-decoration: underline; text-underline-offset: 2px; }
  table.md-table {
    width: 100%;
    border-collapse: collapse;
    margin: 16px 0 18px;
    font-size: 14px;
  }
  table.md-table th, table.md-table td {
    border: 1px solid color-mix(in oklch, var(--text) 14%, transparent);
    padding: 8px 12px;
    text-align: left;
  }
  table.md-table thead th {
    background: color-mix(in oklch, var(--accent) 14%, transparent);
    color: var(--primary);
  }
  blockquote.md-quote {
    border-left: 3px solid var(--accent);
    padding-left: 14px;
    color: var(--muted);
    font-style: italic;
  }
  code.md-code-inline {
    background: color-mix(in oklch, var(--text) 6%, transparent);
    padding: 1px 5px;
    border-radius: 3px;
    font-size: 13px;
  }
  pre.md-pre {
    background: color-mix(in oklch, var(--text) 6%, transparent);
    padding: 12px;
    border-radius: 6px;
    overflow: auto;
  }
  hr.md-hr {
    border: 0;
    border-top: 1px solid color-mix(in oklch, var(--text) 12%, transparent);
    margin: 28px 0;
  }
</style>
</head>
<body>
  <div class="frame">
    <div class="crumb">Preview · Design DNA palette applied</div>
    <h1>${escapeHtml(h1)}</h1>
    ${bodyHtml}
  </div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
