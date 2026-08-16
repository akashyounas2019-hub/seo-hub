/**
 * P8 UI — Business context wizard step.
 *
 * Replaces the 15-field "business facts" form with a single textarea +
 * "Extract with AI" button. The operator pastes whatever they have
 * (discovery-call notes, a Google Doc dump, a competitor analysis with
 * margin scribbles) and Haiku 4.5 extracts the structured fields.
 *
 * Two-stage UI:
 *   1. Paste + Extract — runs the server action, shows a preview
 *      side-by-side with the existing facts. Operator can edit anything
 *      they don't like.
 *   2. Save — commits the merged facts to project.business_facts.
 *
 * Why client component: we need useActionState for the preview between
 * the extract pass and the save pass, and a controlled textarea so the
 * operator can edit the preview JSON inline.
 */

"use client";

import { useState, useTransition } from "react";
import {
  extractBusinessContextAction,
  saveBusinessFactsAction,
  type ExtractActionResult,
} from "@/app/actions/business-context";

const INITIAL: ExtractActionResult = { ok: false };

interface Props {
  projectId: string;
  /** Already-saved facts (if any) for context. */
  existing?: Record<string, unknown> | null;
}

export function BusinessContextStep({ projectId, existing }: Props) {
  // React-18 safe: useActionState is a React-19 hook (this project runs React
  // 18.3). Reproduced with the same useState + useTransition pattern already
  // used for the save action below — keeps state / formAction / isExtracting.
  const [state, setState] = useState<ExtractActionResult>(INITIAL);
  const [isExtracting, startExtract] = useTransition();
  function formAction(formData: FormData) {
    startExtract(async () => {
      const result = await extractBusinessContextAction(state, formData);
      setState(result);
    });
  }
  const [editedJson, setEditedJson] = useState<string | null>(null);
  const [isSaving, startSave] = useTransition();
  const [saveError, setSaveError] = useState<string | null>(null);

  const previewJson = editedJson ?? (state.preview ? JSON.stringify(state.preview, null, 2) : "");
  const existingCount = existing ? Object.keys(existing).length : 0;

  function handleSave() {
    setSaveError(null);
    try {
      // Validate JSON before submitting
      JSON.parse(previewJson);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Invalid JSON");
      return;
    }
    const fd = new FormData();
    fd.set("projectId", projectId);
    fd.set("factsJson", previewJson);
    startSave(async () => {
      await saveBusinessFactsAction(fd);
      // The action redirects/revalidates; the next render gets fresh data
      setEditedJson(null);
    });
  }

  return (
    <section className="rounded-xl border border-border bg-surface p-5 space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-md font-medium text-text">Business context</h3>
          <p className="text-xs text-text-muted">
            Paste anything — discovery-call notes, an existing about page, a competitor
            analysis. Haiku 4.5 extracts contact info, services, team, pricing, differentiators.
            Conservative: it omits anything it can&apos;t confirm.
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-semibold tabular-nums text-text">{existingCount}</p>
          <p className="text-xs uppercase tracking-[0.08em] text-text-faint">facts saved</p>
        </div>
      </div>

      <form action={formAction} className="space-y-3">
        <input type="hidden" name="projectId" value={projectId} />
        <textarea
          name="markdown"
          rows={10}
          required
          placeholder={`# Discovery call — 2026-03-15\n\nPhone: (416) 555-0123\nFounded 2014 by Jordan Lee.\nServices: whitening, implants, checkups.\nOnline booking + same-week appointments.\nNew-patient exam from $79.\n…`}
          className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 font-mono text-xs leading-relaxed text-text focus:border-accent focus:outline-none"
        />
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-text-faint">
            {state.ok && state.tokensInput != null
              ? `Last run: ${state.tokensInput.toLocaleString()} in / ${state.tokensOutput?.toLocaleString() ?? "?"} out tokens`
              : "Markdown · up to 200kB · processed with claude-haiku-4-5"}
          </p>
          <button
            type="submit"
            disabled={isExtracting}
            className="h-9 rounded-md bg-accent px-4 text-xs font-medium text-accent-fg shadow-xs transition hover:bg-accent-hover disabled:opacity-50"
          >
            {isExtracting ? "Extracting…" : "Extract with AI →"}
          </button>
        </div>
      </form>

      {state.error ? (
        <div className="rounded-md border border-danger/30 bg-danger-tint px-3 py-2 text-xs text-danger">
          {state.error}
        </div>
      ) : null}

      {state.ok && state.preview ? (
        <div className="space-y-3 rounded-md border border-success/30 bg-success-tint/30 p-4">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-text-muted">
              Preview · review before saving
            </p>
            <span className="text-xs text-text-faint">
              {state.confident?.length ?? 0} confident · {state.uncertain?.length ?? 0} uncertain
            </span>
          </div>

          {state.uncertain && state.uncertain.length > 0 ? (
            <div className="space-y-1 rounded-md border border-warning/30 bg-warning-tint px-3 py-2 text-xs">
              <p className="font-medium uppercase tracking-[0.06em] text-warning">
                The model is unsure about these — verify before saving
              </p>
              <ul className="space-y-0.5 text-text">
                {state.uncertain.map((u) => (
                  <li key={u.field}>
                    <span className="font-mono text-text-muted">{u.field}</span>:{" "}
                    <span className="text-text">{String(u.suspected_value)}</span>{" "}
                    <span className="text-text-faint">— {u.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {state.unmapped && state.unmapped.length > 0 ? (
            <p className="text-xs text-text-muted">
              <span className="font-medium">Unmapped topics from your notes:</span>{" "}
              {state.unmapped.join(", ")}
              <span className="text-text-faint"> — these stay in your notes; the platform doesn&apos;t have a field for them.</span>
            </p>
          ) : null}

          <textarea
            value={previewJson}
            onChange={(e) => setEditedJson(e.target.value)}
            rows={Math.min(20, Math.max(8, previewJson.split("\n").length))}
            spellCheck={false}
            className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 font-mono text-xs leading-snug text-text focus:border-accent focus:outline-none"
          />

          {saveError ? (
            <p className="text-xs text-danger">JSON parse error: {saveError}</p>
          ) : null}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditedJson(state.preview ? JSON.stringify(state.preview, null, 2) : "")}
              className="text-xs text-text-faint hover:text-text"
            >
              Reset edits
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="h-9 rounded-md bg-accent px-4 text-xs font-medium text-accent-fg shadow-xs transition hover:bg-accent-hover disabled:opacity-50"
            >
              {isSaving ? "Saving…" : "Save business facts →"}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
