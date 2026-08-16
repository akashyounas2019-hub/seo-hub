import Link from "next/link";
import { asc, desc, eq } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { ChatImage } from "./ChatImage";
import { chatMessages, chatThreads } from "@/db/schema";
import {
  createThreadAction,
  deleteThreadAction,
  getLatestThreadId,
  sendChatMessageAction,
} from "@/app/actions/chat";
import { EmptyState } from "@/components/ui/EmptyState";
import { isLLMConfigured } from "@/lib/llm";
import { requireUser } from "@/lib/server-auth";
import { cn, formatRelative } from "@/lib/utils";
import { ChatComposer } from "./_chat-composer";

export const dynamic = "force-dynamic";

export default async function ChatPage({
  searchParams,
}: {
  searchParams: { thread?: string };
}) {
  await ensureSchema();
  const user = await requireUser();
  const d = db();
  const configured = await isLLMConfigured();

  const threads = await d
    .select({
      id: chatThreads.id,
      title: chatThreads.title,
      lastMessageAt: chatThreads.lastMessageAt,
    })
    .from(chatThreads)
    .where(eq(chatThreads.userId, user.id))
    .orderBy(desc(chatThreads.lastMessageAt))
    .limit(20);

  let activeThreadId = searchParams.thread ?? null;
  if (!activeThreadId) activeThreadId = await getLatestThreadId(user.id);

  let activeMessages: (typeof chatMessagesShape)[] = [];
  if (activeThreadId) {
    activeMessages = await d
      .select({
        id: chatMessages.id,
        role: chatMessages.role,
        body: chatMessages.body,
        toolName: chatMessages.toolName,
        toolInput: chatMessages.toolInput,
        toolOutput: chatMessages.toolOutput,
        inputTokens: chatMessages.inputTokens,
        outputTokens: chatMessages.outputTokens,
        cacheReadTokens: chatMessages.cacheReadTokens,
        createdAt: chatMessages.createdAt,
      })
      .from(chatMessages)
      .where(eq(chatMessages.threadId, activeThreadId))
      .orderBy(asc(chatMessages.createdAt));
  }

  return (
    <div className="grid h-[calc(100vh-7rem)] grid-cols-1 gap-4 md:grid-cols-[260px_1fr]">
      {/* Thread list */}
      <aside className="flex flex-col gap-2 overflow-hidden">
        <form action={createThreadAction}>
          <button
            type="submit"
            disabled={!configured}
            className="w-full rounded-md bg-accent px-3 py-2 text-xs font-medium text-brand-navy-deep shadow-xs transition-opacity hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            + New chat
          </button>
        </form>
        <div className="flex-1 overflow-y-auto rounded-md border border-border bg-surface p-1.5 text-sm">
          {threads.length === 0 ? (
            <p className="px-2 py-3 text-xs text-text-faint">No chats yet.</p>
          ) : (
            <ul className="space-y-0.5">
              {threads.map((t) => {
                const active = t.id === activeThreadId;
                return (
                  <li key={t.id}>
                    <Link
                      href={`/admin/chat?thread=${t.id}`}
                      className={cn(
                        "block rounded-sm px-2 py-1.5 transition-colors",
                        active
                          ? "bg-surface-2 text-text"
                          : "text-text-muted hover:bg-surface-2 hover:text-text",
                      )}
                    >
                      <div className="truncate text-xs font-medium">{t.title}</div>
                      <div className="tnum text-xs text-text-faint">
                        {formatRelative(t.lastMessageAt)}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>

      {/* Conversation */}
      <section className="flex flex-col overflow-hidden rounded-md border border-border bg-surface">
        {!configured ? (
          <div className="m-auto w-full max-w-md p-6">
            <EmptyState
              glyph="chat"
              title="The assistant isn't configured"
              description={
                user.role === "admin" ? (
                  <>
                    Paste your Anthropic API key on the settings page to enable chat, the audit
                    agent, and the daily digest.
                  </>
                ) : (
                  <>Ask the admin to add the Anthropic API key in Settings.</>
                )
              }
              action={user.role === "admin" ? { label: "Open settings", href: "/admin/settings" } : undefined}
              className="border-none p-0"
            />
          </div>
        ) : !activeThreadId ? (
          <div className="m-auto w-full max-w-md p-6">
            <EmptyState
              glyph="chat"
              title="Pick a chat — or start a new one"
              description="Ask about leads, tasks, who's behind on work, which site is winning. The assistant has read-only access to your data."
            />
          </div>
        ) : (
          <>
            <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
              {activeMessages.length === 0 ? (
                <div className="py-12 text-center text-xs text-text-faint">
                  Empty thread — say hello.
                </div>
              ) : (
                activeMessages.map((m) => <Message key={m.id} m={m} />)
              )}
            </div>
            <ChatComposer threadId={activeThreadId} />
            <div className="flex items-center justify-between border-t border-border bg-surface-2 px-3 py-1.5 text-xs text-text-faint">
              <span>
                Powered by Anthropic · read-only · usage billed to your key
              </span>
              <form action={deleteThreadAction.bind(null, activeThreadId)}>
                <button type="submit" className="hover:text-danger">
                  Delete thread
                </button>
              </form>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

const chatMessagesShape = {
  id: "",
  role: "user" as "user" | "assistant" | "system" | "tool",
  body: "",
  toolName: null as string | null,
  toolInput: null as Record<string, unknown> | null,
  toolOutput: null as unknown,
  inputTokens: null as string | null,
  outputTokens: null as string | null,
  cacheReadTokens: null as string | null,
  createdAt: new Date(),
};

function Message({ m }: { m: typeof chatMessagesShape }) {
  if (m.role === "tool") {
    return (
      <details className="rounded-md border border-border bg-surface-2 px-3 py-2 text-xs text-text-muted">
        <summary className="cursor-pointer font-mono text-text-faint">
          ▸ tool · {m.toolName}
        </summary>
        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-sm bg-surface p-2 font-mono text-xs text-text-muted">
{JSON.stringify({ input: m.toolInput, output: m.toolOutput }, null, 2)}
        </pre>
      </details>
    );
  }
  const isUser = m.role === "user";
  return (
    <div className={isUser ? "flex justify-end" : "flex justify-start"}>
      <div
        className={cn(
          "max-w-[85%] rounded-lg px-4 py-2.5 text-sm leading-relaxed",
          isUser ? "bg-accent text-brand-navy-deep" : "border border-border bg-surface-2 text-text",
        )}
      >
        <RichMarkdown body={m.body} />
        {!isUser && (m.inputTokens || m.outputTokens) ? (
          <div className="tnum mt-2 border-t border-border/50 pt-1.5 text-xs text-text-faint">
            in {m.inputTokens ?? 0} · out {m.outputTokens ?? 0}
            {m.cacheReadTokens && m.cacheReadTokens !== "0"
              ? ` · cache hit ${m.cacheReadTokens}`
              : ""}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Tiny safe markdown renderer for chat assistant messages.
 *
 * We deliberately don't pull a heavyweight library. The agent emits a
 * narrow set of Markdown features:
 *   - paragraphs separated by blank lines
 *   - `**bold**` and `*italic*` inline emphasis
 *   - `\`code\`` inline code
 *   - `[text](url)` links → real anchor tags, gold underline
 *   - `![alt](url)` images → real img tags, full width
 *   - bullet lists (`- ` / `* ` / `1. `)
 *   - `#` / `##` / `###` headings
 *   - `---` horizontal rules
 *
 * Everything else degrades to plain text inside a paragraph.
 *
 * Security: we escape every text node before inserting via dangerouslySet,
 * and we only allow https:// + http:// + relative links in href/src.
 */
function RichMarkdown({ body }: { body: string }) {
  return (
    <div className="rich-md space-y-2.5 text-sm leading-relaxed">
      {renderBlocks(body)}
      <style>{`
        .rich-md a { color: var(--accent); text-decoration: underline; text-underline-offset: 2px; }
        .rich-md a:hover { color: var(--accent-hover); }
        .rich-md code { background: var(--surface); border: 1px solid var(--border); border-radius: 3px; padding: 0 4px; font-family: var(--font-mono), ui-monospace, monospace; font-size: 0.92em; }
        .rich-md h1, .rich-md h2, .rich-md h3 { color: var(--text); font-weight: 600; margin-top: 0.4em; letter-spacing: -0.011em; }
        .rich-md h1 { font-size: 18px; }
        .rich-md h2 { font-size: 16px; }
        .rich-md h3 { font-size: 14px; }
        .rich-md ul, .rich-md ol { padding-left: 1.2em; }
        .rich-md ul { list-style: disc outside; }
        .rich-md ol { list-style: decimal outside; }
        .rich-md li { margin: 0.15em 0; }
        .rich-md hr { border: none; border-top: 1px solid var(--border); margin: 0.5em 0; }
        .rich-md img { display: block; max-width: 100%; height: auto; border-radius: 6px; border: 1px solid var(--border); margin: 0.4em 0; }
        .rich-md strong { color: var(--text); font-weight: 600; }
      `}</style>
    </div>
  );
}

/** Split body into block-level elements and render each. */
function renderBlocks(body: string): React.ReactNode {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Horizontal rule
    if (/^---+\s*$/.test(line.trim())) {
      blocks.push(<hr key={key++} />);
      i++;
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{1,3})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2];
      const Tag = (level === 1 ? "h1" : level === 2 ? "h2" : "h3") as "h1" | "h2" | "h3";
      blocks.push(<Tag key={key++}>{renderInline(text)}</Tag>);
      i++;
      continue;
    }

    // Unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i++;
      }
      blocks.push(
        <ul key={key++}>
          {items.map((t, idx) => (
            <li key={idx}>{renderInline(t)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i++;
      }
      blocks.push(
        <ol key={key++}>
          {items.map((t, idx) => (
            <li key={idx}>{renderInline(t)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    // Blank line — flush
    if (!line.trim()) {
      i++;
      continue;
    }

    // Paragraph (consume contiguous non-blank, non-special lines)
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^#{1,3}\s/.test(lines[i]) &&
      !/^\s*[-*]\s/.test(lines[i]) &&
      !/^\s*\d+\.\s/.test(lines[i]) &&
      !/^---+\s*$/.test(lines[i].trim())
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push(<p key={key++}>{renderInline(paraLines.join(" "))}</p>);
    }
  }

  return blocks;
}

/** Render inline marks: links, images, bold, italic, code. */
function renderInline(text: string): React.ReactNode {
  const out: React.ReactNode[] = [];
  let key = 0;
  let cursor = 0;

  // Master regex — alternation across the four inline patterns we support.
  // Image first so ![](...) doesn't get caught by the link pattern.
  const re =
    /!\[([^\]]*)\]\(([^)]+)\)|\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|`([^`]+)`|\*([^*\n]+)\*/g;

  while (true) {
    const m = re.exec(text);
    if (!m) break;
    if (m.index > cursor) {
      out.push(text.slice(cursor, m.index));
    }
    if (m[2] && m[1] !== undefined) {
      // image
      const src = sanitizeUrl(m[2]);
      if (src) out.push(<ChatImage key={key++} src={src} alt={m[1]} />);
      else out.push(`![${m[1]}](${m[2]})`);
    } else if (m[3] && m[4]) {
      // link
      const href = sanitizeUrl(m[4]);
      if (href) {
        out.push(
          <a key={key++} href={href} target="_blank" rel="noopener noreferrer">
            {m[3]}
          </a>,
        );
      } else {
        out.push(`[${m[3]}](${m[4]})`);
      }
    } else if (m[5]) {
      out.push(<strong key={key++}>{m[5]}</strong>);
    } else if (m[6]) {
      out.push(<code key={key++}>{m[6]}</code>);
    } else if (m[7]) {
      out.push(<em key={key++}>{m[7]}</em>);
    }
    cursor = re.lastIndex;
  }
  if (cursor < text.length) out.push(text.slice(cursor));
  return out;
}

function sanitizeUrl(url: string): string | null {
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("/")) return trimmed;
  return null;
}
