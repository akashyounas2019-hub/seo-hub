/**
 * /admin/cohorts — Operator cohort view.
 *
 * Pick a preset cohort from the sidebar (composite-below-70, no-credentials,
 * no-GBP, etc.) and see the matching site list. Phase 4 ships the read view;
 * bulk-action engine comes in a follow-up (queue fixes / push CSS / trigger
 * audits for the whole cohort at once).
 */
import Link from "next/link";
import { PRESETS, presetByKey } from "@/lib/cohorts/queries";
import { Pill } from "@/components/ui/Row";
import { ensureSchema } from "@/db/client";
import { requireAdmin } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

interface SearchParams { preset?: string; }

const SEV_TONE = {
  info: "neutral",
  warn: "warning",
  error: "danger",
  critical: "danger",
} as const;

export default async function CohortsPage({
  searchParams,
}: { searchParams: Promise<SearchParams> }) {
  await ensureSchema();
  await requireAdmin();
  const params = await searchParams;
  const preset = presetByKey(params.preset);
  const sites = preset ? await preset.load() : [];

  return (
    <div className="mx-auto max-w-[1280px] space-y-6">
      <section className="space-y-3 pt-2">
        <p className="text-xs text-text-faint">Network operations · Cohorts</p>
        <h1 className="text-3xl font-medium tracking-tightish text-text">Site cohorts</h1>
        <p className="max-w-[68ch] text-md text-text-muted">
          Filter the network by a property (composite score, missing credentials, payment integration, open alerts). At
          100 sites this view is how you find the 5 you actually need to touch today.
        </p>
      </section>

      <div className="grid gap-6 md:grid-cols-[220px,1fr]">
        {/* Preset rail */}
        <nav className="space-y-1">
          {PRESETS.map((p) => {
            const active = preset?.key === p.key;
            return (
              <Link
                key={p.key}
                href={`/admin/cohorts?preset=${p.key}`}
                className={`block rounded-md border px-3 py-2 text-xs ${
                  active
                    ? "border-accent bg-accent-tint text-text"
                    : "border-border bg-surface text-text-muted hover:bg-surface-2 hover:text-text"
                }`}
              >
                <div className="font-medium">{p.label}</div>
              </Link>
            );
          })}
        </nav>

        {/* Result panel */}
        <main className="space-y-3">
          {preset ? (
            <>
              <header>
                <h2 className="text-base font-medium text-text">
                  {preset.label} <span className="text-text-faint">· {sites.length} site(s)</span>
                </h2>
                <p className="mt-1 text-xs text-text-muted">{preset.description}</p>
              </header>
              {sites.length === 0 ? (
                <div className="rounded-md border border-border bg-surface p-6 text-center text-md text-text-muted">
                  Nothing matches.
                </div>
              ) : (
                <ul className="space-y-2">
                  {sites.map((s) => (
                    <li key={s.id} className="rounded-lg border border-border bg-surface p-3">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <Link href={`/admin/sites/${s.slug}`} className="text-sm font-medium text-text hover:underline">
                          {s.name}
                        </Link>
                        {s.severity && <Pill tone={SEV_TONE[s.severity]}>{s.severity}</Pill>}
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-2 text-xs text-text-faint">
                        <span className="font-mono">{s.domain}</span>
                        <span className="text-text-muted">{s.reason}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <aside className="rounded-md border border-dashed border-border bg-surface-2 p-3 text-xs text-text-faint">
                Bulk actions for this cohort ship in a follow-up. For now: click into each site for the per-site fix
                queue.
              </aside>
            </>
          ) : (
            <p className="text-text-muted">Pick a cohort on the left.</p>
          )}
        </main>
      </div>
    </div>
  );
}
