import Link from "next/link";
import { Sparkline } from "@/components/ui/Sparkline";
import type {
  CompareMode,
  Ga4Aggregate,
  GscAggregate,
  RangeId,
} from "@/lib/dashboard-traffic";
import { pctDelta } from "@/lib/dashboard-traffic";
import { FilterBar } from "./FilterBar";

/**
 * Two dashboard widgets with intentionally distinct visual identities:
 *
 *   - GscWidget → emerald / mint palette, magnifier motif, faint dot-grid
 *   - Ga4Widget → indigo / blue palette, bar-chart motif, faint slash-lines
 *
 * They intentionally do NOT share a card wrapper — the whole point of the
 * redesign is to make them feel like two different reports side-by-side.
 */

type Diagnostics = {
  message: string;
  hint: string;
  ctaHref: string;
  ctaLabel: string;
};

type SharedProps = {
  currentRange: RangeId;
  currentCompare: CompareMode;
  currentParams: Record<string, string | string[] | undefined>;
  diagnostics: Diagnostics;
};

/* ─────────── GSC widget ─────────── */

export function GscWidget({
  data,
  ...shared
}: SharedProps & { data: GscAggregate }) {
  return (
    <section
      aria-label="Google Search Console"
      className="relative overflow-hidden rounded-2xl border border-emerald-500/25 p-5 shadow-[0_4px_28px_-16px_rgba(16,185,129,0.35)]"
      style={{
        background:
          "linear-gradient(155deg, color-mix(in oklab, #10b981 8%, var(--surface)) 0%, var(--surface) 55%)",
      }}
    >
      <DotGridBackdrop tone="emerald" />
      <div className="relative">
        <WidgetHeader
          badge="UAE"
          title="Google Search Console"
          subtitle="Search performance, Dubai / UAE only"
          viewMoreHref="/admin/gsc"
          Icon={SearchIcon}
          accent="emerald"
        />
        <div className="mt-4">
          <FilterBar
            keyPrefix="gsc"
            currentRange={shared.currentRange}
            currentCompare={shared.currentCompare}
            currentParams={shared.currentParams}
            accent="emerald"
          />
        </div>
        <div className="mt-5">
          {data.hasData ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MetricCard
                accent="emerald"
                label="Clicks"
                value={data.primary.clicks.toLocaleString()}
                delta={pctDelta(data.primary.clicks, data.compared?.clicks ?? 0)}
                spark={data.spark}
              />
              <MetricCard
                accent="emerald"
                label="Impressions"
                value={data.primary.impressions.toLocaleString()}
                delta={pctDelta(data.primary.impressions, data.compared?.impressions ?? 0)}
              />
              <MetricCard
                accent="emerald"
                label="Avg CTR"
                value={`${(data.primary.ctr * 100).toFixed(2)}%`}
                delta={
                  data.compared
                    ? pctDelta(data.primary.ctr, data.compared.ctr)
                    : null
                }
              />
              <MetricCard
                accent="emerald"
                label="Avg Position"
                value={data.primary.position > 0 ? data.primary.position.toFixed(1) : "—"}
                delta={
                  data.compared && data.compared.position > 0
                    ? // Lower is better on position — invert the sign so green = improvement.
                      -1 * (pctDelta(data.primary.position, data.compared.position) ?? 0)
                    : null
                }
                deltaHint="Lower = better"
              />
            </div>
          ) : (
            <EmptyState diagnostics={shared.diagnostics} accent="emerald" />
          )}
        </div>
      </div>
    </section>
  );
}

/* ─────────── GA4 widget ─────────── */

export function Ga4Widget({
  data,
  ...shared
}: SharedProps & { data: Ga4Aggregate }) {
  return (
    <section
      aria-label="Google Analytics"
      className="relative overflow-hidden rounded-2xl border border-indigo-500/25 p-5 shadow-[0_4px_28px_-16px_rgba(99,102,241,0.35)]"
      style={{
        background:
          "linear-gradient(155deg, color-mix(in oklab, #6366f1 8%, var(--surface)) 0%, var(--surface) 55%)",
      }}
    >
      <SlashLineBackdrop tone="indigo" />
      <div className="relative">
        <WidgetHeader
          badge="UAE"
          title="Google Analytics"
          subtitle="Sessions & engagement, Dubai / UAE only"
          viewMoreHref="/admin/reports"
          Icon={AnalyticsIcon}
          accent="indigo"
        />
        <div className="mt-4">
          <FilterBar
            keyPrefix="ga4"
            currentRange={shared.currentRange}
            currentCompare={shared.currentCompare}
            currentParams={shared.currentParams}
            accent="indigo"
          />
        </div>
        <div className="mt-5">
          {data.hasData ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MetricCard
                accent="indigo"
                label="Sessions"
                value={data.primary.sessions.toLocaleString()}
                delta={pctDelta(data.primary.sessions, data.compared?.sessions ?? 0)}
                spark={data.spark}
              />
              <MetricCard
                accent="indigo"
                label="Users"
                value={data.primary.users.toLocaleString()}
                delta={pctDelta(data.primary.users, data.compared?.users ?? 0)}
              />
              <MetricCard
                accent="indigo"
                label="Conversions"
                value={data.primary.conversions.toLocaleString()}
                delta={
                  data.compared
                    ? pctDelta(data.primary.conversions, data.compared.conversions)
                    : null
                }
              />
              <MetricCard
                accent="indigo"
                label="Engagement"
                value={`${(data.primary.engagementRate * 100).toFixed(1)}%`}
                delta={
                  data.compared
                    ? pctDelta(data.primary.engagementRate, data.compared.engagementRate)
                    : null
                }
              />
            </div>
          ) : (
            <EmptyState diagnostics={shared.diagnostics} accent="indigo" />
          )}
        </div>
      </div>
    </section>
  );
}

