/**
 * Repair for the Next.js server-action multipart bug (Kunden-Report
 * 2026-08-02): next 14.2 parses fetch-action FormData with busboy WITHOUT
 * `defParamCharset: "utf8"`, so the Content-Disposition filename's raw UTF-8
 * bytes are decoded as Latin-1 — Arabic names arrive as "Ø§Ù..." mojibake
 * before our code ever sees them.
 *
 * The repair reverses that exact step: re-encode as Latin-1 and decode as
 * UTF-8. Safe by construction: browsers always send UTF-8, so a filename with
 * high-Latin-1 chars at this boundary is always mojibake; if the byte
 * round-trip does NOT form valid UTF-8 (U+FFFD appears), the name was not
 * mojibake and stays untouched. Pure + unit-tested; the same logic drives the
 * one-time DB backfill migration (20260802150000).
 */
export function decodeUploadFilename(raw: string): string {
  if (!/[\u0080-\u00ff]/.test(raw)) return raw; // pure ASCII — nothing to do
  const repaired = Buffer.from(raw, "latin1").toString("utf8");
  return repaired.includes("�") ? raw : repaired;
}
