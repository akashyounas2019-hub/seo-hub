/**
 * Platform → WP media library upload.
 *
 * Goes through the GYL Suite plugin's HMAC-signed media-upload endpoint
 * (mirrors the seo-apply pattern in wp-plugin-client.ts so we never touch
 * WP core REST directly — see CLAUDE.md "WP plugin is the only integration
 * touchpoint").
 *
 * Plugin endpoint contract (added in P2 deploy step, plugin v0.26.0):
 *
 *   POST /wp-json/gyl-bookings/v1/media-upload
 *   headers: X-GYL-Key-Id, X-GYL-Timestamp, X-GYL-Signature, X-GYL-Idempotency-Key
 *   body (JSON): {
 *     filename: string,        // e.g. "hero-london-1234abcd.jpg"
 *     mime_type: string,       // "image/png" | "image/jpeg" | "image/webp"
 *     image_b64: string,       // base64-encoded image bytes (no data:URL prefix)
 *     alt_text?: string,
 *     title?: string,
 *     caption?: string,
 *     post_id?: number         // attach to a post (optional)
 *   }
 *
 *   response (200): {
 *     ok: true,
 *     media_id: number,
 *     source_url: string,      // canonical CDN/site URL for the image
 *     filename: string
 *   }
 *
 *   response (4xx/5xx): { ok: false, error: string }
 */

import { callPlugin, WpPluginError, WpPluginNotConfiguredError } from "./wp-plugin-client";

export interface WpMediaUploadInput {
  siteId: string;
  filename: string;
  mimeType: string;
  bytes: Buffer;
  altText?: string;
  title?: string;
  caption?: string;
  postId?: number;
}

export interface WpMediaUploadResult {
  mediaId: number;
  sourceUrl: string;
  filename: string;
}

export { WpPluginError, WpPluginNotConfiguredError };

/**
 * Upload image bytes to the site's WP media library via the GYL Suite plugin.
 * Throws `WpPluginNotConfiguredError` if the site has no api_keys row,
 * `WpPluginError` on plugin/network failure.
 */
export async function uploadImageToWp(input: WpMediaUploadInput): Promise<WpMediaUploadResult> {
  const body = {
    filename: sanitizeFilename(input.filename),
    mime_type: input.mimeType,
    image_b64: input.bytes.toString("base64"),
    alt_text: input.altText ?? "",
    title: input.title ?? "",
    caption: input.caption ?? "",
    post_id: input.postId ?? null,
  };

  const result = await callPlugin<{
    ok?: boolean;
    media_id?: number;
    source_url?: string;
    filename?: string;
    error?: string;
  }>(input.siteId, {
    path: "/media-upload",
    method: "POST",
    body,
  });

  if (!result.ok || typeof result.media_id !== "number" || typeof result.source_url !== "string") {
    throw new WpPluginError(
      200,
      JSON.stringify(result).slice(0, 500),
      result.error ?? "media-upload-malformed-response",
    );
  }

  return {
    mediaId: result.media_id,
    sourceUrl: result.source_url,
    filename: result.filename ?? input.filename,
  };
}

/**
 * Make a filename safe for WP filesystem (no path separators, no shell metas,
 * preserve extension). WP will further sanitize, but doing it upfront keeps
 * our logs / DB rows readable.
 */
function sanitizeFilename(name: string): string {
  // Strip any path components — defense in depth even though we control the
  // caller. WP's own sanitize_file_name() would also do this but we should
  // not rely on it.
  const base = name.replace(/^.*[\\/]/, "");
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
  const cleanStem = stem.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 60) || "image";
  const cleanExt = ext.replace(/[^a-z0-9]/g, "").slice(0, 4) || "jpg";
  return `${cleanStem}.${cleanExt}`;
}
