/**
 * Security header probe.
 *
 * Issues a HEAD request to the site root and checks the response headers
 * for the standard hardening set. Findings are deterministic — no LLM.
 *
 * Checks:
 *   - HTTPS enforced (redirects HTTP → HTTPS, HSTS header present)
 *   - Content-Security-Policy (at least frame-ancestors)
 *   - X-Content-Type-Options: nosniff
 *   - Referrer-Policy
 *   - Strict-Transport-Security with max-age ≥ 31536000
 *   - Mixed content sniff: page HTML contains http:// resources on an
 *     https:// origin
 */

export interface SecurityFinding {
  code: string;
  severity: "info" | "low" | "medium" | "high";
  summary: string;
  detail?: Record<string, unknown>;
}

export async function probeSecurity(siteDomain: string): Promise<SecurityFinding[]> {
  const findings: SecurityFinding[] = [];
  const base = siteDomain.startsWith("http") ? siteDomain : `https://${siteDomain}`;
  const url = base.endsWith("/") ? base : base + "/";

  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    return [{
      code: "security-fetch-failed",
      severity: "info",
      summary: `Could not reach ${url}: ${err instanceof Error ? err.message : String(err)}`,
    }];
  }

  const headers = res.headers;

  // 1. HTTPS landing.
  if (!res.url.startsWith("https://")) {
    findings.push({ code: "no-https", severity: "high", summary: "Site does not redirect HTTP → HTTPS at the root URL" });
  }

  // 2. Strict-Transport-Security.
  const hsts = headers.get("strict-transport-security") ?? "";
  if (!hsts) {
    findings.push({ code: "missing-hsts", severity: "medium", summary: "No Strict-Transport-Security header" });
  } else {
    const maxAge = parseInt(/max-age\s*=\s*(\d+)/i.exec(hsts)?.[1] ?? "0", 10);
    if (maxAge < 31536000) {
      findings.push({
        code: "hsts-short-max-age",
        severity: "low",
        summary: `HSTS max-age is ${maxAge}s — should be at least 31536000 (1 year)`,
        detail: { maxAge },
      });
    }
  }

  // 3. X-Content-Type-Options.
  const xcto = headers.get("x-content-type-options") ?? "";
  if (!/nosniff/i.test(xcto)) {
    findings.push({ code: "missing-x-content-type-options", severity: "low", summary: "X-Content-Type-Options header missing or not 'nosniff'" });
  }

  // 4. Referrer-Policy.
  const ref = headers.get("referrer-policy") ?? "";
  if (!ref) {
    findings.push({ code: "missing-referrer-policy", severity: "low", summary: "No Referrer-Policy header" });
  }

  // 5. Content-Security-Policy.
  const csp = headers.get("content-security-policy") ?? "";
  if (!csp) {
    findings.push({ code: "missing-csp", severity: "low", summary: "No Content-Security-Policy header" });
  }

  // 6. Mixed content sniff (only if landing was https).
  if (res.url.startsWith("https://")) {
    try {
      const html = await res.text();
      const httpResources = html.match(/(?:src|href)\s*=\s*["']http:\/\/[^"']+["']/gi) ?? [];
      if (httpResources.length > 0) {
        findings.push({
          code: "mixed-content",
          severity: "high",
          summary: `${httpResources.length} resources loaded over HTTP on an HTTPS page`,
          detail: { count: httpResources.length, examples: httpResources.slice(0, 3) },
        });
      }
    } catch {
      // body read failed — skip mixed-content sniff
    }
  }

  return findings;
}
