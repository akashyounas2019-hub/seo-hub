import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Shared horizontal tab strip for the Settings group. Rendered identically
 * at the top of /admin/settings, /admin/users, /admin/webhooks,
 * /admin/audit-log, and /admin/notifications so the five pages read as one
 * "Settings" surface even though each keeps its own URL and existing
 * server actions (which redirect back to their own route, unchanged).
 */

export type SettingsTab = "general" | "apis" | "integrations" | "users" | "webhooks" | "audit-log" | "notifications";

const TABS: { id: SettingsTab; label: string; href: string }[] = [
  { id: "general", label: "General", href: "/admin/settings" },
  { id: "apis", label: "APIs", href: "/admin/settings?section=apis" },
  { id: "integrations", label: "Integrations", href: "/admin/settings?section=integrations" },
  { id: "users", label: "Users", href: "/admin/users" },
  { id: "webhooks", label: "Webhooks", href: "/admin/webhooks" },
  { id: "audit-log", label: "Audit log", href: "/admin/audit-log" },
  { id: "notifications", label: "Notifications", href: "/admin/notifications" },
];

/**
 * `isAdmin` defaults to true since General/Users/Webhooks/Audit log all
 * call requireAdmin() and would redirect a non-admin away — only
 * Notifications (open to every role) needs to pass `isAdmin={false}`.
 */
export function SettingsTabs({ active, isAdmin = true }: { active: SettingsTab; isAdmin?: boolean }) {
  const tabs = isAdmin ? TABS : TABS.filter((t) => t.id === "notifications");
  if (tabs.length <= 1) return null;
  return (
    <nav aria-label="Settings sections" className="-mt-1 mb-6 flex flex-wrap gap-1 border-b border-border">
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <Link
            key={tab.id}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "relative px-3.5 py-2.5 text-base font-medium transition-colors",
              isActive ? "text-accent" : "text-text-muted hover:text-text",
            )}
          >
            {tab.label}
            {isActive ? (
              <span aria-hidden className="absolute inset-x-3 -bottom-px h-[2px] rounded-full bg-accent" />
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
