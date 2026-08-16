"use client";

import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { IconChevronRight, IconCommand, IconSearch } from "./Icon";

type CmdItem = {
  group: "Pages" | "Sites" | "Users" | "Tasks" | "Leads" | "Commands";
  id: string;
  label: string;
  hint?: string;
  href?: string;
  keywords?: string;
};

export function CommandBar({
  initialItems,
}: {
  initialItems: CmdItem[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // ⌘K / Ctrl+K global toggle
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function handleSelect(item: CmdItem) {
    setOpen(false);
    if (item.href) router.push(item.href);
  }

  // Group items for cmdk
  const grouped = initialItems.reduce<Record<string, CmdItem[]>>((acc, item) => {
    if (!acc[item.group]) acc[item.group] = [];
    acc[item.group].push(item);
    return acc;
  }, {});

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex w-full max-w-[420px] items-center gap-2 rounded-md border border-border bg-surface-2 px-3 py-1.5 text-xs text-text-faint transition-colors hover:border-border-strong hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
        aria-label="Open command bar"
      >
        <IconSearch className="text-text-faint" />
        <span className="flex-1 truncate text-left">
          <span className="hidden sm:inline">Search or jump to anywhere — press ⌘K</span>
          <span className="sm:hidden">Search…</span>
        </span>
        {/* ⌘K affordance — always visible (incl. mobile) so the shortcut is
            discoverable everywhere. */}
        <kbd className="inline-flex shrink-0">⌘K</kbd>
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 backdrop-blur-sm pt-[12vh]"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-[640px] overflow-hidden rounded-lg border border-border bg-surface shadow-pop"
            onClick={(e) => e.stopPropagation()}
          >
            <Command label="Command palette" className="flex flex-col">
              <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                <IconSearch className="text-text-faint" />
                <Command.Input
                  autoFocus
                  placeholder="Jump to site, run a command, ask the assistant…"
                  className="w-full bg-transparent text-sm text-text placeholder:text-text-faint outline-none"
                />
                <kbd>esc</kbd>
              </div>
              <Command.List className="max-h-[420px] overflow-y-auto py-1.5">
                <Command.Empty className="px-4 py-8 text-center text-sm text-text-faint">
                  No matches. Try the site slug, lead name, or page title.
                </Command.Empty>

                {(["Pages", "Tasks", "Leads", "Sites", "Users", "Commands"] as const).map((group) =>
                  grouped[group]?.length ? (
                    <Command.Group
                      key={group}
                      heading={group}
                      className="px-1.5 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-text-faint"
                    >
                      {grouped[group].map((item) => (
                        <Command.Item
                          key={`${item.group}:${item.id}`}
                          value={`${item.label} ${item.keywords ?? ""}`}
                          onSelect={() => handleSelect(item)}
                          className="flex h-9 cursor-pointer items-center gap-2 rounded-sm px-2.5 text-sm text-text data-[selected=true]:bg-surface-2"
                        >
                          <IconChevronRight className="text-text-faint" />
                          <span className="flex-1 truncate">{item.label}</span>
                          {item.hint ? (
                            <span className="font-mono text-xs text-text-faint">
                              {item.hint}
                            </span>
                          ) : null}
                        </Command.Item>
                      ))}
                    </Command.Group>
                  ) : null,
                )}
              </Command.List>

              <div className="flex items-center justify-between border-t border-border bg-surface-2 px-3 py-1.5 text-xs text-text-faint">
                <div className="flex items-center gap-1">
                  <IconCommand /> <span>GYL command bar</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <kbd>↑</kbd>
                    <kbd>↓</kbd> navigate
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd>⏎</kbd> open
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd>esc</kbd> close
                  </span>
                </div>
              </div>
            </Command>
          </div>
        </div>
      ) : null}
    </>
  );
}
