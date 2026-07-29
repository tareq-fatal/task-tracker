import { describe, expect, it } from "vitest";
import { safeReturnUrl } from "./return-url";

describe("safeReturnUrl", () => {
  it("passes through same-origin relative paths (Telegram deep links)", () => {
    expect(safeReturnUrl("/tasks/abc123?src=tg")).toBe("/tasks/abc123?src=tg");
    expect(safeReturnUrl("/projects/xyz")).toBe("/projects/xyz");
  });

  it("rejects open-redirect attempts", () => {
    expect(safeReturnUrl("https://evil.example")).toBe("/");
    expect(safeReturnUrl("//evil.example")).toBe("/");
    expect(safeReturnUrl("/\\evil.example")).toBe("/");
    expect(safeReturnUrl("javascript:alert(1)")).toBe("/");
  });

  it("avoids login loops and handles empty input", () => {
    expect(safeReturnUrl("/login?returnUrl=/tasks/x")).toBe("/");
    expect(safeReturnUrl("")).toBe("/");
    expect(safeReturnUrl(null)).toBe("/");
    expect(safeReturnUrl(undefined)).toBe("/");
  });
});
