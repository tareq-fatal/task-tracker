import path from "path";

// K-6 fix: runtime uploads live OUTSIDE public/. Next statically serves
// everything under public/ after a restart — with no session check, bypassing
// the auth-checked /download/* routes. Files under var/uploads are reachable
// ONLY through route handlers.
//
// DB rows keep their historical web-style paths ("/uploads/<name>",
// "/uploads/exports/<id>.xlsx", "/uploads/tenants/<slug>/logo.png") — the
// resolver below maps them into UPLOAD_ROOT, so no data migration is needed.
export const UPLOAD_ROOT =
  process.env.UPLOAD_DIR || path.join(process.cwd(), "var", "uploads");

/**
 * Resolve a stored web-style upload path to an absolute path inside
 * UPLOAD_ROOT. Returns null when the path would escape the root
 * (traversal, absolute-path tricks) — callers treat that as 404.
 */
export function resolveUploadPath(stored: string): string | null {
  const rel = stored
    .split("?")[0]
    .replace(/^\/+/, "")
    .replace(/^uploads\//, "");
  const root = path.resolve(UPLOAD_ROOT);
  const abs = path.resolve(root, rel);
  return abs === root || abs.startsWith(root + path.sep) ? abs : null;
}
