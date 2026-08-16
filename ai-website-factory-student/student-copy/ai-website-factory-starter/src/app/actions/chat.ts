"use server";

import Anthropic from "@anthropic-ai/sdk";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { chatMessages, chatThreads, type User } from "@/db/schema";
import { AI_TOOL_DEFINITIONS, runTool } from "@/lib/ai-tools";
import { getLLMClient, LLMNotConfiguredError } from "@/lib/llm";
import { composeAllSkills } from "@/lib/seo-skills";
import { requireUser } from "@/lib/server-auth";

const MAX_TOOL_ITERATIONS = 6;

/** Public export so the streaming /api/chat/stream route can reuse the same system prompt. */
export async function systemPromptForExport(user: User): Promise<string> {
  return systemPromptFor(user);
}

function systemPromptFor(user: User): string {
  const base = `You are the AI Website Factory assistant — embedded in an operator console that researches, designs, builds, and optimizes websites for businesses in ANY industry (dental clinics, gyms, law firms, restaurants, contractors, SaaS, and more). The current date is ${new Date().toISOString().slice(0, 10)}.

The user signed in as: ${user.email} (role: ${user.role}).

Your job:
- Help the user understand what's happening across the sites they can see — build projects in flight, tasks in progress, SEO health, indexing, who's doing the work, where things are stuck.
- Surface anomalies: people who haven't logged in today, tasks overdue >24h, sites that went quiet, pages that aren't indexed.
- Be concrete. Quote numbers from the tools, name people by email, link to specific pages with /admin/... paths.
- Be brief by default — short answers unless the question genuinely needs depth.

Hard rules:
- You have a small set of write tools (update_task_status, add_task_comment). Use them ONLY when the user explicitly asks for the action ("mark this done", "comment X"). Never speculatively mutate state.
- All write tools are role-gated server-side. If a tool returns ok:false, surface the reason verbatim — don't pretend the change happened.
- For any other mutation (creating tasks/users, deleting things, editing site settings), point the user at the right /admin/... page instead of trying to do it.
- Never invent data. If a tool returns nothing, say so. Don't fabricate names, dates, or site activity.
- Be honest about uncertainty. If you can't tell whether a task is "done" from the data, say "I can't tell from the data alone — I'd check X."`;

  if (user.role === "admin") {
    const adminPersona =
      base +
      `

You see the whole workspace. The user owns the agency and is the only person with a full cross-site view. Suggest where to focus next — which build is stalled, which manager is overloaded, which site has indexing problems.

You also have RESEARCH + DESIGN + SEO discipline loaded as skills below. Use them proactively when:
- The user asks about ranking, traffic, conversions, keyword targeting → lean on the keyword-research + on-page + AI SEO + local SEO skills.
- The user asks about a build project (research, DNA, sitemap, page review) → lean on the visual-design + copywriting + page CRO + schema-markup skills.
- The user asks "what do you think of this competitor / page / design" → lean on the competitor analysis + visual-design + on-page skills.

Always adapt to the business's NICHE. A build project carries a \`niche\` (e.g. "dental clinic", "yoga studio", "law firm"). Frame every recommendation — keywords, sections, copy, schema — for that specific niche and its city/region. Never assume a particular industry.

Live web access (use sparingly, max ~5 searches per turn):
- You have a server-side \`web_search\` tool. Use it for: live SERP analysis (what's ranking for the project's keywords today), keyword discovery (related queries, People Also Ask), AI Overview reconnaissance, and competitor changes.
- Don't web_search for things we already have tools for — use \`list_research_competitors\`, \`capture_research_screenshots\`, \`view_research\`, etc. first.
- When you do search, summarize what you found in the chat — don't dump raw search results.

WEBSITE BUILD PIPELINE:
8 phases: brief → research → dna → sitemap → pages → review → deploy → live. Each phase has a quality gate. Pages deploy to WordPress via the connector plugin. Use the build:* tools (list_build_projects, advance_build_phase, etc.).

Build tools (in addition to the read-only ops tools you already have):
- list_build_projects — show all builds in flight
- get_build_status — full status of one build (current phase, all jobs, page counts, gate result)
- view_research — read the research markdown
- list_research_competitors — extract competitor URLs + positioning notes + screenshot URLs (render screenshots inline as Markdown images)
- capture_research_screenshots — fire Playwright to capture competitor PNGs (30-90s)
- list_dna_variants — return all DNA variants side-by-side for comparison
- pick_dna_variant — set the chosen DNA on the project (requires confirm)
- list_section_blueprint / pick_sections_for_build — show the section catalog + record the user's picks
- advance_build_phase — advance to next phase, checking the gate first (requires confirm; can force with force:true)
- validate_schema — structural validator for JSON-LD (LocalBusiness, Service, FAQPage, Article, BreadcrumbList)
- suggest_ai_overview_improvements — read a page and propose which passages to bold + missing citable factoids
- capture_url_at_viewports — capture any URL at desktop / tablet / mobile (1440 / 768 / 375) for responsive review
- check_accessibility — run axe-core against a URL and report violations

When the user says "build me a site" or asks about a build, ALWAYS start by calling list_build_projects to see what's already in flight. If there's an in-progress build matching the user's domain, work with that one rather than implying you can spin up a new project.

When a DNA phase has multiple completed variants, present them concisely (label + palette + key typography) and ask the user which they prefer. Once they choose, call pick_dna_variant with confirm:true, then call advance_build_phase to push to sitemap.

For research / DNA / sitemap / review phases, show the gate result clearly. If a gate fails, list the blocking issues and recommend a remedy.

Estimated phase times so the user knows what to expect:
- Research: ~5-8 min
- Each DNA variant: ~4-6 min (run in parallel)
- Sitemap: ~4-6 min
- Page generation: ~2-4 min per page, 4 jobs concurrent
- Quality review: ~8-12 min`;

    // Append all SEO + design skill fragments. This is what makes the agent
    // actually capable in those disciplines rather than just a generic ops
    // console — see src/lib/seo-skills/.
    return composeAllSkills(adminPersona);
  }
  if (user.role === "manager") {
    return (
      base +
      `

You see only the sites this manager is assigned to. Help them assign tasks across their sites, surface which workers are behind, and flag build or SEO work that needs attention.`
    );
  }
  return (
    base +
    `

You see only the sites this student is assigned to. Help them figure out what to do next on their current tasks. Be specific about the steps — link to the right WP plugin or settings page when relevant.`
  );
}

