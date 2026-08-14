import { writeFile } from "fs/promises";
import path from "path";
import { UPLOAD_ROOT } from "@/lib/upload-paths";
import { isImageMime } from "@/lib/attachment-view";

// Server-side preview images for image attachments.
//
// Why: a task list that shows a 96px preview must NOT ship the 8 MB original
// for every card. We downscale once at upload time and store the result next
// to the file as "<name>.thumb.webp".
//
// Why it is allowed to fail: `sharp` is a native module. If a build ever ships
// without a matching binary, attachments must still upload — a missing preview
// is cosmetic, a failed upload is not. Every entry point therefore treats
// `null` as "no preview" and falls back to the full image.

/** Longest edge of a stored preview, in pixels. */
export const THUMB_MAX_PX = 320;

/** Preview files are always WebP, whatever the source type was. */
export const THUMB_MIME = "image/webp";

type SharpModule = (input: Buffer) => {
  rotate: () => {
    resize: (opts: Record<string, unknown>) => {
      webp: (opts: Record<string, unknown>) => { toBuffer: () => Promise<Buffer> };
    };
  };
};

let sharpLoad: SharpModule | null | undefined;

/** Load sharp once, lazily. Returns null when unavailable in this runtime. */
function loadSharp(): SharpModule | null {
  if (sharpLoad === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      sharpLoad = require("sharp") as SharpModule;
    } catch {
      console.warn("[thumbnail] sharp unavailable — attachments keep working, previews are skipped");
      sharpLoad = null;
    }
  }
  return sharpLoad;
}

/** Preview path derived from the stored upload path: /uploads/ab12.png → /uploads/ab12.thumb.webp */
export function thumbPathFor(storedPath: string): string {
  return storedPath.replace(/\.[^./]+$/, "") + ".thumb.webp";
}

/**
 * Render and persist a preview for an image upload.
 *
 * @param storedPath web-style path of the original ("/uploads/ab12.png")
 * @returns the stored preview path, or null when no preview was written
 */
export async function writeThumbnail(
  bytes: Buffer,
  mimeType: string,
  storedPath: string
): Promise<string | null> {
  if (!isImageMime(mimeType)) return null; // never for PDF/Office/SVG
  const sharp = loadSharp();
  if (!sharp) return null;
  try {
    const out = await sharp(bytes)
      // EXIF-rotated phone photos would otherwise preview sideways.
      .rotate()
      .resize({ width: THUMB_MAX_PX, height: THUMB_MAX_PX, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 72 })
      .toBuffer();
    const rel = thumbPathFor(storedPath);
    await writeFile(path.join(UPLOAD_ROOT, path.basename(rel)), out);
    return rel;
  } catch (err) {
    console.warn("[thumbnail] preview failed, keeping the original only:", err);
    return null;
  }
}