/* ─────────── Shared pieces ─────────── */

function WidgetHeader({
  badge,
  title,
  subtitle,
  viewMoreHref,
  Icon,
  accent,
}: {
  badge: string;
  title: string;
  subtitle: string;
  viewMoreHref: string;
  Icon: React.FC<{ className?: string }>;
  accent: "emerald" | "indigo";
}) {
  const badgeCls =
    accent === "emerald"
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-emerald-500/30"
      : "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 ring-indigo-500/30";
  const iconCls =
    accent === "emerald"
      ? "text-emerald-500 dark:text-emerald-400"
      : "text-indigo-500 dark:text-indigo-400";
  return (
    <header className="flex items-start justify-between gap-3">
      <div className="flex items-center gap-3">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ring-1 ring-inset ${badgeCls}`}>
          <Icon className={`h-4 w-4 ${iconCls}`} />
        </span>
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-text">{title}</h2>
            <span
              className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest ring-1 ring-inset ${badgeCls}`}
            >
              {badge}
            </span>
          </div>
          <p className="mt-0.5 text-[11px] text-text-muted">{subtitle}</p>
        </div>
      </div>
      <Link
        href={viewMoreHref}
        className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs text-text hover:border-accent"
      >
        View more →
      </Link>
    </header>
  );
}

function MetricCard({
  label,
  value,
  delta,
  deltaHint,
  spark,
  accent,
}: {
  label: string;
  value: string;
  delta: number | null | undefined;
  deltaHint?: string;
  spark?: number[];
  accent: "emerald" | "indigo";
}) {
  const deltaColor =
    delta == null
      ? "text-text-faint"
      : delta > 0
        ? "text-emerald-600 dark:text-emerald-400"
        : delta < 0
          ? "text-rose-600 dark:text-rose-400"
          : "text-text-faint";
  const deltaSign = delta != null && delta > 0 ? "+" : "";
  const sparkColor = accent === "emerald" ? "#10b981" : "#6366f1";
  return (
    <div
      className="relative overflow-hidden rounded-xl border border-border bg-surface-2 p-3"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 h-full w-[3px]"
        style={{ background: sparkColor, opacity: 0.65 }}
      />
      <p className="pl-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-text-faint">
        {label}
      </p>
      <p className="mt-1.5 pl-1.5 text-2xl font-semibold tabular-nums leading-none tracking-tight text-text">
        {value}
      </p>
      <div className="mt-2 flex items-end justify-between gap-2 pl-1.5">
        <span className={`text-[11px] tabular-nums ${deltaColor}`}>
          {delta != null
            ? `${deltaSign}${delta.toFixed(1)}%`
            : deltaHint ?? "—"}
        </span>
        {spark && spark.length > 0 ? (
          <span className="h-8 w-20 shrink-0 sm:w-24">
            <Sparkline data={spark} stroke={sparkColor} />
          </span>
        ) : null}
      </div>
    </div>
  );
}

function EmptyState({
  diagnostics,
  accent,
}: {
  diagnostics: Diagnostics;
  accent: "emerald" | "indigo";
}) {
  const btnCls =
    accent === "emerald"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300"
      : "border-indigo-500/40 bg-indigo-500/10 text-indigo-700 hover:bg-indigo-500/20 dark:text-indigo-300";
  return (
    <div className="rounded-lg border border-dashed border-border bg-surface-2/60 p-4 text-xs text-text-muted">
      <p className="font-medium text-text">{diagnostics.message}</p>
      <p className="mt-1">{diagnostics.hint}</p>
      <Link
        href={diagnostics.ctaHref}
        className={`mt-3 inline-flex rounded-md border px-3 py-1.5 text-[11px] font-medium ${btnCls}`}
      >
        {diagnostics.ctaLabel} →
      </Link>
    </div>
  );
}

/* ─────────── Backdrops (distinct per widget) ─────────── */

function DotGridBackdrop({ tone: _ }: { tone: "emerald" | "indigo" }) {
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.16]"
    >
      <defs>
        <pattern id="dg-emerald" width="18" height="18" patternUnits="userSpaceOnUse">
          <circle cx="1.5" cy="1.5" r="1.1" fill="#10b981" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#dg-emerald)" />
    </svg>
  );
}

function SlashLineBackdrop({ tone: _ }: { tone: "emerald" | "indigo" }) {
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.14]"
    >
      <defs>
        <pattern id="sl-indigo" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
          <line x1="0" y1="0" x2="0" y2="14" stroke="#6366f1" strokeWidth="1.4" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#sl-indigo)" />
    </svg>
  );
}

/* ─────────── Icons ─────────── */

function SearchIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" strokeLinecap="round" />
    </svg>
  );
}

function AnalyticsIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path d="M5 20V10" strokeLinecap="round" />
      <path d="M12 20V4" strokeLinecap="round" />
      <path d="M19 20v-7" strokeLinecap="round" />
    </svg>
  );
}
