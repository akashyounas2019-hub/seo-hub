import { NextRequest } from "next/server";
import { asc, eq } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";
import { db, ensureSchema } from "@/db/client";
import { chatMessages, chatThreads } from "@/db/schema";
import { AI_TOOL_DEFINITIONS, runTool } from "@/lib/ai-tools";
import { getLLMClient, LLMNotConfiguredError } from "@/lib/llm";
import { requireUser } from "@/lib/server-auth";

/**
 * Streaming chat endpoint — POST body { threadId, body }.
 *
 * Returns `application/x-ndjson` (one JSON event per line). The client
 * reads the stream line-by-line and renders each event live, so the
 * operator sees:
 *   - the assistant text typing token-by-token
 *   - each tool call as it starts (with real name + input)
 *   - each tool result as it completes (with duration)
 *
 * Persistence model: tool round-trips and the final assistant message
 * are written to the DB the same way the legacy server action did, so
 * a router.refresh() after the stream finishes hydrates the persisted
 * history. The stream is "fire and forget" from the DB's perspective —
 * if the client disconnects mid-stream, the DB rows still land.
 *
 * Event types emitted on the stream:
 *   { "t": "user_persisted",  "id": string }
 *   { "t": "iter_start",      "n": number }
 *   { "t": "tool_start",      "id": string, "name": string, "input": object }
 *   { "t": "tool_done",       "id": string, "name": string, "ms": number, "preview": string, "error"?: string }
 *   { "t": "text_delta",      "delta": string }
 *   { "t": "iter_end" }
 *   { "t": "done",            "messageId": string, "tokensIn": number, "tokensOut": number }
 *   { "t": "error",           "message": string }
 */

const MAX_TOOL_ITERATIONS = 6;

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Body {
  threadId?: string;
  body?: string;
}

