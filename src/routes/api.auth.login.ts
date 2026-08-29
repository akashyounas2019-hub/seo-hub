import { createFileRoute } from "@tanstack/react-router";
import { verifyMasterPassword, createSession } from "@/lib/session";

export const Route = createFileRoute("/api/auth/login")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          let body: any = {};
          try {
            body = await request.json();
          } catch {
            /* fallback */
          }

          const password = (body.password as string) || "";
          if (!verifyMasterPassword(password)) {
            return Response.json({ ok: false, error: "Invalid master password" }, { status: 401 });
          }

          const { cookie } = await createSession(request);

          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: {
              "content-type": "application/json",
              "set-cookie": cookie,
            },
          });
        } catch (err: any) {
          return Response.json({ ok: false, error: err.message || "Login failed" }, { status: 500 });
        }
      },
    },
  },
});
