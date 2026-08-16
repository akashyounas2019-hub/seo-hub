/**
 * /admin/cwv — Network Core Web Vitals trend.
 *
 * Latest p75 per site × metric × form factor, plus a 90-day sparkline.
 * Greens/ambers/reds use the standard CWV thresholds:
 *   LCP : ≤ 2500 good, ≤ 4000 needs improvement, > 4000 poor
 *   INP : ≤ 200 good, ≤ 500 needs improvement
 *   CLS : ≤ 0.10 good, ≤ 0.25 needs improvement
 */
import Link from "next/link";
import { gte, sql } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { sites, cwvSnapshots, orgSettings } from "@/db/schema";
import { Pill } from "@/components/ui/Row";
import { PageHeader } from "@/components/ui/PageHeader";
import { TechnicalScoutTabs } from "@/components/ui/TechnicalScoutTabs";
import { requireAdmin } from "@/lib/server-auth";
import { fetchCwvCached, tbtToInpRisk, type CwvSnapshot } from "@/lib/seo-cwv-checker";
import { decrypt } from "@/lib/crypto";

export const dynamic = "force-dynamic";

type InpRisk = "good" | "needs-improvement" | "poor";

/** A single lab probe: the full PSI lab snapshot for one URL, so we can show
 *  LCP / CLS / TBT together (one PSI call) rather than TBT alone. */
type LabProbe = {
  url: string;
  lcpMs: number | null;
  clsRaw: number | null;
  tbtMs: number | null;
  inpRisk: InpRisk | null;
  error?: string;
};

function inpRiskTone(risk: InpRisk): "success" | "warning" | "danger" {
  if (risk === "good") return "success";
  if (risk === "needs-improvement") return "warning";
  return "danger";
}
function inpRiskLabel(risk: InpRisk): string {
  if (risk === "good") return "Good";
  if (risk === "needs-improvement") return "Needs work";
  return "Poor";
}

function lcpTone(ms?: number | null): "success" | "warning" | "danger" | "neutral" {
  if (ms == null) return "neutral";
  if (ms <= 2500) return "success";
  if (ms <= 4000) return "warning";
  return "danger";
}
function inpTone(ms?: number | null): "success" | "warning" | "danger" | "neutral" {
  if (ms == null) return "neutral";
  if (ms <= 200) return "success";
  if (ms <= 500) return "warning";
  return "danger";
}
function clsTone(x1000?: number | null): "success" | "warning" | "danger" | "neutral" {
  if (x1000 == null) return "neutral";
  if (x1000 <= 100) return "success";
  if (x1000 <= 250) return "warning";
  return "danger";
}
function fmtCls(x1000?: number | null): string {
  if (x1000 == null) return "—";
  return (x1000 / 1000).toFixed(2);
}

