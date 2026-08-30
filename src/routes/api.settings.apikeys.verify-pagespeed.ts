import { createFileRoute } from "@tanstack/react-router";

// Real connectivity check for the PageSpeed Insights API key configured in
// Settings > APIs. Previously that panel only ever showed "Set" / "Not set"
// -- a boolean for whether a value exists in the database, never whether
// Google actually accepts it. This makes one real, cheap PSI call against a
// known-stable URL and classifies the response: a genuine 400/403 from
// Google (invalid/unauthorized key) is reported as an error; a successful
// run confirms the key really works; any other failure (timeout, quota,
// network) is reported honestly as "could not verify" rather than as
// either a false pass or a false "invalid key".
export const Route = createFileRoute("/api/settings/apikeys/verify-pagespeed")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const { fetchPageSpeedInsights } = await import("@/lib/google/pagespeed");
          await fetchPageSpeedInsights("https://www.google.com", "mobile");
          return Response.json({ ok: true, valid: true, message: "PageSpeed Insights API responded successfully." });
        } catch (err: any) {
          const msg = String(err.message || "");
          // Only classify as a key problem when Google's error text actually
          // names the key/credential -- a generic "invalid value" elsewhere
          // in the request (e.g. a malformed parameter) is a code bug, not
          // proof the configured key is bad, and must not be reported as one.
          const authFailure =
            /\((400|401|403)\)/.test(msg) && /\bapi[ _-]?key\b|\bkeyinvalid\b|forbidden|unauthorized|permission_denied/i.test(msg);
          if (authFailure) {
            return Response.json({ ok: true, valid: false, message: `Google rejected this API key: ${msg.slice(0, 300)}` });
          }
          return Response.json({ ok: true, valid: null, message: `Could not verify right now (not necessarily an invalid key): ${msg.slice(0, 300)}` });
        }
      },
    },
  },
});
