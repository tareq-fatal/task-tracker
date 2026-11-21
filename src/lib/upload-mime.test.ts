import { describe, it, expect } from "vitest";
import { resolveUploadMime, sniffMime } from "./upload-mime";

const b = (...bytes: number[]) => new Uint8Array(bytes);
const ascii = (s: string) => new Uint8Array(Buffer.from(s, "latin1"));
const PDF = ascii("%PDF-1.7\n...");
const PNG = b(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0);
const ZIP = b(0x50, 0x4b, 0x03, 0x04, 0x14, 0);
const OLE = b(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0);
const WEBP = ascii("RIFF\0\0\0\0WEBPVP8 ");

describe("resolveUploadMime", () => {
  it("keeps an allowed declared type unchanged (no behaviour change)", () => {
    expect(resolveUploadMime("application/pdf", "a.pdf", PDF)).toBe("application/pdf");
    expect(resolveUploadMime("image/png", "x.png", PNG)).toBe("image/png");
  });

  it("Kunden-Report 2026-11-21: PDF with EMPTY type from a mobile picker is accepted", () => {
    expect(resolveUploadMime("", "Markennamen_Vergleich.pdf", PDF)).toBe("application/pdf");
  });

  it("PDF sent as application/octet-stream is accepted", () => {
    expect(resolveUploadMime("application/octet-stream", "Markennamen_Vergleich.pdf", PDF)).toBe(
      "application/pdf"
    );
  });

  it("trusts the signature over a misleading extension", () => {
    expect(resolveUploadMime("", "scan.txt", PDF)).toBe("application/pdf");
    expect(resolveUploadMime("", "bild.pdf", PNG)).toBe("image/png");
  });

  it("disambiguates ZIP/OLE families by extension", () => {
    expect(resolveUploadMime("", "Plan.docx", ZIP)).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    expect(resolveUploadMime("", "Budget.XLSX", ZIP)).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    expect(resolveUploadMime("", "archiv.zip", ZIP)).toBe("application/zip");
    expect(resolveUploadMime("", "unknown.bin", ZIP)).toBe("application/zip");
    expect(resolveUploadMime("", "alt.doc", OLE)).toBe("application/msword");
    expect(resolveUploadMime("", "alt.msi", OLE)).toBeNull();
  });

  it("accepts plain text by extension only when it has no NUL bytes", () => {
    expect(resolveUploadMime("", "liste.csv", ascii("a;b\n1;2"))).toBe("text/csv");
    expect(resolveUploadMime("", "notiz.txt", ascii("hallo"))).toBe("text/plain");
    expect(resolveUploadMime("", "fake.txt", b(0x4d, 0x5a, 0x00, 0x90))).toBeNull();
  });

  it("stays strict: explicit non-allowed types are never sniffed around", () => {
    expect(resolveUploadMime("text/html", "x.pdf", PDF)).toBeNull();
    expect(resolveUploadMime("image/svg+xml", "x.png", PNG)).toBeNull();
    expect(resolveUploadMime("application/x-msdownload", "x.zip", ZIP)).toBeNull();
  });

  it("rejects generic-typed files without a known signature", () => {
    expect(resolveUploadMime("", "page.html", ascii("<html><script>"))).toBeNull();
    expect(resolveUploadMime("application/octet-stream", "tool.exe", b(0x4d, 0x5a, 0x90, 0))).toBeNull();
    expect(resolveUploadMime("", "leer.pdf", b())).toBeNull();
  });
});

describe("sniffMime", () => {
  it("detects the supported image signatures", () => {
    expect(sniffMime(b(0xff, 0xd8, 0xff, 0xe0), "a")).toBe("image/jpeg");
    expect(sniffMime(ascii("GIF89a"), "a")).toBe("image/gif");
    expect(sniffMime(WEBP, "a")).toBe("image/webp");
    expect(sniffMime(ascii("RIFF\0\0\0\0WAVE"), "a")).toBeNull();
  });
});
