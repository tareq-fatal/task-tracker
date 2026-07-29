// returnUrl sanitizer for the login deep-link flow (Telegram/push links).
// Only same-origin relative paths survive — anything else falls back to "/",
// so the parameter can never become an open redirect.
export function safeReturnUrl(v: string | null | undefined): string {
  if (!v) return "/";
  if (!v.startsWith("/")) return "/"; // absolute URLs, "javascript:", etc.
  if (v.startsWith("//") || v.startsWith("/\\")) return "/"; // protocol-relative
  if (v.startsWith("/login")) return "/"; // no redirect loops
  return v;
}
