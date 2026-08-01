import { describe, it, expect } from "vitest";
import { hexToHsl, resolveBranding, brandStyle, THEMES } from "./branding";

describe("hexToHsl", () => {
  it("converts primaries correctly", () => {
    expect(hexToHsl("#000000")).toBe("0 0% 0%");
    expect(hexToHsl("#ffffff")).toBe("0 0% 100%");
    expect(hexToHsl("#ff0000")).toBe("0 100% 50%");
    expect(hexToHsl("#00ff00")).toBe("120 100% 50%");
    expect(hexToHsl("#0000ff")).toBe("240 100% 50%");
  });
  it("matches the Ocean-Pro indigo default", () => {
    expect(hexToHsl("#4f46e5")).toBe("243 75% 59%");
  });
  it("falls back on bad input", () => {
    expect(hexToHsl("nope")).toBe("243 75% 59%");
  });
});

describe("resolveBranding", () => {
  it("saved tenant colours override the preset palette (Bug 4, 2026-08)", () => {
    const b = resolveBranding({ themeName: "sage-modern", primaryColor: "#28238b" });
    expect(b.primary).toBe("#28238b"); // the customer's saved colour wins
    expect(b.secondary).toBe("#10b981"); // unset colours fall back to the preset
    expect(b.scheme).toBe("auto");
  });

  it("uses the pure preset palette when no colours are stored", () => {
    const b = resolveBranding({ themeName: "sage-modern" });
    expect(b.primary).toBe("#059669");
    expect(b.accent).toBe("#fb923c");
  });
  it("uses the tenant's own colours for custom", () => {
    const b = resolveBranding({ themeName: "custom", primaryColor: "#123456", accentColor: "#abcdef" });
    expect(b.primary).toBe("#123456");
    expect(b.accent).toBe("#abcdef");
  });
  it("dark-only carries the dark scheme", () => {
    expect(resolveBranding({ themeName: "dark-only" }).scheme).toBe("dark");
  });
  it("falls back to ocean-pro for unknown themes", () => {
    expect(resolveBranding({ themeName: "bogus" }).primary).toBe(THEMES[0].primary);
  });
});

describe("brandStyle", () => {
  it("emits overrides for the brand + primary vars", () => {
    const css = brandStyle(resolveBranding({ themeName: "ocean-pro" }));
    expect(css).toContain("--brand-from:243 75% 59%");
    expect(css).toContain("--primary:243 75% 59%");
  });

  it("scopes to :root AND .dark so dark mode keeps tenant colours", () => {
    const css = brandStyle(resolveBranding({ themeName: "ocean-pro" }));
    expect(css.startsWith(":root,.dark{")).toBe(true);
  });

  it("picks a readable foreground for light brand colours", () => {
    const dark = brandStyle(resolveBranding({ themeName: "custom", primaryColor: "#28238b" }));
    expect(dark).toContain("--brand-foreground:0 0% 100%");
    const light = brandStyle(resolveBranding({ themeName: "custom", primaryColor: "#fbbf24" }));
    expect(light).toContain("--brand-foreground:222 47% 11%");
  });
});
