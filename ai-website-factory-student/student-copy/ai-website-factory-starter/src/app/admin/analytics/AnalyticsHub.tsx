"use client";

/**
 * Analytics main hub — simplified layout.
 *
 * Three property rows: property name + a single Connected / Not connected
 * button, each on one line. Clicking "Not connected" for GA/GSC opens a
 * per-site picker that redirects into the existing Google OAuth flow.
 * GBP opens a small explainer (no OAuth route yet).
 *
 * Below the property rows: a widgets grid populated from analytics_widgets,
 * plus an "Add a new widget" tile that opens the catalog picker.
 */
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import {
  BarChart3,
  Building2,
  ChevronRight,
  FileText,
  Globe,
  Hash,
  Phone,
  Plus,
  Search,
  Trash2,
  TrendingUp,
  Users,
  X,
  Zap,
} from "lucide-react";
import {
  addAnalyticsWidget,
  removeAnalyticsWidget,
  toggleAnalyticsWidget,
} from "@/app/actions/analytics-widgets";
import {
  WIDGET_CATALOG,
  type WidgetData,
  type WidgetKind,
} from "@/lib/analytics-widget-types";
import { useRouter } from "next/navigation";

/* ─────────── types ─────────── */

export type ConnectorCard = {
  id: "ga" | "gsc" | "gbp";
  title: string;
  href: string;
  accent: "orange" | "cyan" | "fuchsia";
  provider: "google" | "gbp";
  connected: boolean;
};

export type WidgetInstance = {
  id: string;
  kind: string;
  label: string;
  enabled: boolean;
  icon: string;
  accent: "orange" | "cyan" | "fuchsia" | "emerald";
  data: WidgetData;
};

export interface AnalyticsHubProps {
  cards: ConnectorCard[];
  siteOptions: { slug: string; name: string; connected: boolean }[];
  widgets: WidgetInstance[];
}

const ACCENT: Record<ConnectorCard["accent"], { tint: string; text: string; icon: React.ElementType; ring: string }> = {
  orange:  { tint: "bg-orange-500/10",  text: "text-orange-300",  icon: BarChart3, ring: "ring-orange-500/30" },
  cyan:    { tint: "bg-cyan-500/10",    text: "text-cyan-300",    icon: Globe,     ring: "ring-cyan-500/30" },
  fuchsia: { tint: "bg-fuchsia-500/10", text: "text-fuchsia-300", icon: Building2, ring: "ring-fuchsia-500/30" },
};

const WIDGET_ACCENT: Record<WidgetInstance["accent"], { tint: string; text: string; stroke: string }> = {
  orange:  { tint: "bg-orange-500/10",  text: "text-orange-300",  stroke: "#f97316" },
  cyan:    { tint: "bg-cyan-500/10",    text: "text-cyan-300",    stroke: "#06b6d4" },
  fuchsia: { tint: "bg-fuchsia-500/10", text: "text-fuchsia-300", stroke: "#a855f7" },
  emerald: { tint: "bg-emerald-500/10", text: "text-emerald-300", stroke: "#10b981" },
};

const WIDGET_ICONS: Record<string, React.ElementType> = {
  Users, Zap, TrendingUp, Search, FileText, Hash, Phone,
};

/* ─────────── main ─────────── */

