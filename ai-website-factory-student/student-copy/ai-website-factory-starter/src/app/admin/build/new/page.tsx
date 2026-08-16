/**
 * /admin/build/new — 1-step wizard (single form, grouped sections).
 *
 * Kept as a single page rather than a multi-step flow because every
 * field is needed up-front to queue the first research job. Sections
 * are visually grouped so it doesn't feel like a wall.
 */
import Link from "next/link";
import { createBuildProjectAction } from "@/app/actions/site-build";
import { requireAdmin } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export default async function NewBuildPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  await requireAdmin();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="brand-rule">
        <Link href="/admin/build" className="text-xs text-text-faint hover:text-text">
          ← Build
        </Link>
        <h1 className="mt-1 text-2xl font-medium tracking-tightish text-text">
          Build a new website
        </h1>
        <p className="mt-1.5 text-base text-text-muted">
          Answer these once. The agent queues a global research job immediately and walks you through the rest.
        </p>
      </header>

      {searchParams.error === "missing-fields" ? (
        <div className="rounded-md border border-warning/30 bg-warning-tint px-3 py-2 text-base text-warning">
          Business name, niche, and target city are required.
        </div>
      ) : null}

      <form action={createBuildProjectAction} className="space-y-6">
        {/* ── Section 1 · Basics ─────────────────────────────────── */}
        <Section
          title="The business"
          subtitle="Two required. Domain is optional — you can set it later."
        >
          <Grid>
            <Field label="Business name" required>
              <input
                name="businessName"
                required
                placeholder="Bright Smile Dental"
                className="h-9 w-full rounded-md border border-border bg-surface px-3 text-base text-text outline-none transition placeholder:text-text-faint focus:border-accent focus:ring-2 focus:ring-accent-ring"
              />
            </Field>
            <Field label="Business niche / industry" required>
              <input
                name="niche"
                required
                placeholder="dental clinic, yoga studio, law firm, HVAC contractor"
                className="h-9 w-full rounded-md border border-border bg-surface px-3 text-base text-text outline-none transition placeholder:text-text-faint focus:border-accent focus:ring-2 focus:ring-accent-ring"
              />
            </Field>
            <Field label="Domain (optional)">
              <input
                name="domain"
                placeholder="brightsmiledental.com"
                className="h-9 w-full rounded-md border border-border bg-surface px-3 font-mono text-base text-text outline-none transition focus:border-accent focus:ring-2 focus:ring-accent-ring"
              />
            </Field>
            <Field label="Target city" required>
              <input
                name="city"
                required
                placeholder="Dubai"
                className="h-9 w-full rounded-md border border-border bg-surface px-3 text-base text-text outline-none transition focus:border-accent focus:ring-2 focus:ring-accent-ring"
              />
            </Field>
            <Field label="Region / Province">
              <input
                name="region"
                defaultValue="United Arab Emirates"
                className="h-9 w-full rounded-md border border-border bg-surface px-3 text-base text-text outline-none transition focus:border-accent focus:ring-2 focus:ring-accent-ring"
              />
            </Field>
          </Grid>
          <Field label="Services offered">
            <input
              name="services"
              placeholder="e.g. teeth whitening, implants, checkups, emergency care"
              className="h-9 w-full rounded-md border border-border bg-surface px-3 text-base text-text outline-none transition placeholder:text-text-faint focus:border-accent focus:ring-2 focus:ring-accent-ring"
            />
            <p className="mt-1 text-xs text-text-faint">
              Comma-separated. The agent generates one service page per item.
            </p>
          </Field>
        </Section>

        {/* ── Section 2 · Content ────────────────────────────────── */}
        <Section
          title="Content source"
          subtitle="Choose how the agent handles copy. You can mix — write what you have, let the agent expand the rest."
        >
          <Radio
            name="contentSource"
            value="agent_draft"
            defaultChecked
            label="Let the agent write everything"
            help="It uses the Design DNA + research to draft every page in your tone."
          />
          <Radio
            name="contentSource"
            value="user_provided"
            label="Use the content I provide"
            help="The agent stays strict to your content; only fills schema, SEO meta, internal links."
          />
          <Radio
            name="contentSource"
            value="hybrid"
            label="Hybrid — I'll write the bones, agent expands"
            help="Your outline drives structure; the agent fills the body."
          />
          <Field label="Your content / notes / brand voice (optional)">
            <textarea
              name="contentNotes"
              rows={6}
              placeholder="Paste any existing copy, brand voice notes, must-haves, things to avoid. The agent treats everything here as ground truth."
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-base text-text outline-none transition focus:border-accent focus:ring-2 focus:ring-accent-ring"
            />
          </Field>
        </Section>

        {/* ── Section 3 · Design ─────────────────────────────────── */}
        <Section
          title="Design direction"
          subtitle="The agent's superpower: it surveys best-in-class businesses in your niche worldwide (NYC, LA, London, Paris, Dubai, Sydney, Singapore, Tokyo), not just your local market. Lets us land on a look that's unique in your city."
        >
          <Radio
            name="designMode"
            value="global_research"
            defaultChecked
            label="Survey globally + synthesize"
            help="Default. Most unique outcome — the agent picks 10-12 international references in your niche, extracts what's distinctive, and produces a Design DNA that won't look like anyone in your city."
          />
          <Radio
            name="designMode"
            value="specific_examples"
            label="Use specific examples I'll provide"
            help="Skip the survey. The agent uses only the URLs you paste below."
          />
          <Field label="Inspiration URLs (optional, one per line)">
            <textarea
              name="inspirationUrls"
              rows={4}
              placeholder={"https://example1.com\nhttps://example2.com"}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-sm text-text outline-none transition focus:border-accent focus:ring-2 focus:ring-accent-ring"
            />
          </Field>
        </Section>

        {/* ── CTA ────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-3 pt-2">
          <Link
            href="/admin/build"
            className="text-base text-text-muted hover:text-text"
          >
            ← Cancel
          </Link>
          <button
            type="submit"
            className="h-10 rounded-md bg-accent px-5 text-md font-medium text-accent-fg shadow-xs transition hover:bg-accent-hover"
          >
            Start build · queue research →
          </button>
        </div>
        <p className="text-xs text-text-faint">
          Next: the agent runs a ~15-minute global design research job. You&apos;ll approve the output before
          moving to Design DNA. Total estimated build time: 1–3 hours of agent work across all phases.
        </p>
      </form>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-xl border border-border bg-surface p-6">
      <header className="space-y-1">
        <h2 className="text-lg font-medium text-text">{title}</h2>
        {subtitle ? <p className="text-base text-text-muted">{subtitle}</p> : null}
      </header>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2">{children}</div>;
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium uppercase tracking-[0.08em] text-text-faint">
        {label}
        {required ? " *" : ""}
      </span>
      <span className="mt-1 block">{children}</span>
    </label>
  );
}

function Radio({
  name,
  value,
  label,
  help,
  defaultChecked,
}: {
  name: string;
  value: string;
  label: string;
  help?: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-surface-2 p-3 transition hover:border-border-strong">
      <input
        type="radio"
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        className="mt-1 h-4 w-4 accent-accent"
      />
      <span>
        <span className="block text-base font-medium text-text">{label}</span>
        {help ? <span className="mt-0.5 block text-base text-text-muted">{help}</span> : null}
      </span>
    </label>
  );
}
