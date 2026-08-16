"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { queueNetworkAudit } from "@/app/actions/health-audit";

export function RunAuditButton({ siteId }: { siteId?: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const onClick = () => start(async () => {
    const r = await queueNetworkAudit({ siteId });
    if (!r.ok) { alert(r.error ?? "failed"); return; }
    router.refresh();
  });
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="inline-flex h-9 items-center rounded-md bg-accent px-4 text-md font-medium text-accent-fg shadow-xs transition hover:bg-accent-hover disabled:opacity-50"
    >
      {pending ? "Queueing…" : siteId ? "Re-audit this site" : "Run network audit"}
    </button>
  );
}