/** Tiny inline SVG sparkline for one metric, normalised to data range. */
function Sparkline({ values, width = 80, height = 22 }: { values: number[]; width?: number; height?: number }) {
  const clean = values.filter((v) => Number.isFinite(v));
  if (clean.length === 0) return null;
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const range = Math.max(1, max - min);
  const step = clean.length > 1 ? width / (clean.length - 1) : 0;
  const path = clean
    .map((v, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(height - ((v - min) / range) * height).toFixed(1)}`)
    .join(" ");
  return (
    <svg width={width} height={height} className="text-text-muted">
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

/** Lab readout for a site's key pages — LCP / CLS / TBT (INP proxy) together
 *  from a single PSI call. Shown for ALL sites; for no-CrUX sites this is the
 *  only responsiveness signal available. Each metric carries a one-line "what
 *  good looks like" so the number is legible without leaving the page. */
function LabInpReadout({ probes }: { probes?: LabProbe[] }) {
  if (!probes || probes.length === 0) return null;
  return (
    <div className="mt-2.5 rounded-md border border-border bg-surface-2 px-3 py-2 text-xs">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-medium text-text">Lab metrics (PageSpeed · mobile)</span>
        <span className="text-xs text-text-faint">Synthetic lab run — not real-user CrUX field data</span>
      </div>
      {/* What good looks like — the targets every probe row is judged against. */}
      <p className="mt-1 text-xs leading-relaxed text-text-faint">
        Targets: <span className="text-text-muted">LCP ≤ 2.5s</span> · <span className="text-text-muted">CLS ≤ 0.10</span> ·{" "}
        <span className="text-text-muted">TBT ≤ 200ms</span> (INP proxy: ≤200 good, ≤600 needs work, &gt;600 poor)
      </p>
      <div className="mt-1.5 space-y-1.5">
        {probes.map((p) => {
          const measured = p.error == null && (p.tbtMs != null || p.lcpMs != null);
          return (
            <div key={p.url} className="flex items-center justify-between gap-2">
              <span className="truncate font-mono text-xs text-text-muted">{new URL(p.url).pathname}</span>
              {measured ? (
                <span className="flex items-center gap-2.5">
                  <span className="text-xs">
                    <span className="text-text-faint">LCP </span>
                    <span className={labText(lcpTone(p.lcpMs))}>{p.lcpMs != null ? `${(p.lcpMs / 1000).toFixed(2)}s` : "—"}</span>
                  </span>
                  <span className="text-xs">
                    <span className="text-text-faint">CLS </span>
                    <span className={labText(clsTone(p.clsRaw != null ? p.clsRaw * 1000 : null))}>
                      {p.clsRaw != null ? p.clsRaw.toFixed(2) : "—"}
                    </span>
                  </span>
                  <span className="text-xs">
                    <span className="text-text-faint">TBT </span>
                    <span className="text-text-muted">{p.tbtMs != null ? `${p.tbtMs.toFixed(0)}ms` : "—"}</span>
                  </span>
                  {p.inpRisk ? <Pill tone={inpRiskTone(p.inpRisk)}>{inpRiskLabel(p.inpRisk)}</Pill> : null}
                </span>
              ) : (
                // PSI rate-limited / returned nothing — "couldn't measure", NOT
                // a quality verdict. Neutral pill only.
                <Pill tone="neutral">no data</Pill>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Map a tone to its text color class (for inline lab numbers). */
function labText(tone: "success" | "warning" | "danger" | "neutral"): string {
  if (tone === "success") return "text-success";
  if (tone === "warning") return "text-warning";
  if (tone === "danger") return "text-danger";
  return "text-text-muted";
}

export default async function CwvPage() {
  await ensureSchema();
  await requireAdmin();

  const all = await db().select({ id: sites.id, slug: sites.slug, name: sites.name, domain: sites.domain }).from(sites);

  // Pull last 90 days of CWV for all sites (cap row count so this scales).
  const since = new Date(Date.now() - 90 * 24 * 3600_000).toISOString().slice(0, 10);
  const rows = await db()
    .select({
      siteId: cwvSnapshots.siteId,
      snapshotDate: cwvSnapshots.snapshotDate,
      formFactor: cwvSnapshots.formFactor,
      lcpP75: cwvSnapshots.lcpP75,
      inpP75: cwvSnapshots.inpP75,
      clsP75x1000: cwvSnapshots.clsP75x1000,
    })
    .from(cwvSnapshots)
    .where(gte(cwvSnapshots.snapshotDate, since))
    .orderBy(cwvSnapshots.snapshotDate);

  // ─── Lab INP proxy (TBT) for home + /reservation/ per site ───────────
  // CrUX has no field INP for low-traffic local sites, so we run a PSI lab
  // check and map Total Blocking Time → INP risk. Sequential + best-effort:
  // PSI is rate-limited and a failure must never break the trend page.
  const labInp = new Map<string, LabProbe[]>();
  const [orgRow] = await db().select({ pagespeedApiKeyCiphertext: orgSettings.pagespeedApiKeyCiphertext, googleCruxApiKeyCiphertext: orgSettings.googleCruxApiKeyCiphertext }).from(orgSettings).where(sql`${orgSettings.id} = 'singleton'`).limit(1);
  const psiKey = orgRow?.pagespeedApiKeyCiphertext
    ? decrypt(orgRow.pagespeedApiKeyCiphertext)
    : process.env.PSI_API_KEY || process.env.PAGESPEED_API_KEY || undefined;
  const cruxConfigured = !!orgRow?.googleCruxApiKeyCiphertext || !!process.env.GOOGLE_CRUX_API_KEY;
  const toProbe = (snap: CwvSnapshot): LabProbe => {
    const tbt = snap.lab.tbt;
    return {
      url: snap.url,
      lcpMs: snap.lab.lcp,
      clsRaw: snap.lab.cls,
      tbtMs: tbt,
      // INP risk only when we actually measured TBT; otherwise leave null so we
      // don't render a verdict we can't back up.
      inpRisk: snap.error == null && tbt != null ? tbtToInpRisk(tbt).inpRisk : null,
      error: snap.error,
    };
  };
  for (const site of all) {
    const targets = [`https://${site.domain}/`, `https://${site.domain}/reservation/`];
    const results: LabProbe[] = [];
    for (const target of targets) {
      try {
        results.push(toProbe(await fetchCwvCached(target, "mobile", psiKey)));
      } catch {
        // best-effort — skip this page's lab probe on any error
      }
    }
    if (results.length) labInp.set(site.id, results);
  }

  // Index by site → formFactor → metric.
  type Series = { dates: string[]; lcp: number[]; inp: number[]; cls: number[] };
  const byKey = new Map<string, Series>();
  for (const r of rows) {
    const key = `${r.siteId}::${r.formFactor}`;
    let s = byKey.get(key);
    if (!s) { s = { dates: [], lcp: [], inp: [], cls: [] }; byKey.set(key, s); }
    s.dates.push(r.snapshotDate);
    if (r.lcpP75 != null) s.lcp.push(r.lcpP75);
    if (r.inpP75 != null) s.inp.push(r.inpP75);
    if (r.clsP75x1000 != null) s.cls.push(r.clsP75x1000);
  }

  return (
    <div className="mx-auto max-w-[1280px] space-y-6">
      <PageHeader
        title="Core Web Vitals trend"
        subtitle="Latest p75 from the Chrome UX Report (real-user field data), with a 90-day sparkline per metric."
      />

      <TechnicalScoutTabs />

      {!cruxConfigured && (
        <details className="rounded-lg border border-warning/25 bg-warning-tint px-4 py-3 text-xs text-warning">
          <summary className="cursor-pointer font-medium">
            No CrUX API key configured — only lab data is shown below. Click for setup instructions.
          </summary>
          <div className="mt-2 space-y-2 text-text-muted">
            <p>
              Real-user field Core Web Vitals (the numbers Google actually ranks on) come from the Chrome UX
              Report API. Without a key, the daily sync job can&apos;t populate field data and this page falls
              back entirely to synthetic PSI lab probes.
            </p>
            <ol className="list-decimal space-y-1 pl-4">
              <li>Open <a href="https://console.cloud.google.com/apis/library/chromeuxreport.googleapis.com" target="_blank" rel="noreferrer" className="text-accent hover:underline">Google Cloud Console → Chrome UX Report API</a> and click Enable (create a project first if needed).</li>
              <li>Go to APIs &amp; Services → Credentials → Create credentials → API key.</li>
              <li>(Recommended) Restrict the key to the Chrome UX Report API.</li>
              <li>Paste it at <Link href="/admin/settings?section=apis" className="text-accent hover:underline">Settings → APIs</Link>, then run the daily sync (<code className="text-text-faint">npm run sync:cwv</code> or the cron).</li>
            </ol>
            <p className="text-text-faint">
              Note: CrUX only has data for origins with enough real-world Chrome traffic — low-traffic local
              sites may still show &quot;no field data&quot; even with a key configured. That&apos;s expected, not a bug.
            </p>
          </div>
        </details>
      )}

      {rows.length === 0 && (
        // CALM informational note — not a warning. CrUX simply has no field data
        // for these low-traffic local sites, which is expected; the Lab INP
        // proxy below is the fallback signal.
        <div className="rounded-md border border-border bg-surface px-4 py-3 text-xs leading-relaxed text-text-muted">
          <span className="font-medium text-text">No CrUX field data yet — that&apos;s expected here.</span>{" "}
          Google&apos;s Chrome UX Report only publishes field Core Web Vitals once a page gets enough real-user
          traffic, and these local-service sites usually sit below that threshold. Until then, the{" "}
          <span className="font-medium text-text">Lab INP (proxy)</span> readout on each site card below is the
          best available responsiveness signal.
        </div>
      )}

      <section className="space-y-3">
        {all.map((site) => {
          const phone = byKey.get(`${site.id}::phone`);
          const desktop = byKey.get(`${site.id}::desktop`);
          if (!phone && !desktop) {
            return (
              <article key={site.id} className="rounded-lg border border-border bg-surface px-4 py-3">
                <header className="flex items-baseline justify-between gap-3">
                  <Link href={`/admin/sites/${site.slug}`} className="text-sm font-medium text-text hover:underline">
                    {site.name}
                  </Link>
                  <span className="text-xs text-text-faint">no CrUX field data</span>
                </header>
                <LabInpReadout probes={labInp.get(site.id)} />
              </article>
            );
          }
          return (
            <article key={site.id} className="rounded-lg border border-border bg-surface px-4 py-3">
              <header className="flex items-baseline justify-between gap-3">
                <Link href={`/admin/sites/${site.slug}`} className="text-sm font-medium text-text hover:underline">
                  {site.name}
                </Link>
                <span className="font-mono text-xs text-text-faint">{site.domain}</span>
              </header>
              <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
                {([
                  ["phone", "Mobile", phone],
                  ["desktop", "Desktop", desktop],
                ] as const).map(([key, label, s]) => {
                  if (!s) return (
                    <div key={key} className="rounded-md border border-border bg-surface-2 px-3 py-2 text-xs text-text-faint">
                      {label}: no CrUX field data
                    </div>
                  );
                  const lcpLast = s.lcp[s.lcp.length - 1];
                  const inpLast = s.inp[s.inp.length - 1];
                  const clsLast = s.cls[s.cls.length - 1];
                  return (
                    <div key={key} className="rounded-md border border-border bg-surface-2 p-3 text-xs">
                      <div className="mb-2 font-medium text-text">{label}</div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <div className="text-xs uppercase tracking-wide text-text-faint">LCP</div>
                          <div className="flex items-baseline gap-1">
                            <Pill tone={lcpTone(lcpLast)}>{lcpLast != null ? `${(lcpLast / 1000).toFixed(2)}s` : "—"}</Pill>
                          </div>
                          <Sparkline values={s.lcp} />
                        </div>
                        <div>
                          <div className="text-xs uppercase tracking-wide text-text-faint">INP</div>
                          <div className="flex items-baseline gap-1">
                            <Pill tone={inpTone(inpLast)}>{inpLast != null ? `${inpLast}ms` : "—"}</Pill>
                          </div>
                          <Sparkline values={s.inp} />
                        </div>
                        <div>
                          <div className="text-xs uppercase tracking-wide text-text-faint">CLS</div>
                          <div className="flex items-baseline gap-1">
                            <Pill tone={clsTone(clsLast)}>{fmtCls(clsLast)}</Pill>
                          </div>
                          <Sparkline values={s.cls} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <LabInpReadout probes={labInp.get(site.id)} />
            </article>
          );
        })}
      </section>
    </div>
  );
}
