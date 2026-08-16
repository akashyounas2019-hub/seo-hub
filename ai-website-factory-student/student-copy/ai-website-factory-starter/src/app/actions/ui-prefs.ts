"use server";

import { revalidatePath } from "next/cache";
import { readSidebar, readTheme, setSidebarCookie, setThemeCookie } from "@/lib/ui-prefs";

export async function toggleThemeAction() {
  const current = readTheme();
  setThemeCookie(current === "dark" ? "light" : "dark");
  revalidatePath("/", "layout");
}

export async function toggleSidebarAction() {
  const current = readSidebar();
  setSidebarCookie(current === "collapsed" ? "expanded" : "collapsed");
  revalidatePath("/", "layout");
}
