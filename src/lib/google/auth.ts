export interface GoogleCredentials {
  client_email: string;
  private_key: string;
  project_id: string;
}

// Cache tokens per distinct scope set — a token minted for GSC's
// webmasters.readonly scope is not valid for BigQuery's scopes, so caching a
// single global token regardless of requested scopes silently served the
// wrong (too-narrow) token to whichever API asked second.
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

export async function getGoogleAccessToken(scopes: string[]): Promise<string> {
  if (typeof window !== "undefined") {
    return "client_mock_token";
  }

  const cacheKey = [...scopes].sort().join(" ");
  const now = Math.floor(Date.now() / 1000);
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > now + 60) {
    return cached.token;
  }

  let creds: GoogleCredentials;

  try {
    const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (raw) {
      creds = JSON.parse(raw);
    } else {
      const fs = await import("node:fs/promises");
      const path = await import("node:path");
      const filePath = path.join(process.cwd(), "gmb-service-account.json");
      const exists = await fs.access(filePath).then(() => true).catch(() => false);
      if (!exists) {
        throw new Error("gmb-service-account.json file not found");
      }
      const fileContent = await fs.readFile(filePath, "utf-8");
      creds = JSON.parse(fileContent);
    }
  } catch (err: any) {
    throw new Error(
      `Could not load Google Service Account credentials: ${err.message}`,
    );
  }

  const header = { alg: "RS256", typ: "JWT" };
  const claimSet = {
    iss: creds.client_email,
    scope: scopes.join(" "),
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const base64UrlEncode = (obj: any) => {
    const str = JSON.stringify(obj);
    const b64 = typeof Buffer !== "undefined"
      ? Buffer.from(str).toString("base64")
      : btoa(unescape(encodeURIComponent(str)));
    return b64.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  };

  const unsignedToken = `${base64UrlEncode(header)}.${base64UrlEncode(claimSet)}`;

  const crypto = await import("node:crypto");
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(unsignedToken);
  const signature = signer
    .sign(creds.private_key, "base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  const jwt = `${unsignedToken}.${signature}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
    signal: AbortSignal.timeout(3000),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Google OAuth token request failed (${res.status}): ${errorText}`);
  }

  const data = await res.json();
  tokenCache.set(cacheKey, {
    token: data.access_token,
    expiresAt: now + (data.expires_in || 3600),
  });

  return data.access_token;
}
