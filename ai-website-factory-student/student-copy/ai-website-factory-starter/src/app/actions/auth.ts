"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { deleteSession, SESSION_COOKIE } from "@/lib/auth";

export async function logoutAction() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (token) {
    await deleteSession(token).catch(() => {});
  }
  cookies().delete(SESSION_COOKIE);
  redirect("/login");
}
