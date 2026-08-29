import { createFileRoute } from "@tanstack/react-router";
import { isSessionValid } from "@/lib/session";

export const Route = createFileRoute("/api/auth/session")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const valid = await isSessionValid(request);
        return Response.json({ ok: true, authenticated: valid });
      },
    },
  },
});
