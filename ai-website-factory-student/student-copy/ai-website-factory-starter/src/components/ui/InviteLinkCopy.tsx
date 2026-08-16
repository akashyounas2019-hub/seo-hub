"use client";

import { useRef, useState } from "react";

/**
 * Pair of: read-only input + copy button. Used to surface freshly generated
 * invite/onboarding links to admins so they can grab the URL without
 * retyping. Client-only because we use `navigator.clipboard`.
 */
export function InviteLinkCopy({ link }: { link: string }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Fallback: select for manual ⌘C.
      inputRef.current?.select();
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        readOnly
        value={link}
        onClick={(e) => (e.currentTarget as HTMLInputElement).select()}
        className="w-full truncate rounded-md border border-border bg-surface px-2.5 py-1.5 font-mono text-xs text-text"
      />
      <button
        type="button"
        onClick={copy}
        className="shrink-0 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-text hover:bg-surface-2"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
