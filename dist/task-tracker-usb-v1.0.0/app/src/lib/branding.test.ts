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
  it("uses a preset palette for a named theme", () => {
    const b = resolveBranding({ themeName: "sage-modern", primaryColor: "#ff0000" });
    expect(b.primary).toBe("#059669"); // preset wins over tenant colour for presets
    expect(b.scheme).toBe("auto");
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
});
