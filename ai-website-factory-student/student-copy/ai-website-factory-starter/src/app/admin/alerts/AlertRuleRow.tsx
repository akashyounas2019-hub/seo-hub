"use client";

import { useState } from "react";
import { toggleAlertRuleAction, deleteAlertRuleAction } from "@/app/actions/alert-rules";
import { Pill } from "@/components/ui/Row";
import { AlertRuleForm, type AlertRuleFormValue } from "./AlertRuleForm";
import type { RuleKindDef } from "@/lib/alerts/rule-config";

const SEVERITY_TONE = {
  info: "info",
  warn: "warning",
  error: "danger",
  critical: "danger",
} as const;

export function AlertRuleRow({
  rule,
  kindLabel,
  kinds,
  sites,
  users,
}: {
  rule: AlertRuleFormValue & { id: string };
  kindLabel: string;
  kinds: RuleKindDef[];
  sites: { id: string; name: string }[];
  users: { id: string; email: string; name: string | null }[];
}) {
  const [editing, setEditing] = useState(false);
  const siteName = sites.find((s) => s.id === rule.siteId)?.name ?? "All sites";

  if (editing) {
    return (
      <div className="px-4 py-4">
        <AlertRuleForm kinds={kinds} sites={sites} users={users} value={rule} onDone={() => setEditing(false)} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span
          className="mt-1.5 h-[8px] w-[8px] shrink-0 rounded-full"
          style={{ background: rule.enabled ? "var(--success)" : "var(--text-faint)" }}
        />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-text">{rule.name}</p>
            <Pill tone="neutral">{kindLabel}</Pill>
            {rule.severityOverride ? (
              <Pill tone={SEVERITY_TONE[rule.severityOverride]}>{rule.severityOverride}</Pill>
            ) : null}
            {!rule.enabled ? <Pill tone="neutral">disabled</Pill> : null}
          </div>
          <p className="mt-0.5 text-xs text-text-muted">
            {siteName} · {rule.notifyEmail ? "email" : ""}
            {rule.notifyEmail && rule.notifyInApp ? " + " : ""}
            {rule.notifyInApp ? "in-app" : ""}
            {!rule.notifyEmail && !rule.notifyInApp ? "no notifications" : ""}
            {rule.notifyUserIds.length > 0 ? ` · ${rule.notifyUserIds.length} recipient(s)` : ""}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 pl-5 sm:pl-0">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded-md border border-border px-2 py-1 text-xs text-text-muted hover:border-accent hover:text-text"
        >
          Edit
        </button>
        <form action={toggleAlertRuleAction}>
          <input type="hidden" name="id" value={rule.id} />
          <button type="submit" className="rounded-md border border-border px-2 py-1 text-xs text-text-muted hover:border-accent hover:text-text">
            {rule.enabled ? "Disable" : "Enable"}
          </button>
        </form>
        <form action={deleteAlertRuleAction}>
          <input type="hidden" name="id" value={rule.id} />
          <button type="submit" className="rounded-md border border-border px-2 py-1 text-xs text-danger hover:bg-danger-tint">
            Delete
          </button>
        </form>
      </div>
    </div>
  );
}
