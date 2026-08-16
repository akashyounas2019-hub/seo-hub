/**
 * Per-score explainability page. Shows the score's trend over time +
 * the inputs blob ("you scored 73 because X was 90, Y was 50, ...").
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { siteScores, sites } from "@/db/schema";
import { ScoreRing, SCORE_LABELS, SCORE_INVERSE } from "@/components/ui/ScoreRing";
import type { ScoreKey } from "@/lib/scoring";
import { requireAdmin } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

const VALID_KEYS: ScoreKey[] = [
  "site_health",
  "seo",
  "design_freshness",
  "competitor_pressure",
  "content_decay",
  "local_seo_completeness",
];

const DESCRIPTIONS: Record<ScoreKey, string> = {
  site_health: "Uptime, recent critical findings, and fix-success rate over the last 30 days.",
  seo: "Open findings count, applied/pending proposals, and average outcome position from GSC.",
  design_freshness: "Average page age and ratio of pages with design overrides applied.",
  competitor_pressure: "Number of 'adopt' suggestions stacked up from competitor teardowns (higher = more pressure).",
  content_decay: "Stale findings + ratio of pages older than 12 months (higher = more decay).",
  local_seo_completeness: "NAP issues, LocalBusiness schema presence, and MTD revenue as conversion proxy.",
};

export default async function ScoreDetailPage({
  params,
}: {
  params: { slug: string; key: string };
}) {
  await ensureSchema();
  await requireAdmin();
  if (!VALID_KEYS.includes(params.key as ScoreKey)) notFound();

  const scoreKey = params.key as ScoreKey;
  const [site] = await db().select().from(sites).where(eq(sites.slug, params.slug)).limit(1);
  if (!site) notFound();

  const history = await db()
    .select({
      value: siteScores.value,
      inputs: siteScores.inputs,
      snapshotDate: siteScores.snapshotDate,
    })
    .from(siteScores)
    .where(and(eq(siteScores.siteId, site.id), eq(siteScores.scoreKey, scoreKey)))
    .orderBy(desc(siteScores.snapshotDate))
    .limit(30);

  const latest = history[0] ?? null;
  const weekAgo = history.find((h) => {
    const d = new Date(h.snapshotDate);
    const today = new Date(history[0]?.snapshotDate ?? new Date().toISOString());
    const diffDays = Math.round((today.getTime() - d.getTime()) / 86400_000);
    return diffDays >= 6 && diffDays <= 8;
  });
  const delta = latest && weekAgo ? latest.value - weekAgo.value : null;

  const inverse = !!SCORE_INVERSE[scoreKey];

  return (
    <div className="space-y-6">
      <header className="brand-rule">
        <Link href={`/admin/sites/${site.slug}`} className="text-xs text-text-faint hover:text-text">
          ← {site.name}
        </Link>
        <h1 className="">
          {SCORE_LABELS[scoreKey]} score
        </h1>
        <p className="mt-1.5 text-xs text-text-muted">{DESCRIPTIONS[scoreKey]}</p>
      </header>

      <section className="rounded-xl border border-border bg-surface p-6">
        {latest ? (
          <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
            <ScoreRing
              label={SCORE_LABELS[scoreKey]}
              value={latest.value}
              delta={delta}
              size="lg"
              inverse={inverse}
            />
            <div className="flex-1 space-y-1.5 text-xs">
              <p className="text-text-muted">
                As of <span className="font-mono text-text">{latest.snapshotDate}</span>
                {weekAgo ? (
                  <>
                    {" "}· 7 days ago: <span className="font-mono text-text">{weekAgo.value}</span>
                    {" "}({delta !== null && delta > 0 ? "+" : ""}{delta})
                  </>
                ) : null}
              </p>
              {inverse ? (
                <p className="text-warning">
                  Inverse score — <strong>lower is better</strong>. High values mean pressure / decay.
                </p>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="text-xs text-text-faint">
            No score data yet for this dimension. Once <code className="font-mono">npm run scoring:compute</code> runs, this page populates.
          </p>
        )}
      </section>

      {latest ? (
        <section className="rounded-xl border border-border bg-surface p-5">
          <h2 className="">Why this score?</h2>
          <p className="mt-0.5 text-xs text-text-faint">
            The raw inputs that produced today&apos;s value. Stored for audit + tunable weights later.
          </p>
          <dl className="mt-3 grid gap-2 sm:grid-cols-2">
            {Object.entries((latest.inputs as Record<string, number>) ?? {}).map(([k, v]) => (
              <div
                key={k}
                className="flex items-baseline justify-between rounded-md border border-border bg-surface-soft px-3 py-2"
              >
                <dt className="text-xs text-text-faint">{prettyInput(k)}</dt>
                <dd className="tnum text-xs font-medium text-text">{formatInputValue(k, v)}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      {history.length > 1 ? (
        <section className="rounded-xl border border-border bg-surface p-5">
          <h2 className="">30-day history</h2>
          <div className="mt-3 grid grid-cols-7 gap-1.5 sm:grid-cols-15">
            {history.slice().reverse().map((h) => (
              <div
                key={h.snapshotDate}
                title={`${h.snapshotDate} — ${h.value}`}
                className="aspect-square rounded"
                style={{
                  backgroundColor:
                    h.value >= 75
                      ? "rgba(56, 161, 105, 0.85)"
                      : h.value >= 50
                        ? "rgba(201, 169, 97, 0.85)"
                        : h.value >= 25
                          ? "rgba(217, 119, 6, 0.85)"
                          : "rgba(220, 38, 38, 0.85)",
                  opacity: inverse ? 1 - h.value / 100 + 0.3 : Math.max(0.3, h.value / 100),
                }}
              />
            ))}
          </div>
          <p className="mt-3 text-xs text-text-faint">
            Each square = one day. Hover for the value. Newest on the right.
          </p>
        </section>
      ) : null}
    </div>
  );
}

function prettyInput(k: string): string {
  return k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
}

function formatInputValue(k: string, v: number): string {
  if (k.toLowerCase().includes("cents")) return `$${(v / 100).toFixed(2)}`;
  if (k.toLowerCase().includes("ratio")) return `${(v * 100).toFixed(0)}%`;
  return String(v);
}
