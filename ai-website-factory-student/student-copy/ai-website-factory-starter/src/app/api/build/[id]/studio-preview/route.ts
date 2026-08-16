/**
 * POST /api/build/[id]/studio-preview
 *
 * Renders a FULL page document (string) for the Site Builder Studio live
 * preview iframe. The client POSTs the page id + the current (possibly
 * unsaved) section layout + the device; we map the project/page through
 * studio-context and hand it to the renderer.
 *
 * Auth: admin-only. Returns JSON `{ ok:false }` with a 4xx on missing /
 * forbidden so the client can surface a clean error (no redirect — this is an
 * API route, not a page).
 */
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { siteBuildPages, siteBuildProjects } from "@/db/schema";
import { getCurrentUser } from "@/lib/server-auth";
import {
  buildRenderPage,
  buildStudioBusiness,
  resolvePalette,
} from "@/lib/studio-context";
import { resolveSections } from "@/lib/page-section-specs";
import { renderStudioPage } from "@/lib/site-renderer";

export const dynamic = "force-dynamic";

type IncomingSection = {
  type: string;
  enabled: boolean;
  variantSelectionId: string | null;
  order: number;
};

type Body = {
  pageId?: string;
  sections?: IncomingSection[];
  device?: "desktop" | "mobile";
};

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  await ensureSchema();

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "bad-json" }, { status: 400 });
  }

  const pageId = typeof body.pageId === "string" ? body.pageId : "";
  if (!pageId) return NextResponse.json({ ok: false, error: "missing-page-id" }, { status: 400 });

  const [project] = await db()
    .select()
    .from(siteBuildProjects)
    .where(eq(siteBuildProjects.id, params.id))
    .limit(1);
  if (!project) return NextResponse.json({ ok: false, error: "project-not-found" }, { status: 404 });

  const [page] = await db()
    .select()
    .from(siteBuildPages)
    .where(eq(siteBuildPages.id, pageId))
    .limit(1);
  if (!page || page.projectId !== project.id) {
    return NextResponse.json({ ok: false, error: "page-not-found" }, { status: 404 });
  }

  const business = buildStudioBusiness(project, await projectPages(project.id));
  const palette = resolvePalette(project);
  const renderPage = buildRenderPage(page);
  const device: "desktop" | "mobile" = body.device === "mobile" ? "mobile" : "desktop";

  // Compute the ENABLED, ordered section TYPE list. Prefer the layout the
  // client sent (unsaved edits show immediately); fall back to whatever is
  // stored on the page, normalized against the canonical spec.
  let sectionTypes: string[];
  if (Array.isArray(body.sections) && body.sections.length > 0) {
    sectionTypes = body.sections
      .filter((s) => s && s.enabled)
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((s) => s.type);
  } else {
    sectionTypes = resolveSections(page.pageType, page.sections)
      .filter((s) => s.enabled)
      .sort((a, b) => a.order - b.order)
      .map((s) => s.type);
  }

  const html = renderStudioPage({
    business,
    palette,
    page: renderPage,
    sections: sectionTypes,
    device,
  });

  return NextResponse.json({ html });
}

/** Load all pages of a project (used to derive the business's service-areas). */
async function projectPages(projectId: string) {
  return db()
    .select()
    .from(siteBuildPages)
    .where(eq(siteBuildPages.projectId, projectId))
    .orderBy(siteBuildPages.sortOrder);
}
