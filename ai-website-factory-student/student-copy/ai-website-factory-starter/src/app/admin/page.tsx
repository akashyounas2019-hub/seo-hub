/**
 * /admin — Home.
 *
 * Admins land on the connected-sites surface (the factory hub).
 * Scoped users land on their personal day view.
 */
import { redirect } from "next/navigation";
import { ensureSchema } from "@/db/client";
import { requireUser } from "@/lib/server-auth";
import { getVisibility } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function AdminHome() {
  await ensureSchema();
  const user = await requireUser();
  const visibility = await getVisibility(user);
  if (visibility.kind === "scoped") {
    redirect("/admin/me");
  }
  redirect("/admin/sites");
}
