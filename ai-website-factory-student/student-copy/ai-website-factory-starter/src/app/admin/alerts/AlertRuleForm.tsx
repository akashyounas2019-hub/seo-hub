"use client";

import { useState } from "react";
import { createAlertRuleAction, updateAlertRuleAction } from "@/app/actions/alert-rules";
import type { RuleKindDef } from "@/lib/alerts/rule-config";

export interface AlertRuleFormValue {
  id?: string;
  name: string;
  kind: string;
  enabled: boolean;
  siteId: string | null;
  config: Record<string, unknown>;
  severityOverride: "info" | "warn" | "error" | "critical" | null;
  notifyEmail: boolean;
  notifyInApp: boolean;
  notifyUserIds: string[];
}

const EMPTY: AlertRuleFormValue = {
  name: "",
  kind: "",
  enabled: true,
  siteId: null,
  config: {},
  severityOverride: null,
  notifyEmail: false,
  notifyInApp: true,
  notifyUserIds: [],
};

export function AlertRuleForm({
  kinds,
  sites,
  users,
  value,
  onDone,
}: {
  kinds: RuleKindDef[];
  sites: { id: string; name: string }[];
  users: { id: string; email: string; name: string | null }[];
  value?: AlertRuleFormValue;
  onDone?: () => void;
}) {
  const initial = value ?? EMPTY;
  const [kind, setKind] = useState(initial.kind);
  const kindDef = kinds.find((k) => k.kind === kind);
  const action = initial.id ? updateAlertRuleAction : createAlertRuleAction;
  const inputCls =
    "mt-1 w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/20";
  const labelCls = "block text-xs font-medium uppercase tracking-[0.06em] text-text-faint";

  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2" onSubmit={() => onDone?.()}>
      {initial.id ? <input type="hidden" name="id" value={initial.id} /> : null}

      <label className="block">
        <span className={labelCls}>Rule name</span>
        <input name="name" required defaultValue={initial.name} placeholder="e.g. Dubai portfolio — traffic watch" className={inputCls} />
      </label>

      <label className="block">
        <span className={labelCls}>Check kind</span>
        <select name="kind" required value={kind} onChange={(e) => setKind(e.target.value)} className={inputCls}>
          <option value="" disabled>
            Select a check…
          </option>
          {kinds.map((k) => (
            <option key={k.kind} value={k.kind}>
              {k.label}
            </option>
          ))}
        </select>
        {kindDef ? <p className="mt-1 text-[11px] text-text-faint">{kindDef.description}</p> : null}
      </label>

      <label className="block">
        <span className={labelCls}>Site scope</span>
        <select name="siteId" defaultValue={initial.siteId ?? ""} className={inputCls}>
          <option value="">All sites (network-wide)</option>
          {sites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className={labelCls}>Severity override</span>
        <select name="severityOverride" defaultValue={initial.severityOverride ?? ""} className={inputCls}>
          <option value="">Use check&apos;s default severity</option>
          <option value="info">Info</option>
          <option value="warn">Warning</option>
          <option value="error">Error</option>
          <option value="critical">Critical</option>
        </select>
      </label>

      {kindDef && kindDef.fields.length > 0 ? (
        <div className="grid gap-3 sm:col-span-2 sm:grid-cols-3">
          {kindDef.fields.map((f) => (
            <label key={f.key} className="block">
              <span className={labelCls}>{f.label}</span>
              <input
                name={`field_${f.key}`}
                type={f.type === "number" ? "number" : "text"}
                min={f.min}
                max={f.max}
                defaultValue={String((initial.config[f.key] as string | number | undefined) ?? f.defaultValue)}
                className={inputCls}
              />
              {f.hint ? <p className="mt-1 text-[11px] text-text-faint">{f.hint}</p> : null}
            </label>
          ))}
        </div>
      ) : null}

      <div className="flex items-center gap-4 sm:col-span-2">
        <label className="flex items-center gap-1.5 text-xs text-text-muted">
          <input type="checkbox" name="enabled" defaultChecked={initial.enabled} className="h-3.5 w-3.5 rounded border-border" />
          Enabled
        </label>
        <label className="flex items-center gap-1.5 text-xs text-text-muted">
          <input type="checkbox" name="notifyInApp" defaultChecked={initial.notifyInApp} className="h-3.5 w-3.5 rounded border-border" />
          Notify in-app
        </label>
        <label className="flex items-center gap-1.5 text-xs text-text-muted">
          <input type="checkbox" name="notifyEmail" defaultChecked={initial.notifyEmail} className="h-3.5 w-3.5 rounded border-border" />
          Notify by email
        </label>
      </div>

      <label className="block sm:col-span-2">
        <span className={labelCls}>Recipients <span className="lowercase tracking-normal text-text-faint">(ctrl/cmd-click to multi-select; only used if a notify option above is checked)</span></span>
        <select name="notifyUserIds" multiple defaultValue={initial.notifyUserIds} className={inputCls + " h-24"}>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name ? `${u.name} (${u.email})` : u.email}
            </option>
          ))}
        </select>
      </label>

      <div className="flex items-center gap-2 sm:col-span-2">
        <button type="submit" className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-brand-navy-deep shadow-sm hover:bg-accent-hover focus-visible:shadow-glow">
          {initial.id ? "Save changes" : "+ Create alert rule"}
        </button>
        {onDone ? (
          <button type="button" onClick={onDone} className="rounded-md border border-border px-3 py-1.5 text-xs text-text-muted hover:text-text">
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}
