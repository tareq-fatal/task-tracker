import { describe, it, expect } from "vitest";
import { isInlineViewable, isImageMime } from "./attachment-view";

describe("attachment-view", () => {
  it("serves images and pdf inline", () => {
    for (const m of ["image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf"]) {
      expect(isInlineViewable(m)).toBe(true);
    }
  });

  it("never inlines script-capable or unknown types", () => {
    for (const m of ["image/svg+xml", "text/html", "application/zip", "text/csv", "application/msword", ""]) {
      expect(isInlineViewable(m)).toBe(false);
    }
  });

  it("isImageMime excludes svg and non-images", () => {
    expect(isImageMime("image/png")).toBe(true);
    expect(isImageMime("image/svg+xml")).toBe(false);
    expect(isImageMime("application/pdf")).toBe(false);
    expect(isImageMime("text/plain")).toBe(false);
  });
});
