"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { queueSectionWatch } from "@/app/actions/health-audit";

/**
 * Queues a Section Watch audit — network-wide when no siteId, or a single
 * site when siteId is passed. The Mac worker drains it ($0 vision).
 */
export function RunSectionWatchButton({ siteId }: { siteId?: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const onClick = () =>
    start(async () => {
      const r = await queueSectionWatch({ siteId });
      if (!r.ok) {
        alert(r.error ?? "failed");
        return;
      }
      router.refresh();
    });
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="inline-flex h-9 items-center rounded-md border border-border bg-surface px-4 text-md font-medium text-text shadow-xs transition hover:bg-surface-2 disabled:opacity-50"
    >
      {pending ? "Queueing…" : siteId ? "Run section watch" : "Run section watch (network)"}
    </button>
  );
}
