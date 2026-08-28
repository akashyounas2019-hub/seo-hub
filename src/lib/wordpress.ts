// Real WordPress REST API publishing client. Authenticates with a WordPress
// Application Password (Users > Profile > Application Passwords in wp-admin
// -- not the account login password) via HTTP Basic Auth, which is the
// standard way to call the WP REST API without OAuth.
//
// No mock mode: every function here makes a real HTTP request to the site's
// real /wp-json/wp/v2/* endpoints. If credentials are missing or wrong, it
// throws a real error rather than pretending to succeed.

export type WordPressCredentials = {
  siteUrl: string;
  username: string;
  appPassword: string;
};

function authHeader(creds: WordPressCredentials): string {
  const token = Buffer.from(`${creds.username}:${creds.appPassword}`).toString("base64");
  return `Basic ${token}`;
}

function normalizeSiteUrl(url: string): string {
  const withProtocol = url.startsWith("http") ? url : `https://${url}`;
  return withProtocol.replace(/\/$/, "");
}

/** Verifies credentials actually work against this site's real REST API. */
export async function verifyWordPressConnection(creds: WordPressCredentials): Promise<{ ok: boolean; error?: string; userName?: string }> {
  try {
    const res = await fetch(`${normalizeSiteUrl(creds.siteUrl)}/wp-json/wp/v2/users/me`, {
      headers: { Authorization: authHeader(creds) },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `WordPress rejected the credentials (HTTP ${res.status}): ${text.slice(0, 200)}` };
    }
    const data = await res.json();
    return { ok: true, userName: data?.name };
  } catch (err: any) {
    return { ok: false, error: err.message || "Failed to reach WordPress site" };
  }
}

export type PublishPostInput = {
  title: string;
  content: string; // HTML or Gutenberg block markup
  status?: "publish" | "draft" | "pending";
  excerpt?: string;
};

export type PublishResult = {
  postId: number;
  link: string;
  status: string;
};

/**
 * Creates a real WordPress post via POST /wp-json/wp/v2/posts. Returns the
 * real published URL from WordPress's own response -- never a synthesized
 * one, since the actual permalink structure is WordPress's to decide.
 */
export async function publishWordPressPost(creds: WordPressCredentials, input: PublishPostInput): Promise<PublishResult> {
  const res = await fetch(`${normalizeSiteUrl(creds.siteUrl)}/wp-json/wp/v2/posts`, {
    method: "POST",
    headers: {
      Authorization: authHeader(creds),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: input.title,
      content: input.content,
      status: input.status || "publish",
      excerpt: input.excerpt,
    }),
    signal: AbortSignal.timeout(20000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`WordPress publish failed (HTTP ${res.status}): ${text.slice(0, 400)}`);
  }

  const data = await res.json();
  if (!data?.id || !data?.link) {
    throw new Error("WordPress returned an unexpected response — no post id/link in the result");
  }

  return { postId: data.id, link: data.link, status: data.status };
}
