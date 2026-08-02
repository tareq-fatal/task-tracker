import { describe, expect, it } from "vitest";
import { decodeUploadFilename } from "./filename-encoding";

// Simulates what busboy (no defParamCharset) does to a UTF-8 filename.
const mangle = (name: string) => Buffer.from(name, "utf8").toString("latin1");

describe("decodeUploadFilename", () => {
  it("repairs Arabic filenames mangled by the busboy latin1 decode", () => {
    const original = "الملف-التقرير.pdf";
    expect(decodeUploadFilename(mangle(original))).toBe(original);
  });

  it("repairs German umlauts", () => {
    const original = "Prüfbericht Kräne (März).pdf";
    expect(decodeUploadFilename(mangle(original))).toBe(original);
  });

  it("repairs Turkish characters", () => {
    const original = "Rıhtım-görev-listesi.xlsx";
    expect(decodeUploadFilename(mangle(original))).toBe(original);
  });

  it("leaves plain ASCII untouched", () => {
    expect(decodeUploadFilename("report_v2.pdf")).toBe("report_v2.pdf");
  });

  it("leaves genuine Latin-1 lookalikes untouched when they are not valid UTF-8 bytes", () => {
    // A real 'Ø' followed by ASCII is NOT a valid UTF-8 sequence → no repair.
    expect(decodeUploadFilename("SØREN.pdf")).toBe("SØREN.pdf");
    expect(decodeUploadFilename("café.pdf")).toBe("café.pdf");
  });

  it("double-mangled names need two passes (backfill runs the loop twice)", () => {
    const original = "تقرير.pdf";
    const twice = mangle(mangle(original));
    const once = decodeUploadFilename(twice);
    expect(decodeUploadFilename(once)).toBe(original);
  });
});
