/**
 * P6 — Per-slot prompt editor with version history.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { promptTemplates } from "@/db/schema";
import { activatePromptVersionAction, savePromptAction } from "@/app/actions/prompts";
import { Pill } from "@/components/ui/Row";
import { PROMPT_SLOTS, getActivePrompt } from "@/lib/prompt-library";
import { requireAdmin } from "@/lib/server-auth";
import { formatRelative } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function PromptDetailPage({ params }: { params: { slot: string } }) {
  await ensureSchema();
  await requireAdmin();
  const meta = PROMPT_SLOTS.find((s) => s.slot === params.slot);
  if (!meta) notFound();
  const active = await getActivePrompt(params.slot);
  const versions = await db()
    .select()
    .from(promptTemplates)
    .where(eq(promptTemplates.slot, params.slot))
    .orderBy(desc(promptTemplates.version));

  return (
    <div className="space-y-6">
      <header className="brand-rule">
        <Link href="/admin/prompts" className="text-xs text-text-faint hover:text-text">
          ← Prompts
        </Link>
        <h1 className="">{meta.label}</h1>
        <p className="mt-1.5 text-xs text-text-muted">{meta.description}</p>
        <div className="mt-2 flex items-center gap-2">
          <span className="font-mono text-xs text-text-faint">{meta.slot}</span>
          {active.source === "db" ? (
            <Pill tone="success">v{active.version} active</Pill>
          ) : (
            <Pill tone="neutral">default in use</Pill>
          )}
        </div>
      </header>

      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="text-xs font-medium text-text">Placeholders available</h2>
        <p className="mt-1 text-xs text-text-faint">
          {meta.placeholders.length > 0
            ? meta.placeholders.map((p) => <code key={p} className="mr-1 font-mono text-xs text-text">{p}</code>)
            : "None"}
        </p>
      </section>

      <form action={savePromptAction} className="space-y-3 rounded-xl border border-border bg-surface p-4">
        <input type="hidden" name="slot" value={meta.slot} />
        <input type="hidden" name="label" value={meta.label} />
        <h2 className="">Edit prompt body</h2>
        <p className="text-xs text-text-faint">Saving creates a new version and activates it. The previous version becomes inactive but is preserved.</p>
        <textarea
          name="body"
          defaultValue={active.body}
          rows={18}
          className="w-full rounded-md border border-border bg-surface-soft px-2.5 py-2 font-mono text-xs outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
        <div>
          <button type="submit" className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-brand-navy-deep hover:bg-accent-hover">
            Save as new version →
          </button>
        </div>
      </form>

      {versions.length > 0 ? (
        <section className="rounded-xl border border-border bg-surface p-4">
          <h2 className="">Version history</h2>
          <ol className="mt-2 space-y-2">
            {versions.map((v) => (
              <li key={v.id} className="rounded-md border border-border bg-surface-soft p-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Pill tone={v.isActive ? "success" : "neutral"}>v{v.version}{v.isActive ? " · active" : ""}</Pill>
                    <span className="text-xs text-text-faint">created {formatRelative(v.createdAt)}</span>
                  </div>
                  {!v.isActive ? (
                    <form action={activatePromptVersionAction}>
                      <input type="hidden" name="id" value={v.id} />
                      <button type="submit" className="rounded-md border border-border px-2 py-1 text-xs text-text hover:border-accent">
                        Activate
                      </button>
                    </form>
                  ) : null}
                </div>
                <pre className="mt-1.5 max-h-32 overflow-y-auto whitespace-pre-wrap rounded bg-surface px-2 py-1 font-mono text-xs text-text-muted">{v.body.slice(0, 600)}{v.body.length > 600 ? "…" : ""}</pre>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}
