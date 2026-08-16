"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { selectSectionAction } from "@/app/actions/design-research";
import { Slideover } from "@/components/ui/Slideover";
import { PrimaryCta, GhostButton } from "@/components/ui/ObsidianAtoms";
import { cn } from "@/lib/utils";

export interface TargetProjectOption {
  id: string;
  businessName: string;
  city: string | null;
}

/**
 * "Use this section" — opens a Slideover picker to choose a target Build
 * project (or "new project") + a palette toggle, then queues the rebuild via
 * selectSectionAction. On success it shows the generated replication prompt
 * + a "building on Mac worker…" status, and refreshes so the Selected tray
 * picks up the new selection.
 */
export function UseSectionButton({
  sectionId,
  sectionType,
  projects,
}: {
  sectionId: string;
  sectionType: string;
  projects: TargetProjectOption[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [targetProjectId, setTargetProjectId] = useState<string>(""); // "" = new project
  const [useOwnPalette, setUseOwnPalette] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ prompt: string } | null>(null);

  const submit = () => {
    setError(null);
    start(async () => {
      try {
        await selectSectionAction(sectionId, {
          targetProjectId: targetProjectId || undefined,
          useOwnPalette,
        });
        // Prompt mirrors what the action stores on the selection row.
        const project = projects.find((p) => p.id === targetProjectId);
        const target = project ? project.businessName : "the target business";
        setResult({
          prompt: `Replicate the LAYOUT of this ${sectionType} section for ${target}. Fresh copy, no original text/images.`,
        });
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not queue the rebuild.");
      }
    });
  };

  const close = () => {
    setOpen(false);
    // Reset transient result so re-opening starts clean.
    setTimeout(() => setResult(null), 250);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-muted transition hover:border-border-strong hover:text-text"
      >
        Use this section
      </button>

      <Slideover
        open={open}
        onClose={close}
        title="Use this section"
        subtitle={`Rebuild this ${sectionType} layout into a build project`}
      >
        {result ? (
          <div className="space-y-4">
            <div className="rounded-md border border-success/30 bg-success-tint px-3 py-2.5 text-xs text-success">
              Queued — the rebuild is running on the Mac worker (your subscription, no API cost).
            </div>
            <div>
              <span className="text-xs font-semibold uppercase tracking-[0.10em] text-text-faint">
                Generated replication prompt
              </span>
              <p className="mt-1.5 rounded-md border border-border bg-surface-2 px-3 py-2.5 text-xs leading-relaxed text-text">
                {result.prompt}
              </p>
            </div>
            <div className="flex justify-end">
              <GhostButton type="button" onClick={close}>
                Done
              </GhostButton>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <div>
              <span className="text-xs font-semibold uppercase tracking-[0.10em] text-text-faint">
                Target build project
              </span>
              <select
                value={targetProjectId}
                onChange={(e) => setTargetProjectId(e.target.value)}
                className="mt-1.5 w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-text focus-visible:border-border-strong focus-visible:outline-none"
              >
                <option value="">+ New project (decide later)</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.businessName}
                    {p.city ? ` — ${p.city}` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <span className="text-xs font-semibold uppercase tracking-[0.10em] text-text-faint">
                Palette
              </span>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  aria-pressed={useOwnPalette}
                  onClick={() => setUseOwnPalette(true)}
                  className={cn(
                    "rounded-md border px-3 py-2.5 text-left text-xs transition",
                    useOwnPalette
                      ? "border-border-strong bg-accent-tint text-accent"
                      : "border-border bg-surface text-text-muted hover:border-border-strong hover:text-text",
                  )}
                >
                  <span className="block font-medium">Use its own palette</span>
                  <span className="mt-0.5 block text-xs opacity-80">Keep the reference colours</span>
                </button>
                <button
                  type="button"
                  aria-pressed={!useOwnPalette}
                  onClick={() => setUseOwnPalette(false)}
                  className={cn(
                    "rounded-md border px-3 py-2.5 text-left text-xs transition",
                    !useOwnPalette
                      ? "border-border-strong bg-accent-tint text-accent"
                      : "border-border bg-surface text-text-muted hover:border-border-strong hover:text-text",
                  )}
                >
                  <span className="block font-medium">My brand palette</span>
                  <span className="mt-0.5 block text-xs opacity-80">Recolour to the project</span>
                </button>
              </div>
            </div>

            {error ? <p className="text-xs text-danger">{error}</p> : null}

            <div className="flex items-center justify-end gap-2 pt-1">
              <GhostButton type="button" onClick={close} disabled={pending}>
                Cancel
              </GhostButton>
              <PrimaryCta type="button" onClick={submit} disabled={pending}>
                {pending ? "Queuing…" : "Rebuild section"}
              </PrimaryCta>
            </div>
          </div>
        )}
      </Slideover>
    </>
  );
}
