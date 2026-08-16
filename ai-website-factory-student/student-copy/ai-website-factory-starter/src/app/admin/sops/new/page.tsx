/**
 * P6 — Create new SOP.
 */
import Link from "next/link";
import { createSopAction } from "@/app/actions/prompts";
import { requireAdmin } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export default async function NewSopPage() {
  await requireAdmin();
  return (
    <div className="max-w-2xl space-y-6">
      <header className="brand-rule">
        <Link href="/admin/sops" className="text-xs text-text-faint hover:text-text">← SOPs</Link>
        <h1 className="">New SOP</h1>
        <p className="mt-1.5 text-xs text-text-muted">
          Write the playbook so the team (and the AI assistant) can refer to it.
        </p>
      </header>

      <form action={createSopAction} className="space-y-4">
        <Field label="Title" name="title" required placeholder="How to onboard a new cleaning-services site" />
        <Field label="Category" name="category">
          <select
            name="category"
            defaultValue="general"
            className="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm outline-none focus:border-accent"
          >
            {["general", "seo", "content", "ops", "support"].map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Tags (comma-separated)" name="tags" placeholder="onboarding, wp, plugin" />
        <label className="block">
          <span className="block text-xs font-medium uppercase tracking-[0.06em] text-text-faint">Body (Markdown)</span>
          <textarea
            name="body"
            rows={18}
            placeholder={`# Goal\n…\n\n# Steps\n1. …\n2. …`}
            className="mt-1 w-full rounded-md border border-border bg-surface px-2.5 py-2 font-mono text-xs outline-none focus:border-accent"
          />
        </label>
        <div className="flex items-center gap-2">
          <button type="submit" className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-brand-navy-deep hover:bg-accent-hover">
            Create SOP →
          </button>
          <Link href="/admin/sops" className="rounded-md border border-border px-3 py-1.5 text-xs text-text hover:border-accent">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  name,
  required,
  placeholder,
  children,
}: {
  label: string;
  name: string;
  required?: boolean;
  placeholder?: string;
  children?: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium uppercase tracking-[0.06em] text-text-faint">{label}</span>
      {children ?? (
        <input
          name={name}
          required={required}
          placeholder={placeholder}
          className="mt-1 w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-accent"
        />
      )}
    </label>
  );
}
