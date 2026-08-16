/**
 * Next.js calls this once per process at startup (nodejs runtime only).
 *
 * Refuses to boot in production when required env vars are missing — better
 * to crash visibly at start than to silently 500 the first time someone
 * visits /admin/settings.
 *
 * The Claude Code server executor runs as a SEPARATE Docker service
 * (see docker-compose.yml `claude-executor`) — keeps it out of the
 * Next.js webpack bundle and isolated from web request lifecycle.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { assertProdEnv } = await import("@/lib/env");
  try {
    assertProdEnv();
  } catch (err) {
    if (process.env.NODE_ENV === "production") {
      throw err;
    }
    console.warn("[boot]", err instanceof Error ? err.message : err);
  }
}
