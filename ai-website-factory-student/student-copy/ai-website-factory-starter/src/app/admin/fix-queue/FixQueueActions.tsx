"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  approveFixProposal,
  rejectFixProposal,
  approveBulk,
  toggleAutoApproveRule,
} from "@/app/actions/fix-queue";

interface Props {
  proposalId?: string;
  fixKind?: string;
  bulkCount?: number;
  autoEnabled?: boolean;
}

export function FixQueueActions({ proposalId, fixKind, bulkCount, autoEnabled }: Props) {
  const [pending, start] = useTransition();
  const router = useRouter();

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    start(async () => {
      const r = await fn();
      if (!r.ok) alert(r.error ?? "failed");
      else router.refresh();
    });
  };

  if (proposalId) {
    return (
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => run(() => approveFixProposal(proposalId))}
          disabled={pending}
          className="inline-flex h-7 items-center rounded border border-success/40 bg-success-tint px-2.5 text-xs font-medium text-success transition hover:bg-success/15 disabled:opacity-50"
        >
          Approve
        </button>
        <button
          type="button"
          onClick={() => run(() => rejectFixProposal(proposalId))}
          disabled={pending}
          className="inline-flex h-7 items-center rounded border border-border bg-surface px-2.5 text-xs font-medium text-text-muted hover:bg-surface-elevated disabled:opacity-50"
        >
          Reject
        </button>
      </div>
    );
  }

  if (fixKind && typeof bulkCount === "number") {
    return (
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => {
            if (!confirm(`Approve all ${bulkCount} pending ${fixKind} fixes?`)) return;
            run(async () => {
              const r = await approveBulk({ fixKind });
              return { ok: r.ok };
            });
          }}
          disabled={pending}
          className="inline-flex h-7 items-center rounded border border-accent bg-accent px-2.5 text-xs font-medium text-accent-fg hover:bg-accent-hover disabled:opacity-50"
        >
          Approve all {bulkCount}
        </button>
        <button
          type="button"
          onClick={() => run(async () => {
            const r = await toggleAutoApproveRule({ fixKind, enabled: !autoEnabled });
            return { ok: r.ok };
          })}
          disabled={pending}
          className="inline-flex h-7 items-center rounded border border-border bg-surface px-2.5 text-xs font-medium text-text-muted hover:bg-surface-elevated disabled:opacity-50"
        >
          {autoEnabled ? "Disable auto" : "Auto-approve future"}
        </button>
      </div>
    );
  }
  return null;
}
