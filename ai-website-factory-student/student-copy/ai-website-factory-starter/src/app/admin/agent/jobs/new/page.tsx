/**
 * A3 — Submit a new Claude Code job.
 */
import Link from "next/link";
import { db, ensureSchema } from "@/db/client";
import { sites } from "@/db/schema";
import { enqueueClaudeJobAction } from "@/app/actions/claude-jobs";
import { JOB_TEMPLATES, type JobTemplate, type JobTemplateField, templateByKind } from "@/lib/claude-job-templates";
import { Pill } from "@/components/ui/Row";
import { requireAdmin } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export default async function NewClaudeJobPage({
  searchParams,
}: {
  searchParams: { kind?: string; error?: string };
}) {
  await ensureSchema();
  await requireAdmin();
  const allSites = await db().select({ slug: sites.slug, name: sites.name }).from(sites).orderBy(sites.name);
  const selected = searchParams.kind ? templateByKind(searchParams.kind) : undefined;

  return (
    <div className="space-y-6">
      <header className="brand-rule">
        <Link href="/admin/agent/jobs" className="text-xs text-text-faint hover:text-text">← Jobs</Link>
        <h1 className="">
          {selected ? selected.label : "New Claude Code job"}
        </h1>
        <p className="mt-1.5 text-xs text-text-muted">
          {selected ? selected.description : "Pick a template — the agent will dispatch it to your Mac worker."}
        </p>
      </header>

      {searchParams.error ? (
        <div className="rounded-md border border-warning/30 bg-warning-tint px-3 py-2 text-xs text-warning">
          {searchParams.error}
        </div>
      ) : null}

      {!selected ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {JOB_TEMPLATES.map((t) => (
            <Link
              key={t.kind}
              href={`/admin/agent/jobs/new?kind=${t.kind}`}
              className="block rounded-xl border border-border bg-surface p-4 transition hover:border-accent"
            >
              <div className="flex items-center gap-2">
                <Pill tone={t.category === "audit" ? "warning" : t.category === "research" ? "info" : t.category === "content" ? "accent" : "neutral"}>
                  {t.category}
                </Pill>
                <span className="text-xs text-text-faint">~{t.estMinutes} min</span>
              </div>
              <h3 className="mt-1.5 text-sm font-semibold text-text">{t.label}</h3>
              <p className="mt-0.5 text-xs text-text-muted">{t.description}</p>
            </Link>
          ))}
        </div>
      ) : (
        <form action={enqueueClaudeJobAction} className="space-y-4 rounded-xl border border-border bg-surface p-5">
          <input type="hidden" name="kind" value={selected.kind} />
          {selected.fields.map((f) => (
            <Field key={f.name} field={f} sites={allSites} />
          ))}
          <label className="block">
            <span className="block text-xs font-medium uppercase tracking-[0.06em] text-text-faint">Priority</span>
            <select
              name="priority"
              defaultValue="normal"
              className="mt-1 w-full rounded-md border border-border bg-surface-soft px-2.5 py-1.5 text-xs outline-none focus:border-accent"
            >
              <option value="high">High</option>
              <option value="normal">Normal</option>
              <option value="low">Low</option>
            </select>
          </label>
          <div className="flex items-center gap-2 pt-2">
            <button type="submit" className="rounded-md bg-accent px-4 py-1.5 text-xs font-medium text-brand-navy-deep hover:bg-accent-hover">
              Queue job →
            </button>
            <Link href="/admin/agent/jobs/new" className="rounded-md border border-border px-3 py-1.5 text-xs text-text hover:border-accent">
              Choose a different template
            </Link>
          </div>
        </form>
      )}
    </div>
  );
}

function Field({
  field,
  sites,
}: {
  field: JobTemplateField;
  sites: Array<{ slug: string; name: string }>;
}) {
  if (field.type === "site") {
    return (
      <label className="block">
        <span className="block text-xs font-medium uppercase tracking-[0.06em] text-text-faint">
          {field.label}
          {field.required ? " *" : ""}
        </span>
        <select
          name={field.name}
          required={field.required}
          defaultValue=""
          className="mt-1 w-full rounded-md border border-border bg-surface-soft px-2.5 py-1.5 text-xs outline-none focus:border-accent"
        >
          <option value="" disabled>Choose…</option>
          {sites.map((s) => (
            <option key={s.slug} value={s.slug}>{s.name}</option>
          ))}
        </select>
        {field.helpText ? <span className="mt-1 block text-xs text-text-faint">{field.helpText}</span> : null}
      </label>
    );
  }
  if (field.type === "select") {
    return (
      <label className="block">
        <span className="block text-xs font-medium uppercase tracking-[0.06em] text-text-faint">
          {field.label}
          {field.required ? " *" : ""}
        </span>
        <select
          name={field.name}
          required={field.required}
          defaultValue=""
          className="mt-1 w-full rounded-md border border-border bg-surface-soft px-2.5 py-1.5 text-xs outline-none focus:border-accent"
        >
          <option value="" disabled>Choose…</option>
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </label>
    );
  }
  if (field.type === "textarea") {
    return (
      <label className="block">
        <span className="block text-xs font-medium uppercase tracking-[0.06em] text-text-faint">
          {field.label}
          {field.required ? " *" : ""}
        </span>
        <textarea
          name={field.name}
          required={field.required}
          placeholder={field.placeholder}
          rows={5}
          className="mt-1 w-full rounded-md border border-border bg-surface-soft px-2.5 py-1.5 text-xs outline-none focus:border-accent"
        />
      </label>
    );
  }
  return (
    <label className="block">
      <span className="block text-xs font-medium uppercase tracking-[0.06em] text-text-faint">
        {field.label}
        {field.required ? " *" : ""}
      </span>
      <input
        name={field.name}
        type={field.type === "url" ? "url" : "text"}
        required={field.required}
        placeholder={field.placeholder}
        className="mt-1 w-full rounded-md border border-border bg-surface-soft px-2.5 py-1.5 text-xs outline-none focus:border-accent"
      />
      {field.helpText ? <span className="mt-1 block text-xs text-text-faint">{field.helpText}</span> : null}
    </label>
  );
}
