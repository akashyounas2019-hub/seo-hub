/**
 * Operator design system — visual proof page.
 *
 * Lives at /admin/_design. Renders every token, the type scale, all
 * surface layers, and every primitive (Button, Pill, Card, MetricCard,
 * DataTable preview, Drawer trigger, EmptyState, Skeleton, KBD,
 * SegmentedControl, Form fields) in both Light and Dark + the
 * customer-brand preview variant.
 *
 * If something looks wrong here, the rest of the app inherits the bug.
 * Always change tokens, then verify here, then ship.
 */
import Link from "next/link";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { DesigningScoutTabs } from "@/components/ui/DesigningScoutTabs";

export const dynamic = "force-dynamic";

export default function DesignTestPage() {
  return (
    <div className="min-h-screen bg-bg text-text">
      {/* Page chrome ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b border-border bg-bg/85 backdrop-blur supports-[backdrop-filter]:bg-bg/70">
        <div className="mx-auto flex h-12 max-w-[1240px] items-center gap-4 px-6">
          <Link href="/admin" className="text-sm font-medium text-text">
            ← Admin
          </Link>
          <span className="text-sm text-text-faint">·</span>
          <h1 className="text-md font-medium text-text">Operator · Design system</h1>
          <div className="flex-1" />
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-[1240px] space-y-12 px-6 py-10">
        {/* Intro ─────────────────────────────────────────────────── */}
        <section className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-text-faint">
            Design system · v1
          </p>
          <h2 className="text-3xl font-medium tracking-tightish text-text">
            One direction, neutral by default
          </h2>
          <p className="max-w-[68ch] text-md text-text-muted">
            Cool near-neutral surfaces, a single confident accent, layered
            depth without decoration. Customer brand survives as a theme
            variant for booking widgets and brand-match previews.
          </p>
          <DesigningScoutTabs />
        </section>

        {/* Section 1 · Color tokens ──────────────────────────────── */}
        <Section
          eyebrow="01"
          title="Color tokens"
          subtitle="Every value is a CSS variable. Swap globals.css to re-skin the product."
        >
          <SwatchRow label="Surfaces">
            <Swatch name="bg" />
            <Swatch name="surface" />
            <Swatch name="surface-2" />
            <Swatch name="surface-3" />
          </SwatchRow>
          <SwatchRow label="Text">
            <Swatch name="text" />
            <Swatch name="text-muted" />
            <Swatch name="text-faint" />
          </SwatchRow>
          <SwatchRow label="Borders + accent">
            <Swatch name="border" border />
            <Swatch name="border-strong" border />
            <Swatch name="accent" />
            <Swatch name="accent-hover" />
            <Swatch name="accent-tint" />
          </SwatchRow>
          <SwatchRow label="Semantic">
            <Swatch name="success" />
            <Swatch name="warning" />
            <Swatch name="danger" />
            <Swatch name="info" />
          </SwatchRow>
        </Section>

        {/* Section 2 · Typography ───────────────────────────────── */}
        <Section
          eyebrow="02"
          title="Type scale"
          subtitle="Geist Sans throughout chrome. Default body 13/20. Headings via size + tracking, never via serif."
        >
          <div className="space-y-4 rounded-lg border border-border bg-surface p-6">
            <TypeRow size="text-3xl" label="3xl · 28 / 32" tracking="-0.014em">
              Network composite trending up
            </TypeRow>
            <TypeRow size="text-2xl" label="2xl · 22 / 28" tracking="-0.011em">
              Site workspace — overview
            </TypeRow>
            <TypeRow size="text-xl" label="xl · 18 / 24" tracking="-0.008em">
              Section heading
            </TypeRow>
            <TypeRow size="text-lg" label="lg · 16 / 24" tracking="-0.006em">
              Section subheading or table column header
            </TypeRow>
            <TypeRow size="text-md" label="md · 14 / 20" tracking="-0.003em">
              Settings descriptions, doc paragraphs
            </TypeRow>
            <TypeRow size="text-base" label="base · 13 / 20 (default)">
              Default body. Table rows, cards, sidebar items, most chrome.
            </TypeRow>
            <TypeRow size="text-sm" label="sm · 12 / 16">
              Secondary metadata, helper text, captions.
            </TypeRow>
            <TypeRow size="text-xs" label="xs · 11 / 16">
              Eyebrow labels, table column headings, badge text.
            </TypeRow>
          </div>

          <div className="rounded-lg border border-border bg-surface p-6">
            <p className="mb-3 text-xs font-medium uppercase tracking-[0.08em] text-text-faint">
              Tabular numerals · always on for metrics
            </p>
            <div className="flex flex-wrap items-baseline gap-x-8 gap-y-3 tnum">
              <span className="text-3xl font-medium text-text">1,283,407</span>
              <span className="text-2xl text-text-muted">98%</span>
              <span className="text-xl text-text-muted">$24,780.00</span>
              <span className="text-lg text-text-muted">2,134 pages</span>
            </div>
            <p className="mt-3 font-mono text-xs text-text-faint">
              0123456789 — Geist Mono · tabular
            </p>
          </div>
        </Section>

        {/* Section 3 · Surface layers ───────────────────────────── */}
        <Section
          eyebrow="03"
          title="Surface layers"
          subtitle="Three levels of depth. Shadows live on L2+ only. No decorative glows or blobs."
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <SurfaceLayer label="L0 · bg" className="bg-bg" />
            <SurfaceLayer label="L1 · surface" className="bg-surface" />
            <SurfaceLayer label="L2 · surface-2" className="bg-surface-2" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg bg-surface p-4 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-text-faint">
                shadow-sm
              </p>
              <p className="mt-1 text-base text-text">Default card surface elevation.</p>
            </div>
            <div className="rounded-lg bg-surface p-4 shadow-md">
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-text-faint">
                shadow-md
              </p>
              <p className="mt-1 text-base text-text">Popover, dropdown, drawer.</p>
            </div>
          </div>
        </Section>

        {/* Section 4 · Primitives ───────────────────────────────── */}
        <Section eyebrow="04" title="Primitives" subtitle="The atomic building blocks every screen composes from.">
          {/* Buttons */}
          <Block title="Buttons">
            <div className="flex flex-wrap items-center gap-3">
              <button className="h-8 rounded-md bg-accent px-3 text-xs font-medium text-accent-fg shadow-xs transition hover:bg-accent-hover">
                Primary
              </button>
              <button className="h-8 rounded-md border border-border bg-surface px-3 text-xs font-medium text-text transition hover:border-border-strong hover:bg-surface-2">
                Secondary
              </button>
              <button className="h-8 rounded-md px-3 text-xs font-medium text-text-muted transition hover:bg-surface-2 hover:text-text">
                Ghost
              </button>
              <button className="h-8 rounded-md border border-danger/30 bg-danger-tint px-3 text-xs font-medium text-danger transition hover:border-danger/50">
                Destructive
              </button>
              <button className="h-7 rounded-md border border-border bg-surface px-2.5 text-xs font-medium text-text transition hover:border-border-strong" disabled>
                Disabled
              </button>
            </div>
          </Block>

          {/* Pills */}
          <Block title="Status pills">
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone="success">verified</Pill>
              <Pill tone="warning">stale</Pill>
              <Pill tone="danger">failing</Pill>
              <Pill tone="info">in review</Pill>
              <Pill tone="accent">primary</Pill>
              <Pill tone="neutral">draft</Pill>
            </div>
          </Block>

          {/* Metric card */}
          <Block title="Metric card">
            <div className="grid gap-3 sm:grid-cols-4">
              <MetricCard label="QA failures" value={4} delta={-2} sparkline />
              <MetricCard label="SEO proposals" value={12} delta={+5} sparkline />
              <MetricCard label="Revenue · MTD" value="$24,780" delta={+12} format="pct" />
              <MetricCard label="Sites online" value={"15 / 15"} delta={null} />
            </div>
          </Block>

          {/* Data table preview */}
          <Block title="Data table">
            <div className="overflow-hidden rounded-lg border border-border bg-surface">
              <table className="w-full text-base">
                <thead className="border-b border-border bg-surface-2 text-text-muted">
                  <tr>
                    <Th>Site</Th>
                    <Th align="right">QA</Th>
                    <Th align="right">SEO</Th>
                    <Th align="right">Last scan</Th>
                    <Th align="right">Status</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  <TableRow site="Northside Dental" qa={92} seo={83} last="2 min ago" status="ok" />
                  <TableRow site="Riverside Fitness" qa={68} seo={72} last="14 min ago" status="warn" />
                  <TableRow site="Maple Dental Co." qa={41} seo={55} last="3 h ago" status="fail" />
                  <TableRow site="Riverside Fitness Studio" qa={88} seo={91} last="1 h ago" status="ok" />
                  <TableRow site="Niagara Falls Tours" qa={78} seo={61} last="32 min ago" status="ok" />
                </tbody>
              </table>
            </div>
          </Block>

          {/* Approval card */}
          <Block title="Approval card">
            <div className="overflow-hidden rounded-lg border border-border bg-surface">
              <div className="flex items-start gap-4 p-5">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-accent-tint text-accent">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2 4 8v6c0 5 3.5 7 8 8 4.5-1 8-3 8-8V8l-8-6Z" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Pill tone="warning">awaiting approval</Pill>
                    <span className="text-xs text-text-faint">2 min ago</span>
                  </div>
                  <h4 className="mt-1.5 text-lg font-medium text-text">
                    Rewrite 4 meta titles on yourbusiness.com
                  </h4>
                  <p className="mt-1 text-base text-text-muted">
                    <span className="font-medium text-text">Why it matters: </span>
                    Current titles are 62-78 chars — over Google&apos;s 60-char display cutoff.
                    Estimated CTR lift 4-7% based on previous similar fixes on this site.
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <button className="h-7 rounded-md bg-accent px-2.5 text-xs font-medium text-accent-fg shadow-xs transition hover:bg-accent-hover">
                      Approve
                    </button>
                    <button className="h-7 rounded-md border border-border bg-surface px-2.5 text-xs font-medium text-text transition hover:border-border-strong">
                      Assign
                    </button>
                    <button className="h-7 rounded-md px-2.5 text-xs font-medium text-text-muted transition hover:bg-surface-2 hover:text-text">
                      Snooze · 24h
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </Block>

          {/* Empty state */}
          <Block title="Empty state · filtered">
            <div className="grid place-items-center rounded-lg border border-dashed border-border-strong bg-surface px-6 py-12 text-center">
              <div className="grid h-10 w-10 place-items-center rounded-md bg-surface-2 text-text-faint">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
              </div>
              <p className="mt-3 text-md font-medium text-text">No matches for &quot;teeth whitening&quot;</p>
              <p className="mt-1 text-base text-text-muted">
                Try removing a filter or broadening the search.
              </p>
              <button className="mt-4 h-7 rounded-md border border-border bg-surface px-2.5 text-xs font-medium text-text transition hover:border-border-strong">
                Clear filters
              </button>
            </div>
          </Block>

          {/* Skeleton */}
          <Block title="Skeleton · matches layout">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-border bg-surface p-5">
                <SkeletonLine w="40%" />
                <div className="mt-3 space-y-1.5">
                  <SkeletonLine w="80%" h="22px" />
                  <SkeletonLine w="55%" />
                </div>
              </div>
              <div className="rounded-lg border border-border bg-surface p-5">
                <SkeletonLine w="40%" />
                <div className="mt-3 space-y-1.5">
                  <SkeletonLine w="80%" h="22px" />
                  <SkeletonLine w="55%" />
                </div>
              </div>
              <div className="rounded-lg border border-border bg-surface p-5">
                <SkeletonLine w="40%" />
                <div className="mt-3 space-y-1.5">
                  <SkeletonLine w="80%" h="22px" />
                  <SkeletonLine w="55%" />
                </div>
              </div>
            </div>
          </Block>

          {/* Inputs */}
          <Block title="Form inputs">
            <div className="grid max-w-2xl gap-3">
              <label className="block">
                <span className="block text-xs font-medium uppercase tracking-[0.08em] text-text-faint">
                  Site URL
                </span>
                <input
                  defaultValue="https://yourbusiness.com"
                  className="mt-1 h-8 w-full rounded-md border border-border bg-surface px-2.5 font-mono text-base text-text outline-none transition placeholder:text-text-faint focus:border-accent focus:ring-2 focus:ring-accent-ring"
                />
              </label>
              <label className="block">
                <span className="block text-xs font-medium uppercase tracking-[0.08em] text-text-faint">
                  Service type
                </span>
                <select
                  className="mt-1 h-8 w-full rounded-md border border-border bg-surface px-2.5 text-base text-text outline-none transition focus:border-accent focus:ring-2 focus:ring-accent-ring"
                  defaultValue="airport"
                >
                  <option value="airport">Airport transfer</option>
                  <option value="wedding">Wedding</option>
                  <option value="corporate">Corporate</option>
                </select>
              </label>
              <label className="block">
                <span className="block text-xs font-medium uppercase tracking-[0.08em] text-text-faint">
                  Notes
                </span>
                <textarea
                  rows={3}
                  defaultValue="Run QA after deploying the new hero variant. Flag any text-overflow on mobile widths."
                  className="mt-1 w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-base text-text outline-none transition focus:border-accent focus:ring-2 focus:ring-accent-ring"
                />
              </label>
            </div>
          </Block>

          {/* Keyboard */}
          <Block title="Keyboard hints">
            <div className="flex flex-wrap items-center gap-3 text-xs text-text-muted">
              <span>Open command palette</span>
              <span>
                <kbd>⌘</kbd> <kbd>K</kbd>
              </span>
              <span className="text-text-faint">·</span>
              <span>Switch site</span>
              <span>
                <kbd>⌘</kbd> <kbd>\</kbd>
              </span>
              <span className="text-text-faint">·</span>
              <span>Toggle theme</span>
              <span>
                <kbd>⌘</kbd> <kbd>⇧</kbd> <kbd>L</kbd>
              </span>
            </div>
          </Block>
        </Section>

        {/* Section 5 · Customer-brand preview ───────────────────── */}
        <Section
          eyebrow="05"
          title="Customer brand preview"
          subtitle="The navy/champagne survives — applied only to surfaces showing customer-facing content (booking widgets, brand-match samples)."
        >
          <div data-theme="brand-cleaning" className="rounded-xl border border-border bg-bg p-8 shadow-md">
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-text-faint">
              Quote widget preview
            </p>
            <h3 className="mt-2 text-2xl font-medium tracking-tightish text-text">
              Get a same-day quote
            </h3>
            <p className="mt-1 text-base text-text-muted">
              Palm Jumeirah · Dubai Marina · Downtown Dubai · Same-day availability
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="block text-xs font-medium uppercase tracking-[0.08em] text-text-faint">Property</span>
                <input
                  defaultValue="4-bedroom villa · Palm Jumeirah"
                  className="mt-1 h-9 w-full rounded-md border border-border bg-surface px-3 text-base text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent-ring"
                />
              </label>
              <label className="block">
                <span className="block text-xs font-medium uppercase tracking-[0.08em] text-text-faint">Service</span>
                <input
                  defaultValue="Deep clean · 60-point checklist"
                  className="mt-1 h-9 w-full rounded-md border border-border bg-surface px-3 text-base text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent-ring"
                />
              </label>
            </div>
            <button className="mt-4 h-9 rounded-md bg-accent px-4 text-md font-medium text-accent-fg shadow-xs transition hover:bg-accent-hover">
              Get a quote →
            </button>
          </div>
        </Section>

        {/* Footer ───────────────────────────────────────────────── */}
        <footer className="border-t border-border pt-6 text-xs text-text-faint">
          Toggle between Light / Dark / System above. The customer-brand
          theme is scoped to specific surfaces — toggle does not affect it.
        </footer>
      </main>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════
// Page-local components — staying inline because this is a one-off
// proof page, not real production code.
// ═════════════════════════════════════════════════════════════════

function Section({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-5">
      <header className="flex items-baseline gap-4">
        <span className="tnum text-xs font-medium uppercase tracking-[0.08em] text-text-faint">
          {eyebrow}
        </span>
        <div className="space-y-1">
          <h3 className="text-xl font-medium text-text">{title}</h3>
          {subtitle ? <p className="max-w-[64ch] text-base text-text-muted">{subtitle}</p> : null}
        </div>
      </header>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function SwatchRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="mb-3 text-xs font-medium uppercase tracking-[0.08em] text-text-faint">{label}</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{children}</div>
    </div>
  );
}

function Swatch({ name, border }: { name: string; border?: boolean }) {
  const v = `var(--${name})`;
  return (
    <div className="space-y-1.5">
      <div
        className="h-12 rounded-md"
        style={{
          background: border ? "transparent" : v,
          borderColor: v,
          borderWidth: border ? 1 : 0,
          boxShadow: border ? "none" : "inset 0 0 0 1px var(--border)",
        }}
      />
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-xs text-text">{`--${name}`}</span>
      </div>
    </div>
  );
}

function TypeRow({
  size,
  label,
  tracking,
  children,
}: {
  size: string;
  label: string;
  tracking?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-6 border-b border-border pb-3 last:border-0 last:pb-0">
      <span className="w-44 shrink-0 font-mono text-xs text-text-faint">{label}</span>
      <span className={`${size} text-text`} style={tracking ? { letterSpacing: tracking } : undefined}>
        {children}
      </span>
    </div>
  );
}

function SurfaceLayer({ label, className }: { label: string; className: string }) {
  return (
    <div className={`rounded-lg border border-border ${className} p-4`}>
      <p className="text-xs font-medium uppercase tracking-[0.08em] text-text-faint">{label}</p>
      <p className="mt-1 text-base text-text">Sample content on this layer</p>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-medium uppercase tracking-[0.08em] text-text-faint">{title}</p>
      {children}
    </div>
  );
}

function Pill({
  tone,
  children,
}: {
  tone: "success" | "warning" | "danger" | "info" | "accent" | "neutral";
  children: React.ReactNode;
}) {
  const map: Record<typeof tone, string> = {
    success: "border-success/25 bg-success-tint text-success",
    warning: "border-warning/25 bg-warning-tint text-warning",
    danger: "border-danger/25 bg-danger-tint text-danger",
    info: "border-info/25 bg-info-tint text-info",
    accent: "border-accent/25 bg-accent-tint text-accent",
    neutral: "border-border bg-surface-2 text-text-muted",
  } as const;
  return (
    <span className={`inline-flex h-5 items-center rounded border px-1.5 text-xs font-medium ${map[tone]}`}>
      {children}
    </span>
  );
}

function MetricCard({
  label,
  value,
  delta,
  sparkline,
  format,
}: {
  label: string;
  value: string | number;
  delta: number | null;
  sparkline?: boolean;
  format?: "pct";
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="text-xs font-medium uppercase tracking-[0.08em] text-text-faint">{label}</p>
      <div className="mt-2 flex items-baseline justify-between gap-3">
        <p className="font-medium tnum text-3xl leading-none text-text">{value}</p>
        {sparkline ? <MiniSpark /> : null}
      </div>
      {delta !== null ? (
        <p
          className={`mt-2 tnum text-xs ${
            delta > 0 ? "text-success" : delta < 0 ? "text-danger" : "text-text-muted"
          }`}
        >
          {delta > 0 ? "▲" : delta < 0 ? "▼" : "·"} {Math.abs(delta)}
          {format === "pct" ? "%" : ""}
        </p>
      ) : (
        <p className="mt-2 text-xs text-text-faint">—</p>
      )}
    </div>
  );
}

function MiniSpark() {
  // 10 data points, deterministic so this page doesn't shift between renders
  const pts = [42, 38, 41, 47, 45, 52, 50, 56, 61, 58];
  const max = Math.max(...pts);
  const min = Math.min(...pts);
  const w = 56;
  const h = 18;
  const d = pts
    .map((p, i) => {
      const x = (i / (pts.length - 1)) * w;
      const y = h - ((p - min) / (max - min || 1)) * h;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width={w} height={h} className="text-accent" aria-hidden>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: "right" }) {
  return (
    <th
      className={`px-3 py-2 text-xs font-medium uppercase tracking-[0.08em] text-text-faint ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

function TableRow({
  site,
  qa,
  seo,
  last,
  status,
}: {
  site: string;
  qa: number;
  seo: number;
  last: string;
  status: "ok" | "warn" | "fail";
}) {
  const tone =
    status === "ok"
      ? "success"
      : status === "warn"
        ? "warning"
        : "danger";
  return (
    <tr className="text-base transition hover:bg-surface-2">
      <td className="px-3 py-2 text-text">{site}</td>
      <td className="px-3 py-2 text-right tnum text-text">{qa}</td>
      <td className="px-3 py-2 text-right tnum text-text">{seo}</td>
      <td className="px-3 py-2 text-right text-text-muted">{last}</td>
      <td className="px-3 py-2 text-right">
        <Pill tone={tone as "success" | "warning" | "danger"}>
          {status === "ok" ? "healthy" : status === "warn" ? "warn" : "fail"}
        </Pill>
      </td>
    </tr>
  );
}

function SkeletonLine({ w, h = "13px" }: { w: string; h?: string }) {
  return (
    <div
      className="rounded animate-pulse bg-surface-2"
      style={{ width: w, height: h }}
    />
  );
}