export async function POST(req: NextRequest) {
  await ensureSchema();
  const user = await requireUser();
  const json = (await req.json().catch(() => ({}))) as Body;
  const threadId = String(json.threadId ?? "").trim();
  const body = String(json.body ?? "").trim();

  if (!threadId || !body) {
    return new Response(JSON.stringify({ error: "missing-threadId-or-body" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  // Ownership check — must own the thread.
  const [thread] = await db().select().from(chatThreads).where(eq(chatThreads.id, threadId)).limit(1);
  if (!thread || thread.userId !== user.id) {
    return new Response(JSON.stringify({ error: "thread-not-found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  // Persist user message + bump thread.
  const [userRow] = await db()
    .insert(chatMessages)
    .values({ threadId, role: "user", body })
    .returning({ id: chatMessages.id });
  await db()
    .update(chatThreads)
    .set({
      lastMessageAt: new Date(),
      title: thread.title === "New chat" ? body.slice(0, 60) : thread.title,
    })
    .where(eq(chatThreads.id, threadId));

  // Build the streaming response body
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (event: Record<string, unknown>) => {
        controller.enqueue(enc.encode(JSON.stringify(event) + "\n"));
      };

      try {
        send({ t: "user_persisted", id: userRow.id });

        const { client, model } = await getLLMClient({ tier: "standard" });

        // Replay full thread for context
        const dbMessages = await db()
          .select()
          .from(chatMessages)
          .where(eq(chatMessages.threadId, threadId))
          .orderBy(asc(chatMessages.createdAt));

        const apiMessages: Anthropic.MessageParam[] = [];
        for (const m of dbMessages) {
          if (m.role === "user") apiMessages.push({ role: "user", content: m.body });
          else if (m.role === "assistant") apiMessages.push({ role: "assistant", content: m.body });
        }

        const sysPrompt = await (await import("@/app/actions/chat")).systemPromptForExport(user);

        let assistantTextOut = "";
        let totalInputTokens = 0;
        let totalOutputTokens = 0;
        let totalCacheReadTokens = 0;

        for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
          send({ t: "iter_start", n: iter });

          // Streaming Anthropic call — we receive tokens + tool_use blocks
          // as they arrive, so the client sees real-time activity.
          const turnContent: Anthropic.ContentBlock[] = [];
          const liveToolUses: Array<{ id: string; name: string; inputJson: string }> = [];
          let liveText = "";
          let stopReason: string | null = null;

          const apiStream = client.messages.stream({
            model,
            max_tokens: 4096,
            system: [{ type: "text", text: sysPrompt, cache_control: { type: "ephemeral" } }],
            tools: [
              ...AI_TOOL_DEFINITIONS.map((t) => ({ ...t })),
              // Anthropic server-side web search (live SERP / keyword research /
              // AI Overview reconnaissance). Server-tool blocks come back as
              // server_tool_use + web_search_tool_result which our local
              // executor loop simply lets pass through.
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              { type: "web_search_20250305", name: "web_search", max_uses: 5 } as any,
            ],
            messages: apiMessages,
          });

          for await (const event of apiStream) {
            // Text streaming
            if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
              liveText += event.delta.text;
              send({ t: "text_delta", delta: event.delta.text });
            }
            // Tool input streams as input_json_delta chunks
            if (event.type === "content_block_delta" && event.delta.type === "input_json_delta") {
              // Find the most recent tool_use placeholder being built
              const tu = liveToolUses[liveToolUses.length - 1];
              if (tu) tu.inputJson += event.delta.partial_json;
            }
            if (event.type === "content_block_start" && event.content_block.type === "tool_use") {
              const tu = event.content_block;
              liveToolUses.push({ id: tu.id, name: tu.name, inputJson: "" });
              send({ t: "tool_start", id: tu.id, name: tu.name, input: null });
            }
            if (event.type === "message_delta" && event.delta.stop_reason) {
              stopReason = event.delta.stop_reason;
            }
          }

          // After streaming completes, get the final message for content blocks
          const finalMessage = await apiStream.finalMessage();
          totalInputTokens += finalMessage.usage.input_tokens;
          totalOutputTokens += finalMessage.usage.output_tokens;
          totalCacheReadTokens += finalMessage.usage.cache_read_input_tokens ?? 0;
          turnContent.push(...finalMessage.content);
          apiMessages.push({ role: "assistant", content: finalMessage.content });

          for (const block of finalMessage.content) {
            if (block.type === "text") assistantTextOut += block.text;
          }
          // liveText was streamed already; keep as-is for accumulator parity.
          void liveText;

          // Tool execution phase — run each tool and emit live results
          const toolUses = finalMessage.content.filter(
            (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
          );

          if (stopReason === "end_turn" || toolUses.length === 0) {
            send({ t: "iter_end" });
            break;
          }

          const toolResults: Anthropic.ToolResultBlockParam[] = [];
          for (const tu of toolUses) {
            const startedAt = Date.now();
            let result: unknown;
            let errorMsg: string | undefined;
            try {
              result = await runTool(user, tu.name, (tu.input ?? {}) as Record<string, unknown>);
            } catch (err) {
              errorMsg = err instanceof Error ? err.message : String(err);
              result = { error: errorMsg };
            }
            const ms = Date.now() - startedAt;

            // Persist tool round-trip for audit
            await db().insert(chatMessages).values({
              threadId,
              role: "tool",
              body: "",
              toolName: tu.name,
              toolInput: (tu.input ?? {}) as Record<string, unknown>,
              toolOutput: result,
            });

            const preview = JSON.stringify(result).slice(0, 240);
            send({ t: "tool_done", id: tu.id, name: tu.name, ms, preview, error: errorMsg });

            toolResults.push({
              type: "tool_result",
              tool_use_id: tu.id,
              content: JSON.stringify(result).slice(0, 8000),
            });
          }
          apiMessages.push({ role: "user", content: toolResults });
          send({ t: "iter_end" });
        }

        if (!assistantTextOut.trim()) {
          assistantTextOut = "(no text response — try rephrasing or asking a more specific question)";
        }

        const [persisted] = await db()
          .insert(chatMessages)
          .values({
            threadId,
            role: "assistant",
            body: assistantTextOut,
            inputTokens: String(totalInputTokens),
            outputTokens: String(totalOutputTokens),
            cacheReadTokens: String(totalCacheReadTokens),
          })
          .returning({ id: chatMessages.id });

        send({
          t: "done",
          messageId: persisted.id,
          tokensIn: totalInputTokens,
          tokensOut: totalOutputTokens,
          cacheRead: totalCacheReadTokens,
        });
      } catch (err) {
        let msg: string;
        if (err instanceof LLMNotConfiguredError) {
          msg = "Anthropic API key not configured. Set one at /admin/settings.";
        } else if (err instanceof Anthropic.AuthenticationError) {
          msg = "The stored Anthropic API key was rejected. Re-save it at /admin/settings.";
        } else {
          msg = err instanceof Error ? err.message : String(err);
        }
        // Also persist the error as an assistant message so the user sees it on refresh
        try {
          await db().insert(chatMessages).values({
            threadId,
            role: "assistant",
            body: `⚠️ ${msg}`,
          });
        } catch {
          /* best-effort */
        }
        send({ t: "error", message: msg });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-cache, no-store, must-revalidate",
      "x-accel-buffering": "no", // disable nginx buffering if proxied
    },
  });
}
