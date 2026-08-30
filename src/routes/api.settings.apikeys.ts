import { createFileRoute } from "@tanstack/react-router";
import { encrypt, decrypt, isEncryptionConfigured } from "@/lib/crypto";
import { actorEmailFromRequest, logAudit } from "@/lib/audit";

// Maps the UI's provider key to the org_settings ciphertext column.
const PROVIDER_COLUMNS: Record<string, string> = {
  gemini: "geminiKeyCiphertext",
  groq: "groqKeyCiphertext",
  anthropic: "anthropicKeyCiphertext",
  pagespeed: "pagespeedApiKeyCiphertext",
  openai: "openaiKeyCiphertext",
  semrush: "semrushKeyCiphertext",
};

export const Route = createFileRoute("/api/settings/apikeys")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const { db, ensureSchema } = await import("@/db/client");
          const { orgSettings } = await import("@/db/schema");
          const { eq } = await import("drizzle-orm");

          await ensureSchema();
          const d = db();
          const [row] = await d.select().from(orgSettings).where(eq(orgSettings.id, "singleton")).limit(1);

          // Masked key (last 4 real characters only) so the UI can show
          // "which key is this" without ever sending the plaintext secret
          // back to the browser. Decrypts server-side only; the mask is
          // the only thing that leaves this handler.
          const set: Record<string, boolean> = {};
          const masked: Record<string, string | null> = {};
          for (const [provider, column] of Object.entries(PROVIDER_COLUMNS)) {
            const ciphertext = (row as any)?.[column] as string | undefined;
            set[provider] = !!ciphertext;
            if (ciphertext) {
              try {
                const plaintext = decrypt(ciphertext);
                const tail = plaintext.slice(-4);
                masked[provider] = `${"•".repeat(Math.max(plaintext.length - 4, 4))}${tail}`;
              } catch {
                masked[provider] = null;
              }
            } else {
              masked[provider] = null;
            }
          }

          return Response.json({ ok: true, set, masked, encryptionConfigured: isEncryptionConfigured() });
        } catch (err: any) {
          return Response.json({ ok: false, error: err.message }, { status: 500 });
        }
      },
      POST: async ({ request }) => {
        try {
          if (!isEncryptionConfigured()) {
            return Response.json(
              { ok: false, error: "SETTINGS_ENCRYPTION_KEY is not configured on the server — cannot store API keys yet." },
              { status: 503 },
            );
          }

          let body: any = {};
          try {
            body = await request.json();
          } catch {
            /* fallback */
          }

          const provider = body.provider as string;
          const value = body.value as string;
          const column = PROVIDER_COLUMNS[provider];
          if (!column || !value) {
            return Response.json({ ok: false, error: "provider and value are required" }, { status: 400 });
          }

          const { db, ensureSchema } = await import("@/db/client");
          const { orgSettings } = await import("@/db/schema");
          const { eq } = await import("drizzle-orm");

          await ensureSchema();
          const d = db();
          const ciphertext = encrypt(value);
          await d.update(orgSettings).set({ [column]: ciphertext, updatedAt: new Date() }).where(eq(orgSettings.id, "singleton"));

          await logAudit(actorEmailFromRequest(request), "api_key.updated", { provider });

          return Response.json({ ok: true, provider, set: true });
        } catch (err: any) {
          return Response.json({ ok: false, error: err.message }, { status: 500 });
        }
      },
      DELETE: async ({ request }) => {
        try {
          let body: any = {};
          try {
            body = await request.json();
          } catch {
            /* fallback */
          }
          const provider = body.provider as string;
          const column = PROVIDER_COLUMNS[provider];
          if (!column) {
            return Response.json({ ok: false, error: "unknown provider" }, { status: 400 });
          }

          const { db, ensureSchema } = await import("@/db/client");
          const { orgSettings } = await import("@/db/schema");
          const { eq } = await import("drizzle-orm");

          await ensureSchema();
          const d = db();
          await d.update(orgSettings).set({ [column]: null, updatedAt: new Date() }).where(eq(orgSettings.id, "singleton"));

          await logAudit(actorEmailFromRequest(request), "api_key.removed", { provider });

          return Response.json({ ok: true, provider, set: false });
        } catch (err: any) {
          return Response.json({ ok: false, error: err.message }, { status: 500 });
        }
      },
    },
  },
});
