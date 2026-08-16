import { NextRequest, NextResponse } from "next/server";
import { ensureSchema } from "@/db/client";
import { updateTaskStatusAction } from "@/app/actions/tasks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Tiny POST endpoint for the Toast "Undo" button. Re-invokes the same
 * `updateTaskStatusAction` with `prev` as the new status, then sends the
 * user back to the task detail page.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  await ensureSchema();
  const form = await req.formData();
  const prev = String(form.get("status") ?? "").trim();
  if (!prev) {
    return NextResponse.redirect(new URL(`/admin/tasks/${params.id}?error=undo-empty`, req.url));
  }
  try {
    const fd = new FormData();
    fd.set("status", prev);
    await updateTaskStatusAction(params.id, fd);
  } catch (err) {
    // updateTaskStatusAction redirects via Next, which throws NEXT_REDIRECT — that's expected.
    if (err && typeof err === "object" && "digest" in err && String((err as { digest: string }).digest).startsWith("NEXT_REDIRECT")) {
      throw err;
    }
    return NextResponse.redirect(new URL(`/admin/tasks/${params.id}?error=undo-failed`, req.url));
  }
  // updateTaskStatusAction redirects, but if it didn't (it should), fall back:
  return NextResponse.redirect(new URL(`/admin/tasks/${params.id}?ok=undone`, req.url));
}
