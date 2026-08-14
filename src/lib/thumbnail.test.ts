import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { thumbPathFor, writeThumbnail, THUMB_MIME } from "./thumbnail";

describe("thumbPathFor", () => {
  it("swaps the extension for .thumb.webp", () => {
    expect(thumbPathFor("/uploads/ab12cd.png")).toBe("/uploads/ab12cd.thumb.webp");
    expect(thumbPathFor("/uploads/ab12cd.jpg")).toBe("/uploads/ab12cd.thumb.webp");
  });

  it("leaves a dot in the directory alone", () => {
    expect(thumbPathFor("/uploads/v1.2/abc")).toBe("/uploads/v1.2/abc.thumb.webp");
  });

  it("always announces WebP", () => {
    expect(THUMB_MIME).toBe("image/webp");
  });
});

describe("writeThumbnail", () => {
  it("refuses anything that is not an inline-safe raster image", async () => {
    // PDF, Office, ZIP → no preview, and — the point — no file written.
    expect(await writeThumbnail(Buffer.from("%PDF-1.4"), "application/pdf", "/uploads/x.pdf")).toBeNull();
    expect(await writeThumbnail(Buffer.from("x"), "application/zip", "/uploads/x.zip")).toBeNull();
    // SVG is an image/* but never rendered inline (stored XSS) — no preview either.
    expect(await writeThumbnail(Buffer.from("<svg/>"), "image/svg+xml", "/uploads/x.svg")).toBeNull();
  });

  it("never throws on a corrupt image — the upload must still succeed", async () => {
    const junk = Buffer.from("this is not a PNG at all");
    await expect(writeThumbnail(junk, "image/png", "/uploads/junk.png")).resolves.toBeNull();
  });
});

// The route must decide "may this person see it?" BEFORE it decides "full size
// or preview?" — otherwise ?thumb=1 would be a way around the tenant check.
// Behaviour lives behind a database, so this pins the ordering in the source.
describe("attachment route: the preview sits behind the same gate", () => {
  const src = readFileSync(
    join(__dirname, "..", "app", "download", "attachment", "[id]", "route.ts"),
    "utf8"
  );

  it("checks tenant and visibility before reading any file", () => {
    const tenantCheck = src.indexOf("att.task.tenantId !== tenant.id");
    const canView = src.indexOf("if (!canView)");
    const thumbBranch = src.indexOf('params_.get("thumb")');
    expect(tenantCheck).toBeGreaterThan(-1);
    expect(canView).toBeGreaterThan(-1);
    expect(thumbBranch).toBeGreaterThan(canView);
    expect(canView).toBeGreaterThan(tenantCheck);
  });

  it("resolves every served path through the traversal-safe resolver", () => {
    const reads = src.match(/readFile\(/g) ?? [];
    const resolved = src.match(/resolveUploadPath\(/g) ?? [];
    expect(reads.length).toBeGreaterThan(0);
    expect(resolved.length).toBeGreaterThanOrEqual(reads.length);
  });
});
