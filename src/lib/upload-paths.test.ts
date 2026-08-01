import { describe, expect, it } from "vitest";
import path from "path";
import { UPLOAD_ROOT, resolveUploadPath } from "./upload-paths";

describe("resolveUploadPath (K-6)", () => {
  it("maps stored web paths into UPLOAD_ROOT", () => {
    expect(resolveUploadPath("/uploads/abc123.pdf")).toBe(
      path.join(UPLOAD_ROOT, "abc123.pdf")
    );
    expect(resolveUploadPath("/uploads/exports/job1.xlsx")).toBe(
      path.join(UPLOAD_ROOT, "exports", "job1.xlsx")
    );
    expect(resolveUploadPath("/uploads/tenants/marine/logo.png?v=123")).toBe(
      path.join(UPLOAD_ROOT, "tenants", "marine", "logo.png")
    );
  });

  it("rejects traversal and absolute-path escapes", () => {
    expect(resolveUploadPath("/uploads/../../etc/passwd")).toBeNull();
    expect(resolveUploadPath("../secrets.env")).toBeNull();
    // URL-encoded dots are a LITERAL file name, not a traversal — must stay
    // inside the root (and will simply 404 on readFile).
    const encoded = resolveUploadPath("/uploads/..%2F..");
    expect(encoded).not.toBeNull();
    expect(encoded!.startsWith(path.resolve(UPLOAD_ROOT))).toBe(true);
  });

  it("UPLOAD_ROOT is outside public/", () => {
    expect(UPLOAD_ROOT.split(path.sep)).not.toContain("public");
  });
});
