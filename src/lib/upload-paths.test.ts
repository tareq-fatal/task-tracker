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
    expect(resolveUploadPath("/uploads/..%2F..")).not.toContain("..%2F"); // literal name stays inside root
  });

  it("UPLOAD_ROOT is outside public/", () => {
    expect(UPLOAD_ROOT.split(path.sep)).not.toContain("public");
  });
});
