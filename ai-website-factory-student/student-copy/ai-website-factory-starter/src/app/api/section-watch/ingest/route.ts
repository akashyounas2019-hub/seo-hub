import { NextRequest, NextResponse } from "next/server";
import { and, eq, like } from "drizzle-orm";
import { ensureSchema, db } from "@/db/client";
import { sites, siteHealthAudits, pageHealthIssues, users } from "@/db/schema";
import { verifyWorkerAuth } from "@/lib/claude-worker-auth";
import {
  REQUIRED_SECTIONS,
  SECTION_LABELS,
  type PageType,
} from "@/lib/section-schema";
import { notify } from "@/lib/notifications";

/**
 * Section Watch ingest ($0 vision path) — worker-auth POST.
 *
 * The Mac worker captures one representative page per page-type, runs Claude
 * Code vision to detect which section TYPES are present on each, and POSTs the
 * present-set here. We compare against the canonical REQUIRED_SECTIONS, fold
 * the missing sections into today's siteHealthAudits row (structure dimension),
 * write one pageHealthIssues row per missing section, and notify admins if any
 * RED (mandatory) section is missing anywhere on the site.
 *
 * Mirrors the auth + worker-driven shape of /api/design-research/ingest-sections.
 *
 * Body: { siteId, pages: [{ url, pageType, present: string[] }] }
 */
export async function POST(req: NextRequest) {
  await ensureSchema();
  const ok = await verifyWorkerAuth(req.headers.get("authorization"));
  if (!ok) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    siteId?: string;
    pages?: Array<{ url?: string; pageType?: string; present?: string[] }>;
  };
  if (!body.siteId || !Array.isArray(body.pages)) {
    return NextResponse.json({ ok: false, error: "missing-site-or-pages" }, { status: 400 });
  }

  const [site] = await db().select().from(sites).where(eq(sites.id, body.siteId)).limit(1);
  if (!site) return NextResponse.json({ ok: false, error: "unknown-site" }, { status: 404 });

  // ── Per-page missing computation ─────────────────────────────────────────
  interface MissingEntry {
    url: string;
    pageType: PageType;
    type: string;
    severity: "red" | "amber";
    present: string[];
  }
  const missing: MissingEntry[] = [];
  // Per-page summary for the audit `raw.sections` blob.
  const sectionsSummary: Array<{ url: string; pageType: string; present: string[]; missing: string[] }> = [];
  let totalMandatory = 0;
  let missingMandatory = 0;

  for (const p of body.pages) {
    const url = String(p.url ?? "");
    const pageType = (String(p.pageType ?? "other") as PageType);
    const present = Array.isArray(p.present) ? p.present.map((s) => String(s)) : [];
    const presentSet = new Set(present);
    const required = REQUIRED_SECTIONS[pageType] ?? REQUIRED_SECTIONS.other;

    const pageMissing: string[] = [];
    for (const req of required) {
      if (req.severity === "red") totalMandatory += 1;
      if (!presentSet.has(req.type)) {
        pageMissing.push(req.type);
        if (req.severity === "red") missingMandatory += 1;
        missing.push({ url, pageType, type: req.type, severity: req.severity, present });
      }
    }
    sectionsSummary.push({ url, pageType, present, missing: pageMissing });
  }

  // structureScore: 100 when nothing mandatory is missing.
  const structureScore =
    totalMandatory === 0 ? 100 : Math.round(100 * (1 - missingMandatory / totalMandatory));

  // ── Upsert today's audit row ─────────────────────────────────────────────
  const runDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
  const sectionsRaw: Record<string, unknown> = {
    sections: {
      runAt: new Date().toISOString(),
      totalMandatory,
      missingMandatory,
      pages: sectionsSummary,
    },
  };

  const [existing] = await db()
    .select()
    .from(siteHealthAudits)
    .where(and(eq(siteHealthAudits.siteId, site.id), eq(siteHealthAudits.runDate, runDate)))
    .limit(1);

  let auditId: string;
  if (existing) {
    // Merge our `sections` block into whatever raw is already there.
    const mergedRaw: Record<string, unknown> = { ...(existing.raw ?? {}), ...sectionsRaw };
    await db()
      .update(siteHealthAudits)
      .set({ status: "ok", structureScore, raw: mergedRaw })
      .where(eq(siteHealthAudits.id, existing.id));
    auditId = existing.id;
  } else {
    const [inserted] = await db()
      .insert(siteHealthAudits)
      .values({
        siteId: site.id,
        runDate,
        status: "ok",
        structureScore,
        raw: sectionsRaw,
      })
      .returning();
    auditId = inserted.id;
  }

  // ── Replace this audit's missing_section issues ──────────────────────────
  await db()
    .delete(pageHealthIssues)
    .where(and(eq(pageHealthIssues.auditId, auditId), like(pageHealthIssues.issueKey, "missing_section:%")));

  if (missing.length > 0) {
    await db().insert(pageHealthIssues).values(
      missing.map((m) => ({
        auditId,
        siteId: site.id,
        pageUrl: m.url,
        pageType: m.pageType,
        dimension: "structure",
        issueKey: `missing_section:${m.type}`,
        severity: m.severity,
        label: `Missing ${SECTION_LABELS[m.type] ?? m.type} section`,
        detail: { required: true, present: m.present } as Record<string, unknown>,
      })),
    );
  }

  // ── Notify admins if any RED section is missing ──────────────────────────
  const reds = missing.filter((m) => m.severity === "red");
  if (reds.length > 0) {
    // Group missing red sections by page type for a readable body.
    const byType = new Map<string, Set<string>>();
    for (const m of reds) {
      const set = byType.get(m.pageType) ?? new Set<string>();
      set.add(SECTION_LABELS[m.type] ?? m.type);
      byType.set(m.pageType, set);
    }
    const bodyLines: string[] = [];
    for (const [pageType, labels] of byType) {
      bodyLines.push(`• ${pageType}: ${Array.from(labels).join(", ")}`);
    }
    const title = `Sections missing on ${site.name}`;
    const bodyText = [
      `${reds.length} required section${reds.length === 1 ? "" : "s"} missing across ${site.name}:`,
      "",
      ...bodyLines,
    ].join("\n");
    const href = `/admin/sites/${site.slug}/health`;

    try {
      const admins = await db().select().from(users).where(eq(users.role, "admin"));
      for (const admin of admins) {
        await notify({ user: admin, kind: "section_watch_missing", title, body: bodyText, href });
      }
    } catch (err) {
      console.warn("[section-watch] notify failed:", err instanceof Error ? err.message : err);
    }
  }

  return NextResponse.json({ ok: true, missing: missing.length });
}