export function AnalyticsHub({ cards, siteOptions, widgets }: AnalyticsHubProps) {
  const [pickingFor, setPickingFor] = useState<ConnectorCard | null>(null);
  const [gbpNotice, setGbpNotice] = useState(false);
  const [showCatalog, setShowCatalog] = useState(false);

  const router = useRouter();
  const [pending, start] = useTransition();
  const refresh = () => router.refresh();

  const onAddWidget = (kind: WidgetKind) => {
    start(async () => {
      await addAnalyticsWidget(kind);
      setShowCatalog(false);
      refresh();
    });
  };
  const onRemoveWidget = (id: string) => {
    start(async () => { await removeAnalyticsWidget(id); refresh(); });
  };
  const onToggleWidget = (id: string, next: boolean) => {
    start(async () => { await toggleAnalyticsWidget(id, next); refresh(); });
  };

  const connectedCount = cards.filter((c) => c.connected).length;

  return (
    <div className="relative min-h-screen bg-[#05070d] text-white overflow-hidden -mx-5 sm:-mx-7 md:-mx-10 -my-4 sm:-my-5 md:-my-6">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "linear-gradient(rgba(56,189,248,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,0.06) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
      <div className="pointer-events-none absolute -top-40 -left-32 w-[520px] h-[520px] rounded-full blur-3xl bg-cyan-500/10" />
      <div className="pointer-events-none absolute -bottom-40 -right-32 w-[520px] h-[520px] rounded-full blur-3xl bg-blue-600/10" />

      <div className="relative z-10 w-full px-4 sm:px-6 py-8 space-y-6">
        {/* Header — matches the terse style used elsewhere in the app. */}
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.28em] text-cyan-300/80">Dubai · Cleaning Services</div>
            <h1 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">Property Analytics</h1>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-slate-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            {connectedCount}/3 properties connected
          </div>
        </header>

        {/* Property rows — one line each. */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/40 divide-y divide-slate-800">
          {cards.map((c) => (
            <PropertyRow
              key={c.id}
              card={c}
              onConnect={() => {
                if (c.provider === "gbp") setGbpNotice(true);
                else setPickingFor(c);
              }}
            />
          ))}
        </section>

        {/* Widgets grid + Add tile. */}
        <section>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Widgets</h2>
            <button
              type="button"
              onClick={() => setShowCatalog(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-cyan-400/40 bg-cyan-500/20 px-3 py-1.5 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/30"
            >
              <Plus className="h-3.5 w-3.5" /> Add widget
            </button>
          </div>

          {widgets.length === 0 ? (
            <button
              type="button"
              onClick={() => setShowCatalog(true)}
              className="w-full rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 p-8 text-center transition hover:border-cyan-400/40 hover:bg-slate-900/50"
            >
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl border border-white/10 bg-white/[0.04]">
                <Plus className="h-5 w-5 text-slate-400" />
              </div>
              <div className="mt-3 text-sm text-slate-300">Add your first widget</div>
              <div className="mt-1 text-xs text-slate-500">
                Pick from the catalog — every widget pulls live data from your connected properties.
              </div>
            </button>
          ) : (
            <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {widgets.map((w) => (
                <li key={w.id}>
                  <WidgetTile
                    widget={w}
                    disabled={pending}
                    onRemove={() => onRemoveWidget(w.id)}
                    onToggle={(next) => onToggleWidget(w.id, next)}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Modals */}
      {pickingFor ? (
        <SitePickerModal
          card={pickingFor}
          siteOptions={siteOptions}
          onClose={() => setPickingFor(null)}
        />
      ) : null}

      {gbpNotice ? <GbpNoticeModal onClose={() => setGbpNotice(false)} /> : null}

      {showCatalog ? (
        <CatalogModal
          disabled={pending}
          onPick={onAddWidget}
          onClose={() => setShowCatalog(false)}
        />
      ) : null}
    </div>
  );
}

/* ─────────── property row ─────────── */

function PropertyRow({ card, onConnect }: { card: ConnectorCard; onConnect: () => void }) {
  const style = ACCENT[card.accent];
  const AccentIcon = style.icon;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
      <div className="flex min-w-0 items-center gap-3">
        <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-white/10 ${style.tint}`}>
          <AccentIcon className={`h-5 w-5 ${style.text}`} />
        </div>
        <span className="text-base font-medium text-white">{card.title}</span>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {card.connected ? (
          <>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Connected
            </span>
            <Link
              href={card.href}
              className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-900/60 px-2.5 py-1 text-xs text-slate-200 hover:bg-slate-800"
            >
              Open <ChevronRight className="h-3 w-3" />
            </Link>
          </>
        ) : (
          <button
            type="button"
            onClick={onConnect}
            className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/15 px-3 py-1 text-xs font-medium text-amber-300 hover:bg-amber-500/25"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            Not connected
          </button>
        )}
      </div>
    </div>
  );
}

/* ─────────── widget tile ─────────── */

function WidgetTile({
  widget,
  disabled,
  onRemove,
  onToggle,
}: {
  widget: WidgetInstance;
  disabled: boolean;
  onRemove: () => void;
  onToggle: (next: boolean) => void;
}) {
  const style = WIDGET_ACCENT[widget.accent];
  const Icon = WIDGET_ICONS[widget.icon] ?? Zap;
  const muted = !widget.enabled;

  return (
    <article
      className={`relative overflow-hidden rounded-2xl border border-slate-800 p-5 transition ${
        muted ? "bg-slate-900/20 opacity-60" : "bg-slate-900/40 hover:border-cyan-500/40"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${style.tint}`}>
            <Icon className={`h-4 w-4 ${style.text}`} />
          </div>
          <div className="text-sm font-medium text-white">{widget.label}</div>
        </div>
        <div className="flex items-center gap-1">
          <ToggleSwitch enabled={widget.enabled} disabled={disabled} onChange={onToggle} ariaLabel="Toggle widget" />
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled}
            title="Remove widget"
            aria-label="Remove widget"
            className="rounded-md border border-rose-500/30 bg-rose-500/5 p-1.5 text-rose-300 hover:bg-rose-500/15 disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="mt-5">
        <WidgetBody data={widget.data} stroke={style.stroke} />
      </div>
    </article>
  );
}

function WidgetBody({ data, stroke }: { data: WidgetData; stroke: string }) {
  if (data.type === "empty") {
    return <p className="text-xs text-slate-500">{data.message}</p>;
  }
  if (data.type === "kpi") {
    const positive = data.delta > 0;
    return (
      <>
        <div className="text-3xl font-light tabular-nums text-white">{data.value}</div>
        <div className="mt-1 text-xs text-slate-500">{data.sub}</div>
        <div className={`mt-2 text-xs ${positive ? "text-emerald-400" : data.delta === 0 ? "text-slate-500" : "text-red-400"}`}>
          {data.delta > 0 ? "▲" : data.delta < 0 ? "▼" : "•"} {Math.abs(data.delta)}%
        </div>
      </>
    );
  }
  if (data.type === "list") {
    return (
      <ul className="space-y-2">
        {data.rows.map((row, i) => (
          <li key={`${row.primary}-${i}`} className="border-t border-slate-800/70 pt-2 first:border-t-0 first:pt-0">
            <div className="truncate text-sm text-slate-200">{row.primary}</div>
            <div className="mt-0.5 text-xs text-slate-500">{row.secondary}</div>
          </li>
        ))}
      </ul>
    );
  }
  // sparkline
  return <Sparkline points={data.points} label={data.label} latest={data.latest} stroke={stroke} />;
}

function Sparkline({ points, label, latest, stroke }: { points: number[]; label: string; latest: string; stroke: string }) {
  const spark = useMemo(() => buildSpark(points), [points]);
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-widest text-slate-500">
        <span>{label}</span>
        <span>latest {latest}</span>
      </div>
      <svg viewBox="0 0 220 60" className="h-14 w-full">
        <path d={spark.line} fill="none" stroke={stroke} strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
    </div>
  );
}

function buildSpark(values: number[]): { line: string } {
  const w = 220, h = 60, pad = 4;
  if (values.length === 0) return { line: "" };
  const max = Math.max(1, ...values);
  const step = (w - pad * 2) / Math.max(1, values.length - 1);
  const line = values
    .map((v, i) => `${i === 0 ? "M" : "L"}${(pad + i * step).toFixed(1)},${(h - pad - (v / max) * (h - pad * 2)).toFixed(1)}`)
    .join(" ");
  return { line };
}

/* ─────────── modals ─────────── */

function Modal({ title, children, onClose, wide }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" onClick={onClose}>
      <div className={`w-full ${wide ? "max-w-3xl" : "max-w-lg"} rounded-xl border border-slate-800 bg-slate-950 p-5 shadow-2xl`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-white" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

function SitePickerModal({
  card,
  siteOptions,
  onClose,
}: {
  card: ConnectorCard;
  siteOptions: AnalyticsHubProps["siteOptions"];
  onClose: () => void;
}) {
  if (siteOptions.length === 0) {
    return (
      <Modal title={`Connect ${card.title}`} onClose={onClose}>
        <p className="text-sm text-slate-400">
          No sites in the network yet. Add a site at{" "}
          <Link href="/admin/sites/connect" className="text-cyan-300 hover:underline">/admin/sites/connect</Link>{" "}
          first, then come back here to connect Google.
        </p>
      </Modal>
    );
  }

  return (
    <Modal title={`Connect ${card.title}`} onClose={onClose} wide>
      <p className="text-xs text-slate-400">
        Google OAuth is granted per site. Pick which site to authorise — the same OAuth grant covers both Analytics and Search Console for that site.
      </p>
      <ul className="mt-4 max-h-[420px] space-y-1.5 overflow-y-auto pr-1">
        {siteOptions.map((s) => (
          <li key={s.slug} className="flex items-center justify-between gap-2 rounded-md border border-slate-800 bg-slate-900/40 px-3 py-2 text-sm">
            <div className="min-w-0">
              <div className="truncate font-medium text-slate-200">{s.name}</div>
              <div className="mt-0.5 font-mono text-[10px] text-slate-500">{s.slug}</div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {s.connected ? (
                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-300">
                  Connected
                </span>
              ) : null}
              <a
                href={`/api/integrations/google/start?site=${encodeURIComponent(s.slug)}`}
                className="inline-flex items-center gap-1 rounded-md border border-cyan-400/40 bg-cyan-500/20 px-2.5 py-1 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/30"
              >
                {s.connected ? "Reconnect" : "Connect"} <ChevronRight className="h-3 w-3" />
              </a>
            </div>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

function GbpNoticeModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Google Business Profile" onClose={onClose}>
      <p className="text-sm text-slate-400">
        GBP connection is not implemented yet — the Google Business Profile Performance API requires a separate OAuth grant and endpoint that
        the platform doesn&apos;t wire up in this build.
      </p>
      <p className="mt-3 text-sm text-slate-400">
        You can still track GBP outcomes today via the <strong className="text-slate-200">Alert Manager</strong> (calls/reviews/photo events are
        surfaced there), and manually paste GBP snapshots into <code className="font-mono text-xs">traffic_snapshots</code> if needed.
      </p>
      <div className="mt-5 flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
        >
          Got it
        </button>
      </div>
    </Modal>
  );
}

function CatalogModal({
  disabled,
  onPick,
  onClose,
}: {
  disabled: boolean;
  onPick: (kind: WidgetKind) => void;
  onClose: () => void;
}) {
  return (
    <Modal title="Add a widget" onClose={onClose} wide>
      <p className="text-xs text-slate-400">
        Pick one — each widget renders server-side from your connected properties. Empty states show setup guidance if the underlying source isn&apos;t connected yet.
      </p>
      <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {WIDGET_CATALOG.map((w) => {
          const style = WIDGET_ACCENT[w.accent];
          const Icon = WIDGET_ICONS[w.icon] ?? Zap;
          return (
            <li key={w.kind}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onPick(w.kind)}
                className="group flex w-full items-start gap-3 rounded-lg border border-slate-800 bg-slate-900/50 p-3 text-left transition hover:border-cyan-400/40 hover:bg-slate-900 disabled:opacity-50"
              >
                <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-md ${style.tint}`}>
                  <Icon className={`h-4 w-4 ${style.text}`} />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-white">{w.name}</div>
                  <div className="mt-0.5 text-xs text-slate-400">{w.description}</div>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}

/* ─────────── toggle ─────────── */

function ToggleSwitch({
  enabled,
  disabled,
  onChange,
  ariaLabel,
}: {
  enabled: boolean;
  disabled: boolean;
  onChange: (next: boolean) => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!enabled)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition disabled:cursor-not-allowed disabled:opacity-50 ${
        enabled
          ? "border-cyan-400/50 bg-cyan-500/40 shadow-[0_0_10px_rgba(34,211,238,0.35)]"
          : "border-slate-700 bg-slate-800"
      }`}
    >
      <span
        aria-hidden
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition ${enabled ? "translate-x-4" : "translate-x-1"}`}
      />
    </button>
  );
}
