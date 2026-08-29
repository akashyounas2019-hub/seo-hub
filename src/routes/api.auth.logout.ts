import { createFileRoute } from "@tanstack/react-router";
import { destroySession, clearSessionCookie } from "@/lib/session";

export const Route = createFileRoute("/api/auth/logout")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          await destroySession(request);
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: {
              "content-type": "application/json",
              "set-cookie": clearSessionCookie(),
            },
          });
        } catch (err: any) {
          return Response.json({ ok: false, error: err.message || "Logout failed" }, { status: 500 });
        }
      },
    },
  },
});
