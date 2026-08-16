import { cookies } from "next/headers";

/**
 * UI preferences (theme + sidebar collapsed state) live in cookies so the
 * server can render the right state on first paint — no flash of light
 * theme before JS hydrates.
 */

export type Theme = "light" | "dark";
export type SidebarState = "expanded" | "collapsed";

export const THEME_COOKIE = "gyl_theme";
export const SIDEBAR_COOKIE = "gyl_sidebar";

export function readTheme(): Theme {
  const v = cookies().get(THEME_COOKIE)?.value;
  return v === "dark" ? "dark" : "light";
}

export function readSidebar(): SidebarState {
  const v = cookies().get(SIDEBAR_COOKIE)?.value;
  return v === "collapsed" ? "collapsed" : "expanded";
}

export function setThemeCookie(theme: Theme): void {
  cookies().set({
    name: THEME_COOKIE,
    value: theme,
    httpOnly: false, // client toggle reads/writes this — needs to be readable
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1 year
  });
}

export function setSidebarCookie(state: SidebarState): void {
  cookies().set({
    name: SIDEBAR_COOKIE,
    value: state,
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}
