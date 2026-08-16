import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ensureSchema } from "@/db/client";
import type { User } from "@/db/schema";
import { SESSION_COOKIE, getSessionUser } from "./auth";

/**
 * Returns the current user for a server component / server action / route handler,
 * or null if there is no valid session. Always call ensureSchema first since the
 * session lookup goes to the DB.
 */
export async function getCurrentUser(): Promise<User | null> {
  await ensureSchema();
  const cookieStore = cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return getSessionUser(token);
}

/** Redirects to /login if no valid session. */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Redirects to /admin if user is not an admin. */
export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/admin");
  return user;
}

export function sessionCookieOptions(expiresAt: Date) {
  return {
    name: SESSION_COOKIE,
    httpOnly: true as const,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  };
}
