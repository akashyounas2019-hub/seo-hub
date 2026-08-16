"use client";

/**
 * Chat composer + live stream renderer.
 *
 * POSTs the user's message to /api/chat/stream and reads back an
 * application/x-ndjson stream. Each line is one event:
 *   - user_persisted: the user message hit the DB
 *   - iter_start / iter_end: tool-loop iteration boundaries
 *   - tool_start: agent calling a tool (real name + input)
 *   - tool_done: tool returned (real duration + preview)
 *   - text_delta: chunk of assistant text streaming in
 *   - done: final message persisted; refresh to load history
 *   - error: streaming failure
 *
 * We render two surfaces:
 *   1. The input form (Enter submits, auto-grows)
 *   2. A live "Agent activity" panel that appears above the input
 *      while the stream is active, showing each tool call as it
 *      starts + completes + the assistant text typing in real time.
 *
 * When the stream ends with `done`, we router.refresh() so the
 * server-rendered history reloads with the persisted rows. The live
 * panel disappears because the persisted assistant message now
 * appears in the message list above.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type ToolEvent = {
  id: string;
  name: string;
  startedAt: number;
  durationMs?: number;
  preview?: string;
  error?: string;
  status: "running" | "done" | "errored";
};

export function ChatComposer({
  threadId,
  placeholder = "Ask: what builds are in flight? show me the design variants",
}: {
  threadId: string;
  // Old prop kept for back-compat in case the page hasn't redeployed
  action?: (threadId: string, formData: FormData) => Promise<void>;
  placeholder?: string;
}) {
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const liveTextRef = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [liveText, setLiveText] = useState("");
  const [liveTools, setLiveTools] = useState<ToolEvent[]>([]);
  const [iterCount, setIterCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Focus on mount + when threadId changes
  useEffect(() => {
    textareaRef.current?.focus();
  }, [threadId]);

  // Auto-grow up to ~5 lines
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [value]);

  // Auto-scroll the live panel as text streams in
  useEffect(() => {
    liveTextRef.current?.scrollTo({ top: liveTextRef.current.scrollHeight, behavior: "smooth" });
  }, [liveText, liveTools.length]);

  async function send() {
    const trimmed = value.trim();
    if (!trimmed || streaming) return;

    setStreaming(true);
    setLiveText("");
    setLiveTools([]);
    setIterCount(0);
    setError(null);
    setValue("");

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let streamCompleted = false;

    try {
      const res = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ threadId, body: trimmed }),
        signal: ctrl.signal,
      });

      if (!res.ok || !res.body) {
        const errorBody = await res.text().catch(() => "");
        setError(errorBody || `Server returned ${res.status}`);
        setStreaming(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffered = "";

      while (true) {
        const { done, value: chunk } = await reader.read();
        if (done) break;
        buffered += decoder.decode(chunk, { stream: true });
        const lines = buffered.split("\n");
        // Keep the last (possibly partial) line in the buffer
        buffered = lines.pop() ?? "";
        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine) continue;
          try {
            const parsed = JSON.parse(trimmedLine);
            if (parsed.t === "done") streamCompleted = true;
            handleEvent(parsed);
          } catch {
            /* skip unparseable line — usually a partial */
          }
        }
      }

      // Stream finished cleanly. Refresh to hydrate persisted history,
      // then clear the live overlay so the persisted assistant message
      // becomes the single source of truth (otherwise the same content
      // appears twice — once in the message list above and once in the
      // live panel below).
      router.refresh();
      if (streamCompleted) {
        setLiveText("");
        setLiveTools([]);
        setIterCount(0);
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  function handleEvent(ev: Record<string, unknown>) {
    const t = ev.t;
    if (t === "iter_start") {
      setIterCount((n) => n + 1);
      return;
    }
    if (t === "text_delta") {
      setLiveText((prev) => prev + String(ev.delta ?? ""));
      return;
    }
    if (t === "tool_start") {
      const id = String(ev.id ?? "");
      const name = String(ev.name ?? "tool");
      setLiveTools((prev) => [
        ...prev,
        { id, name, startedAt: Date.now(), status: "running" },
      ]);
      return;
    }
    if (t === "tool_done") {
      const id = String(ev.id ?? "");
      const ms = typeof ev.ms === "number" ? ev.ms : null;
      const preview = typeof ev.preview === "string" ? ev.preview : undefined;
      const errMsg = typeof ev.error === "string" && ev.error.length > 0 ? ev.error : undefined;
      setLiveTools((prev) =>
        prev.map((tu) =>
          tu.id === id
            ? {
                ...tu,
                durationMs: ms ?? Date.now() - tu.startedAt,
                preview,
                error: errMsg,
                status: errMsg ? "errored" : "done",
              }
            : tu,
        ),
      );
      return;
    }
    if (t === "done") {
      // Final persistence success — refresh handled in the read loop
      return;
    }
    if (t === "error") {
      setError(String(ev.message ?? "stream-error"));
      return;
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      void send();
    }
  }

  function cancel() {
    abortRef.current?.abort();
  }

  const hasLiveActivity = streaming || liveTools.length > 0 || liveText.length > 0 || error;

  return (
    <>
      {hasLiveActivity ? (
        <div
          className="border-t px-4 py-3 max-h-[40vh] overflow-y-auto"
          style={{
            background: "linear-gradient(180deg, var(--surface), var(--surface-2))",
            borderColor: "var(--border-strong)",
          }}
          ref={liveTextRef}
        >
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              {streaming ? <ThinkingDots /> : null}
              <span className="text-xs uppercase tracking-[0.10em] font-semibold" style={{ color: "var(--accent-hover)" }}>
                {streaming
                  ? `Agent working · iter ${iterCount || 1}`
                  : error
                    ? "Agent failed"
                    : "Agent finished"}
              </span>
            </div>
            {streaming ? (
              <button
                type="button"
                onClick={cancel}
                className="text-xs text-text-faint hover:text-danger"
              >
                Cancel
              </button>
            ) : null}
          </div>

          {liveTools.length > 0 ? (
            <ul className="space-y-1.5 mb-3">
              {liveTools.map((tu, i) => (
                <li
                  key={tu.id}
                  className="flex items-start gap-2.5 rounded-md px-2.5 py-2"
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <ToolStatusDot status={tu.status} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-xs font-medium" style={{ color: "var(--text)" }}>
                        <span className="tabular-nums text-xs text-text-faint mr-2">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        {tu.name}
                      </span>
                      <span className="text-xs tabular-nums" style={{ color: "var(--text-faint)" }}>
                        {tu.status === "running"
                          ? "…"
                          : tu.durationMs !== undefined
                            ? `${tu.durationMs} ms`
                            : ""}
                      </span>
                    </div>
                    {tu.preview ? (
                      <p
                        className="mt-1 line-clamp-2 font-mono text-xs"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {tu.preview}
                      </p>
                    ) : null}
                    {tu.error ? (
                      <p className="mt-1 text-xs" style={{ color: "var(--danger)" }}>
                        {tu.error}
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : null}

          {liveText ? (
            <div
              className="rounded-md px-3 py-2 text-sm whitespace-pre-wrap leading-relaxed"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                color: "var(--text)",
              }}
            >
              {liveText}
              {streaming ? <span className="caret" /> : null}
              <style>{`
                .caret {
                  display: inline-block;
                  width: 2px;
                  height: 1em;
                  background: var(--accent);
                  vertical-align: text-bottom;
                  margin-left: 1px;
                  animation: obsidianCaret 1s steps(2, end) infinite;
                }
                @keyframes obsidianCaret { 0%,50% { opacity: 1; } 51%,100% { opacity: 0; } }
              `}</style>
            </div>
          ) : null}

          {error ? (
            <div
              className="rounded-md px-3 py-2 text-xs"
              style={{
                background: "var(--danger-tint)",
                border: "1px solid rgba(228,102,102,0.18)",
                color: "var(--danger)",
              }}
            >
              {error}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="border-t border-border bg-surface px-3 py-2.5">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            name="body"
            rows={1}
            required
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={streaming}
            className="flex-1 min-h-[40px] max-h-[140px] resize-none rounded-md border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-faint transition-colors hover:border-border-strong focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:opacity-60"
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={value.trim().length === 0 || streaming}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-60"
            style={{
              background: streaming
                ? "var(--surface-2)"
                : "linear-gradient(180deg, var(--accent-hover), var(--accent))",
              color: streaming ? "var(--text-muted)" : "var(--accent-fg)",
              boxShadow: streaming ? "none" : "0 1px 0 rgba(255,255,255,0.18) inset",
              border: streaming ? "1px solid var(--border)" : undefined,
            }}
          >
            {streaming ? (
              <>
                <Spinner />
                Streaming…
              </>
            ) : (
              <>
                Send
                <span className="font-mono text-xs opacity-60">⏎</span>
              </>
            )}
          </button>
        </div>
        <p className="mt-1.5 text-xs text-text-faint">
          <kbd className="font-mono">Enter</kbd> send · <kbd className="font-mono">Shift + Enter</kbd> newline · live agent activity shows above
        </p>
      </div>
    </>
  );
}

function ToolStatusDot({ status }: { status: "running" | "done" | "errored" }) {
  const colorMap = {
    running: "var(--accent)",
    done: "var(--success)",
    errored: "var(--danger)",
  };
  return (
    <span
      className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full"
      style={{
        background: colorMap[status],
        boxShadow: status === "running" ? "0 0 0 0 var(--accent)" : undefined,
        animation: status === "running" ? "obsidianPulse 1.4s ease-out infinite" : undefined,
      }}
    >
      <style>{`
        @keyframes obsidianPulse {
          0%   { box-shadow: 0 0 0 0   var(--accent-ring); }
          70%  { box-shadow: 0 0 0 6px transparent; }
          100% { box-shadow: 0 0 0 0   transparent; }
        }
      `}</style>
    </span>
  );
}

function ThinkingDots() {
  return (
    <span className="inline-flex items-center gap-1" aria-hidden>
      <Dot delay={0} />
      <Dot delay={180} />
      <Dot delay={360} />
      <style>{`
        @keyframes obsidianDotBounce {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </span>
  );
}

function Dot({ delay }: { delay: number }) {
  return (
    <span
      className="inline-block h-1.5 w-1.5 rounded-full"
      style={{
        background: "var(--accent)",
        animation: `obsidianDotBounce 1.2s ease-in-out ${delay}ms infinite`,
      }}
    />
  );
}

function Spinner() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" fill="none" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
        style={{ transformOrigin: "12px 12px", animation: "spin 0.8s linear infinite" }}
      />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </svg>
  );
}
