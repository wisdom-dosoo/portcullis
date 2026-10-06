/**
 * Copy text to the clipboard, degrading gracefully.
 *
 * `navigator.clipboard.writeText` rejects with `NotAllowedError` in insecure
 * contexts (non-HTTPS/localhost), outside a user gesture, or when permission
 * is denied.  We fall back to the legacy `document.execCommand("copy")` path,
 * and finally return `false` so callers can render accurate feedback instead
 * of an unhandled rejection or a false "copied" toast.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to the execCommand fallback
    }
  }

  if (typeof document !== "undefined") {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.top = "-9999px";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(textarea);
      if (ok) return true;
    } catch {
      // execCommand can throw in some browsers — return false below
    }
  }

  return false;
}