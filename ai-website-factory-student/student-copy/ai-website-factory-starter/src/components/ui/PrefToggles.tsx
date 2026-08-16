import { toggleSidebarAction, toggleThemeAction } from "@/app/actions/ui-prefs";
import type { SidebarState, Theme } from "@/lib/ui-prefs";
import { IconMoon, IconSidebar, IconSun } from "./Icon";

/**
 * Server components — submitting these forms goes to a server action that
 * flips the cookie + revalidates the layout. Result: the next paint reflects
 * the new state with zero client-side JS.
 */

export function ThemeToggle({ theme }: { theme: Theme }) {
  const isDark = theme === "dark";
  return (
    <form action={toggleThemeAction}>
      <button
        type="submit"
        className="inline-flex h-8 w-8 items-center justify-center rounded-sm text-text-muted hover:bg-surface-2 hover:text-text"
        aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
        title={`Switch to ${isDark ? "light" : "dark"} mode`}
      >
        {isDark ? <IconSun /> : <IconMoon />}
      </button>
    </form>
  );
}

export function SidebarToggle({ state }: { state: SidebarState }) {
  return (
    <form action={toggleSidebarAction}>
      <button
        type="submit"
        className="inline-flex h-8 w-8 items-center justify-center rounded-sm text-text-muted hover:bg-surface-2 hover:text-text"
        aria-label={state === "collapsed" ? "Expand sidebar" : "Collapse sidebar"}
        title={state === "collapsed" ? "Expand sidebar (⌘\\)" : "Collapse sidebar (⌘\\)"}
      >
        <IconSidebar />
      </button>
    </form>
  );
}
