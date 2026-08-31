// Real cross-context clipboard copy. navigator.clipboard.writeText() only
// exists in a "secure context" (HTTPS, or localhost) -- on this app's
// actual production origin (plain HTTP, no TLS-terminating proxy in front
// of it, confirmed elsewhere in this codebase) navigator.clipboard is
// undefined in Chrome/Firefox/Edge, so every "Copy" button in the app was
// throwing synchronously and silently doing nothing. Falls back to the
// legacy execCommand('copy') technique, which still works over plain HTTP,
// and only reports success when a copy genuinely happened.
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to the legacy path below
    }
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    // Keep it out of the visible viewport and out of the tab order, but
    // still a real focusable/selectable element -- execCommand requires an
    // actual selection to copy from.
    textarea.style.position = "fixed";
    textarea.style.top = "-9999px";
    textarea.style.left = "-9999px";
    textarea.setAttribute("readonly", "");
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}
