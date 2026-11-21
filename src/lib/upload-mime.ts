import { ALLOWED_MIME } from "./validation";

/**
 * Resolve the MIME type of an uploaded attachment (Kunden-Report 2026-11-21:
 * a project member could not attach a PDF — "immer eine Fehlermeldung").
 *
 * Root cause: the server trusted the browser's `File.type` only. Mobile file
 * pickers (Android document providers, WhatsApp/Telegram shares, some
 * Windows setups) frequently send an EMPTY type or `application/octet-stream`
 * for perfectly normal PDFs/Office files, so the upload was rejected as
 * BAD_TYPE ("Bilder, PDF & Office") although it was a PDF.
 *
 * Policy (kept strict — this widens nothing for files that already worked):
 *  1. A declared type that is on the allow-list wins (unchanged behaviour).
 *  2. Only when the declared type is GENERIC (empty / octet-stream) do we
 *     derive it: from the file's magic bytes where the format has them, and
 *     from the extension only to disambiguate inside a magic family (ZIP →
 *     docx/xlsx/pptx/zip, OLE → doc/xls/ppt) or for plain-text formats
 *     (txt/csv) that have no signature — those must not contain NUL bytes.
 *  3. A specific but non-allowed declared type (e.g. text/html) stays
 *     rejected — no sniffing around an explicit claim.
 * The stored extension is still derived from the RESOLVED type via
 * MIME_EXTENSION, never from the user's filename.
 */

const GENERIC_TYPES = new Set(["", "application/octet-stream", "binary/octet-stream"]);

const ZIP_FAMILY: Record<string, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  zip: "application/zip",
};

const OLE_FAMILY: Record<string, string> = {
  doc: "application/msword",
  xls: "application/vnd.ms-excel",
  ppt: "application/vnd.ms-powerpoint",
};

const TEXT_FAMILY: Record<string, string> = {
  txt: "text/plain",
  csv: "text/csv",
};

function startsWith(bytes: Uint8Array, sig: number[], offset = 0): boolean {
  if (bytes.length < offset + sig.length) return false;
  return sig.every((b, i) => bytes[offset + i] === b);
}

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot < 0 ? "" : fileName.slice(dot + 1).toLowerCase();
}

/** Type from the file signature alone, or null when it has no known one. */
export function sniffMime(bytes: Uint8Array, fileName: string): string | null {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf"; // %PDF-
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return "image/gif"; // GIF8
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) {
    return "image/webp"; // RIFF....WEBP
  }
  const ext = extensionOf(fileName);
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) return ZIP_FAMILY[ext] ?? "application/zip";
  if (startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return OLE_FAMILY[ext] ?? null;
  return null;
}

export function resolveUploadMime(
  declaredType: string,
  fileName: string,
  bytes: Uint8Array
): string | null {
  const declared = (declaredType || "").trim().toLowerCase();
  if (ALLOWED_MIME.includes(declared)) return declared;
  if (!GENERIC_TYPES.has(declared)) return null;

  const sniffed = sniffMime(bytes, fileName);
  if (sniffed) return ALLOWED_MIME.includes(sniffed) ? sniffed : null;

  const textType = TEXT_FAMILY[extensionOf(fileName)];
  if (textType && !bytes.subarray(0, 8192).includes(0)) return textType;
  return null;
}