export async function createThreadAction() {
  await ensureSchema();
  const user = await requireUser();
  const [thread] = await db()
    .insert(chatThreads)
    .values({ userId: user.id, title: "New chat" })
    .returning({ id: chatThreads.id });
  revalidatePath("/admin/chat");
  redirect(`/admin/chat?thread=${thread.id}`);
}

export async function deleteThreadAction(threadId: string) {
  await ensureSchema();
  const user = await requireUser();
  const [t] = await db().select().from(chatThreads).where(eq(chatThreads.id, threadId)).limit(1);
  if (!t || t.userId !== user.id) redirect("/admin/chat?error=not-found");
  await db().delete(chatThreads).where(eq(chatThreads.id, threadId));
  revalidatePath("/admin/chat");
  redirect("/admin/chat");
}

export async function sendChatMessageAction(threadId: string, formData: FormData) {
  await ensureSchema();
  const user = await requireUser();

  const body = String(formData.get("body") ?? "").trim();
  if (!body) redirect(`/admin/chat?thread=${threadId}`);

  const [thread] = await db().select().from(chatThreads).where(eq(chatThreads.id, threadId)).limit(1);
  if (!thread || thread.userId !== user.id) redirect("/admin/chat?error=not-found");

  // Persist user message immediately so it shows up even if the model call fails.
  await db().insert(chatMessages).values({ threadId, role: "user", body });
  await db()
    .update(chatThreads)
    .set({
      lastMessageAt: new Date(),
      title: thread.title === "New chat" ? body.slice(0, 60) : thread.title,
    })
    .where(eq(chatThreads.id, threadId));

  try {
    // Standard tier — interactive read-only assistant. Sonnet 4.5 is ample
    // for tool routing + short answers; using Opus here would 5× spend
    // on conversations that often run dozens of turns per day.
    const { client, model } = await getLLMClient({ tier: "standard" });

    // Rebuild full conversation for the API call from DB (the source of truth).
    const dbMessages = await db()
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.threadId, threadId))
      .orderBy(asc(chatMessages.createdAt));

    const apiMessages: Anthropic.MessageParam[] = [];
    for (const m of dbMessages) {
      if (m.role === "user") apiMessages.push({ role: "user", content: m.body });
      else if (m.role === "assistant") apiMessages.push({ role: "assistant", content: m.body });
      // 'tool' and 'system' rows are not replayed verbatim — tool round-trips
      // happen inside this turn and don't carry forward as visible history.
    }

    const sysPrompt = systemPromptFor(user);
    let assistantTextOut = "";
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCacheReadTokens = 0;

    for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
      const response = await client.messages.create({
        model,
        max_tokens: 4096,
        // Cache the stable prefix (system + tool definitions) — they don't change turn to turn.
        system: [{ type: "text", text: sysPrompt, cache_control: { type: "ephemeral" } }],
        tools: [
          ...AI_TOOL_DEFINITIONS.map((t) => ({ ...t })),
          // Anthropic server-side web search. Executes on their side — we just
          // include the tool block and continue the loop. Max 5 searches per
          // turn keeps interactive latency + token use reasonable for chat.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          { type: "web_search_20250305", name: "web_search", max_uses: 5 } as any,
        ],
        messages: apiMessages,
      });

      totalInputTokens += response.usage.input_tokens;
      totalOutputTokens += response.usage.output_tokens;
      totalCacheReadTokens += response.usage.cache_read_input_tokens ?? 0;

      // Append the model's turn to messages (preserve tool_use blocks for the next iter).
      apiMessages.push({ role: "assistant", content: response.content });

      // Collect tool_use blocks and produce tool_result entries.
      const toolUses = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
      );

      // Text blocks are streamed to the user (in this non-streaming v1 we just concat).
      for (const block of response.content) {
        if (block.type === "text") assistantTextOut += block.text;
      }

      if (response.stop_reason === "end_turn" || toolUses.length === 0) {
        break;
      }

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const tu of toolUses) {
        let result: unknown;
        try {
          result = await runTool(user, tu.name, (tu.input ?? {}) as Record<string, unknown>);
        } catch (err) {
          result = { error: err instanceof Error ? err.message : String(err) };
        }
        // Persist the tool round-trip for audit + UI display.
        await db().insert(chatMessages).values({
          threadId,
          role: "tool",
          body: "",
          toolName: tu.name,
          toolInput: (tu.input ?? {}) as Record<string, unknown>,
          toolOutput: result,
        });
        toolResults.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: JSON.stringify(result).slice(0, 8000),
        });
      }
      apiMessages.push({ role: "user", content: toolResults });
    }

    if (!assistantTextOut.trim()) {
      assistantTextOut =
        "(no text response — try rephrasing or asking a more specific question)";
    }

    await db().insert(chatMessages).values({
      threadId,
      role: "assistant",
      body: assistantTextOut,
      inputTokens: String(totalInputTokens),
      outputTokens: String(totalOutputTokens),
      cacheReadTokens: String(totalCacheReadTokens),
    });
  } catch (err) {
    let msg: string;
    if (err instanceof LLMNotConfiguredError) {
      msg = "⚠️ Anthropic API key not configured. Ask the admin to set one at /admin/settings.";
    } else if (err instanceof Anthropic.AuthenticationError) {
      msg = "⚠️ The stored Anthropic API key was rejected. Admin should re-save it at /admin/settings.";
    } else if (err instanceof Anthropic.RateLimitError) {
      msg = "⚠️ Anthropic rate-limited the request. Try again in a moment.";
    } else if (err instanceof Anthropic.APIError) {
      msg = `⚠️ Anthropic API error (${err.status}): ${err.message}`;
    } else {
      msg = `⚠️ Chat failed: ${err instanceof Error ? err.message : String(err)}`;
    }
    await db().insert(chatMessages).values({ threadId, role: "assistant", body: msg });
  }

  await db()
    .update(chatThreads)
    .set({ lastMessageAt: new Date() })
    .where(eq(chatThreads.id, threadId));

  revalidatePath(`/admin/chat`);
  redirect(`/admin/chat?thread=${threadId}`);
}

// Tiny helper used by the page to fetch the latest thread for a user
export async function getLatestThreadId(userId: string): Promise<string | null> {
  const [row] = await db()
    .select({ id: chatThreads.id })
    .from(chatThreads)
    .where(eq(chatThreads.userId, userId))
    .orderBy(desc(chatThreads.lastMessageAt))
    .limit(1);
  return row?.id ?? null;
}

// Quiet the unused-import for `and` (kept available for future filters)
void and;
