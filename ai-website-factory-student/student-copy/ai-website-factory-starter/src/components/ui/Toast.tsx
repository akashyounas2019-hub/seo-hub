"use client";

import { useEffect, useState } from "react";

/**
 * Tiny client toast — mounted globally in the admin layout. It listens to
 * `?ok=status_changed&prev=<status>&id=<taskId>` and shows an Undo button that
 * POSTs back to updateTaskStatusAction. Auto-dismisses after 10s.
 *
 * Also listens for a fixed set of integration-settings `?ok=`/`?telegram=`
 * values (saved on /admin/settings?section=integrations) and shows a plain
 * confirmation popup for them — the settings page itself stays put (the
 * server action redirects back with `&section=integrations` preserved) so
 * saving never bounces the admin off the tab they were configuring.
 *
 * Designed to be page-agnostic: the page just redirects with the right params.
 */
const INTEGRATION_TOAST_MESSAGES: Record<string, string> = {
  "integration-saved": "Integration credentials saved.",
  "smtp-saved": "SMTP settings saved.",
  "smtp-test-sent": "Test email sent — check your inbox.",
};
const INTEGRATION_TELEGRAM_MESSAGES: Record<string, string> = {
  connected: "Telegram bot connected.",
  cleared: "Telegram bot disconnected.",
};

export function Toast() {
  const [state, setState] = useState<
    | { kind: "undo-task-status"; taskId: string; prev: string }
    | { kind: "info"; message: string }
    | null
  >(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const ok = sp.get("ok");
    const telegram = sp.get("telegram");
    if (ok === "status_changed") {
      const id = sp.get("id");
      const prev = sp.get("prev");
      if (id && prev) {
        setState({ kind: "undo-task-status", taskId: id, prev });
        setVisible(true);
      }
    } else if (ok && INTEGRATION_TOAST_MESSAGES[ok]) {
      setState({ kind: "info", message: INTEGRATION_TOAST_MESSAGES[ok] });
      setVisible(true);
    } else if (telegram && INTEGRATION_TELEGRAM_MESSAGES[telegram]) {
      setState({ kind: "info", message: INTEGRATION_TELEGRAM_MESSAGES[telegram] });
      setVisible(true);
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    const t = window.setTimeout(() => setVisible(false), 10_000);
    return () => window.clearTimeout(t);
  }, [visible]);

  if (!visible || !state) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex max-w-sm items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 shadow-lg">
      {state.kind === "undo-task-status" ? (
        <>
          <span className="text-sm text-text">Status updated.</span>
          <form
            action={`/admin/tasks/${state.taskId}/undo-status`}
            method="POST"
            className="contents"
          >
            <input type="hidden" name="status" value={state.prev} />
            <button
              type="submit"
              className="rounded-md border border-border bg-surface px-2 py-1 text-xs font-medium text-text hover:bg-surface-2"
            >
              Undo
            </button>
          </form>
          <button
            type="button"
            onClick={() => setVisible(false)}
            className="rounded-sm px-1 text-text-faint hover:text-text"
            aria-label="Dismiss"
          >
            ×
          </button>
        </>
      ) : (
        <>
          <span className="text-sm text-text">{state.message}</span>
          <button
            type="button"
            onClick={() => setVisible(false)}
            className="rounded-sm px-1 text-text-faint hover:text-text"
            aria-label="Dismiss"
          >
            ×
          </button>
        </>
      )}
    </div>
  );
}
