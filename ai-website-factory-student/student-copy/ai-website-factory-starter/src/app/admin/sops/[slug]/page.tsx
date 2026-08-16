/**
 * P6 — SOP detail / editor. Markdown body rendered as a minimal preview.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { sops } from "@/db/schema";
import { deleteSopAction, updateSopAction } from "@/app/actions/prompts";
import { Pill } from "@/components/ui/Row";
import { requireAdmin } from "@/lib/server-auth";
import { formatRelative } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function SopDetailPage({ params }: { params: { slug: string } }) {
  await ensureSchema();
  await requireAdmin();
  const [sop] = await db().select().from(sops).where(eq(sops.slug, params.slug)).limit(1);
  if (!sop) notFound();
  const tags = (sop.tags as string[]) ?? [];

  return (
    <div className="space-y-6">
      <header className="brand-rule">
        <Link href="/admin/sops" className="text-xs text-text-faint hover:text-text">← SOPs</Link>
        <div className="mt-1 flex items-baseline justify-between gap-3">
          <h1 className="">{sop.title}</h1>
          <div className="flex items-center gap-1.5">
            <Pill tone={sop.category === "seo" ? "info" : sop.category === "content" ? "accent" : "neutral"}>{sop.category}</Pill>
            {sop.pinned ? <Pill tone="warning">pinned</Pill> : null}
            {!sop.visibleToTeam ? <Pill tone="danger">admin-only</Pill> : null}
          </div>
        </div>
        <p className="mt-1.5 text-xs text-text-faint">
          Updated {formatRelative(sop.updatedAt)} · slug <code className="font-mono">{sop.slug}</code>
        </p>
      </header>

      <details open className="rounded-xl border border-border bg-surface p-4">
        <summary className="cursor-pointer select-none text-sm font-semibold text-text">Edit</summary>
        <form action={updateSopAction} className="mt-3 space-y-3">
          <input type="hidden" name="slug" value={sop.slug} />
          <label className="block">
            <span className="block text-xs font-medium uppercase tracking-[0.06em] text-text-faint">Title</span>
            <input
              name="title"
              defaultValue={sop.title}
              required
              className="mt-1 w-full rounded-md border border-border bg-surface-soft px-2 py-1 text-xs outline-none focus:border-accent"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="block text-xs font-medium uppercase tracking-[0.06em] text-text-faint">Category</span>
              <select
                name="category"
                defaultValue={sop.category}
                className="mt-1 w-full rounded-md border border-border bg-surface-soft px-2 py-1 text-xs outline-none focus:border-accent"
              >
                {["general", "seo", "content", "ops", "support"].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="block text-xs font-medium uppercase tracking-[0.06em] text-text-faint">Tags (comma-separated)</span>
              <input
                name="tags"
                defaultValue={tags.join(", ")}
                className="mt-1 w-full rounded-md border border-border bg-surface-soft px-2 py-1 font-mono text-xs outline-none focus:border-accent"
              />
            </label>
          </div>
          <label className="block">
            <span className="block text-xs font-medium uppercase tracking-[0.06em] text-text-faint">Body (Markdown)</span>
            <textarea
              name="body"
              defaultValue={sop.body}
              rows={20}
              className="mt-1 w-full rounded-md border border-border bg-surface-soft px-2.5 py-2 font-mono text-xs outline-none focus:border-accent"
            />
          </label>
          <div className="flex flex-wrap items-center gap-4">
            <label className="inline-flex items-center gap-2 text-xs text-text">
              <input type="checkbox" name="pinned" defaultChecked={sop.pinned} className="accent-accent" />
              Pinned
            </label>
            <label className="inline-flex items-center gap-2 text-xs text-text">
              <input type="checkbox" name="visibleToTeam" defaultChecked={sop.visibleToTeam} className="accent-accent" />
              Visible to team
            </label>
          </div>
          <div className="flex items-center justify-between gap-2 pt-1">
            <button type="submit" className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-brand-navy-deep hover:bg-accent-hover">
              Save
            </button>
          </div>
        </form>
      </details>

      {/* Preview */}
      <article className="rounded-xl border border-border bg-surface p-6 prose-sop max-w-none">
        <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-text">{sop.body}</pre>
      </article>

      <form action={deleteSopAction} className="flex items-center justify-end">
        <input type="hidden" name="slug" value={sop.slug} />
        <button type="submit" className="text-xs text-text-faint hover:text-danger">
          Delete SOP
        </button>
      </form>
    </div>
  );
}
