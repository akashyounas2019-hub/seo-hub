import { createFileRoute } from "@tanstack/react-router";
import { parseObsidianNote, DEFAULT_OBSIDIAN_VAULT } from "@/lib/obsidian";

let memoryVault = [...DEFAULT_OBSIDIAN_VAULT];

export const Route = createFileRoute("/api/knowledge/obsidian")({
  loader: async ({ request }: any) => {
    return { ok: true, count: memoryVault.length, notes: memoryVault };
  },
  component: () => null,
});

export async function handleObsidianUpload(request: Request) {
  try {
    const body = await request.json();
    if (body?.content && body?.fileName) {
      const parsed = parseObsidianNote(body.content, body.fileName);
      memoryVault.unshift(parsed);
      return new Response(JSON.stringify({ ok: true, message: "Obsidian note indexed successfully", note: parsed }), {
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ ok: false, error: "Missing content or fileName" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
