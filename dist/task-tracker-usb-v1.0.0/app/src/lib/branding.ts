// Per-tenant white-label branding: theme presets, hex→HSL, CSS-var overrides.
// Pure + unit-tested.

export type ThemeName = "ocean-pro" | "sage-modern" | "coral-energy" | "custom" | "dark-only" | "light-only";
export type Scheme = "auto" | "dark" | "light";
export type Branding = { primary: string; secondary: string; accent: string; scheme: Scheme };

export const THEMES: { name: ThemeName; label: string; primary: string; secondary: string; accent: string; scheme: Scheme }[] = [
  { name: "ocean-pro", label: "Ocean-Pro", primary: "#4f46e5", secondary: "#c026d3", accent: "#ec4899", scheme: "auto" },
  { name: "sage-modern", label: "Sage-Modern", primary: "#059669", secondary: "#10b981", accent: "#fb923c", scheme: "auto" },
  { name: "coral-energy", label: "Coral-Energy", primary: "#f43f5e", secondary: "#fb7185", accent: "#fbbf24", scheme: "auto" },
  { name: "custom", label: "Custom", primary: "#4f46e5", secondary: "#c026d3", accent: "#ec4899", scheme: "auto" },
  { name: "dark-only", label: "Dark-Only", primary: "#6366f1", secondary: "#a855f7", accent: "#ec4899", scheme: "dark" },
  { name: "light-only", label: "Light-Only", primary: "#4f46e5", secondary: "#c026d3", accent: "#ec4899", scheme: "light" },
];

const DEFAULT = THEMES[0];

type TenantBrand = { themeName?: string | null; primaryColor?: string | null; secondaryColor?: string | null; accentColor?: string | null };

/** Resolve the effective colours + scheme for a tenant. Custom uses the tenant's
 *  own colours; a preset theme uses its palette. */
export function resolveBranding(t: TenantBrand): Branding {
  const preset = THEMES.find((x) => x.name === t.themeName) ?? DEFAULT;
  if (preset.name === "custom") {
    return {
      primary: t.primaryColor || DEFAULT.primary,
      secondary: t.secondaryColor || DEFAULT.secondary,
      accent: t.accentColor || DEFAULT.accent,
      scheme: "auto",
    };
  }
  return { primary: preset.primary, secondary: preset.secondary, accent: preset.accent, scheme: preset.scheme };
}

/** Convert #rrggbb to the shadcn HSL triplet "H S% L%". */
export function hexToHsl(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "243 75% 59%"; // fall back to indigo
  const int = parseInt(m[1], 16);
  const r = ((int >> 16) & 255) / 255, g = ((int >> 8) & 255) / 255, b = (int & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r: h = ((g - b) / d) % 6; break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/** CSS to inject into the app root, overriding the Ocean-Pro defaults. */
export function brandStyle(b: Branding): string {
  const p = hexToHsl(b.primary), s = hexToHsl(b.secondary), a = hexToHsl(b.accent);
  return `:root{--brand-from:${p};--brand-via:${s};--brand-to:${a};--primary:${p};--ring:${p};}`;
}
