// Which uploaded MIME types are SAFE to serve inline (rendered in the browser
// / Capacitor WebView) vs. forced as a download. Kept deliberately narrow:
// images + PDF only. SVG and HTML are NEVER inlined — they can execute script
// and would be a stored-XSS vector; anything not listed is sent as an
// octet-stream download. Pure + unit-tested so the route and UI agree.

const INLINE_SAFE = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
]);

export function isInlineViewable(mime: string): boolean {
  return INLINE_SAFE.has(mime);
}

/** True only for raster images we allow inline (excludes SVG). */
export function isImageMime(mime: string): boolean {
  return mime.startsWith("image/") && INLINE_SAFE.has(mime);
}
