/**
 * P3 — Per-site screenshot history.
 *
 * Shows the timeline of captures for one site — desktop + mobile side by
 * side, newest first. Useful for "did the design drift?" introspection.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { siteScreenshots, sites } from "@/db/schema";
import { Pill } from "@/components/ui/Row";
import { SiteTabs } from "../SiteTabs";
import { requireAdmin } from "@/lib/server-auth";
import { formatRelative } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function SiteScreenshotsPage({ params }: { params: { slug: string } }) {
  await ensureSchema();
  await requireAdmin();
  const [site] = await db().select().from(sites).where(eq(sites.slug, params.slug)).limit(1);
  if (!site) notFound();

  const shots = await db()
    .select()
    .from(siteScreenshots)
    .where(eq(siteScreenshots.siteId, site.id))
    .orderBy(desc(siteScreenshots.capturedAt))
    .limit(60);

  // Pair desktop+mobile if captured close together
  const byDate = new Map<string, { desktop?: typeof shots[number]; mobile?: typeof shots[number] }>();
  for (const s of shots) {
    const key = s.capturedAt.toISOString().slice(0, 13); // group by hour
    if (!byDate.has(key)) byDate.set(key, {});
    const slot = byDate.get(key)!;
    if (s.viewport === "mobile") slot.mobile = s;
    else slot.desktop = s;
  }

  return (
    <div className="space-y-6">
      <header className="brand-rule">
        <Link href={`/admin/sites/${site.slug}`} className="text-xs text-text-faint hover:text-text">
          ← {site.name}
        </Link>
        <h1 className="">Screenshot history</h1>
        <p className="mt-1.5 text-xs text-text-muted">
          Nightly captures · desktop + mobile · {shots.length} stored
        </p>
      </header>
      <SiteTabs slug={params.slug} />

      {shots.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-6 text-xs text-text-muted">
          <p className="font-medium text-text">No screenshots captured yet.</p>
          <p className="mt-1">
            Run capture on the VPS: <code className="font-mono">npm run screenshots:capture -- --site={site.slug}</code>
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {Array.from(byDate.entries()).map(([hour, pair]) => (
            <section key={hour} className="rounded-xl border border-border bg-surface p-4">
              <div className="mb-3 flex items-baseline justify-between">
                <h3 className="text-sm font-medium text-text">{formatRelative(new Date(hour + ":00:00.000Z"))}</h3>
                <span className="text-xs text-text-faint">{hour}:00 UTC</span>
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                {pair.desktop ? <ShotCard s={pair.desktop} /> : <PlaceholderCard label="Desktop" />}
                {pair.mobile ? <ShotCard s={pair.mobile} /> : <PlaceholderCard label="Mobile" />}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function ShotCard({ s }: { s: typeof siteScreenshots.$inferSelect }) {
  const statusTone = s.status === "major_change" ? "danger" : s.status === "changed" ? "warning" : "neutral";
  return (
    <div className="overflow-hidden rounded-md border border-border">
      <a href={`/api/screenshots/${s.id}`} target="_blank" rel="noopener noreferrer" className="block aspect-video bg-surface-soft">
        <img src={`/api/screenshots/${s.id}`} alt={`${s.viewport}`} className="h-full w-full object-cover object-top" loading="lazy" />
      </a>
      <div className="flex items-center justify-between p-2">
        <span className="text-xs text-text-muted">
          {s.viewport} · {s.width}×{s.height}
          {s.diffPct !== null ? <> · diff <strong className="tnum">{s.diffPct}%</strong></> : null}
        </span>
        <Pill tone={statusTone}>{s.status.replace("_", " ")}</Pill>
      </div>
    </div>
  );
}

function PlaceholderCard({ label }: { label: string }) {
  return (
    <div className="grid aspect-video place-items-center rounded-md border border-dashed border-border text-xs text-text-faint">
      No {label.toLowerCase()} capture
    </div>
  );
}
