import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { siteUsers, type User } from "@/db/schema";

/**
 * Visibility model:
 * - admin   → can see every site in the system
 * - manager → can see sites they are explicitly assigned to via site_users
 * - student → can see sites they are explicitly assigned to via site_users
 *
 * The difference between manager and student is *what they can do* on a site
 * (assign tasks, etc.) — not which sites they can see. That distinction lands
 * in v0.3 when the task-management module ships.
 */
export type Visibility =
  | { kind: "all" }
  | { kind: "scoped"; siteIds: string[] };

export async function getVisibility(user: User): Promise<Visibility> {
  if (user.role === "admin") return { kind: "all" };

  const rows = await db()
    .select({ siteId: siteUsers.siteId })
    .from(siteUsers)
    .where(eq(siteUsers.userId, user.id));

  return { kind: "scoped", siteIds: rows.map((r) => r.siteId) };
}
