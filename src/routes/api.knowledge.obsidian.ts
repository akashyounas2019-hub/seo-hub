import { createFileRoute } from "@tanstack/react-router";
import { parseObsidianNote, DEFAULT_OBSIDIAN_VAULT } from "@/lib/obsidian";

let memoryVault = [...DEFAULT_OBSIDIAN_VAULT];

export const Route = createFileRoute("/api/knowledge/obsidian")({
  server: {
    handlers: {
      GET: async () => {
        return Response.json({ ok: true, count: memoryVault.length, notes: memoryVault });
      },
      POST: async ({ request }) => {
        try {
          const body = await request.json();
          if (body?.content && body?.fileName) {
            const parsed = parseObsidianNote(body.content, body.fileName);
            memoryVault.unshift(parsed);
            return Response.json({ ok: true, message: "Obsidian note indexed successfully", note: parsed });
          }
          return Response.json({ ok: false, error: "Missing content or fileName" }, { status: 400 });
        } catch (err: any) {
          return Response.json({ ok: false, error: err.message }, { status: 500 });
        }
      },
    },
  },
});
