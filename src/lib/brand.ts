// TOF-0791 (Tarek 30.10.2026): Name der Instanz in der Oberfläche, z. B. für
// eine getrennte Instanz. NEXT_PUBLIC_APP_NAME wird beim `next build` eingesetzt
// (Docker build-arg); leer/nicht gesetzt = bisheriges Verhalten (je Sprache
// „متعقب المهام“, „Task Tracker“ …).
//
// TOF-0795 (Tarek 31.10.2026): Name zur LAUFZEIT. Vorrang:
//   APP_NAME (Runtime-Env, Server)  >  NEXT_PUBLIC_APP_NAME (Build)  >  Standard je Sprache.
// APP_NAME wirkt nur serverseitig (getDictionary, SEO, Login …); Client-
// Komponenten bekommen den Namen vom Server als Prop des I18nProvider. Ohne
// APP_NAME ist alles wie vorher.

/** Build-Zeit-Name (NEXT_PUBLIC_APP_NAME, beim Build eingesetzt). */
export const BRAND_NAME: string | null = normalizeBrandName(process.env.NEXT_PUBLIC_APP_NAME);

/** Leer/Leerzeichen → null; sonst getrimmt und auf 80 Zeichen begrenzt. */
export function normalizeBrandName(v: string | undefined | null): string | null {
  const s = (v || "").replace(/\s+/g, " ").trim().slice(0, 80);
  return s || null;
}

/** Reine Vorrang-Regel: Laufzeit > Build > null (= Standard je Sprache). */
export function resolveBrandName(runtime: string | undefined | null, build: string | undefined | null): string | null {
  return normalizeBrandName(runtime) ?? normalizeBrandName(build);
}

/** Nur der Laufzeit-Name (APP_NAME); auf dem Client immer null. */
export function runtimeBrandName(env: Record<string, string | undefined> = process.env): string | null {
  return normalizeBrandName(env.APP_NAME);
}

/** Wirksamer Instanz-Name auf dem Server: APP_NAME > NEXT_PUBLIC_APP_NAME > null. */
export function brandName(env: Record<string, string | undefined> = process.env): string | null {
  return resolveBrandName(env.APP_NAME, env === process.env ? BRAND_NAME : env.NEXT_PUBLIC_APP_NAME);
}

/** Setzt „app.name“ in allen Wörterbüchern auf den Instanz-Namen (nur wenn gesetzt). */
export function applyBrandToDictionaries<T extends Record<string, Record<string, string>>>(
  dicts: T,
  brand: string | null
): T {
  if (!brand) return dicts;
  for (const d of Object.values(dicts)) d["app.name"] = brand;
  return dicts;
}

type Copy = { appName: string; title: string; description: string };

/** SEO-Texte: Produktname überall durch den Instanz-Namen ersetzen (nur wenn gesetzt). */
export function applyBrandToSeo<T extends Record<string, Copy>>(copy: T, brand: string | null): T {
  if (!brand) return copy;
  for (const c of Object.values(copy)) {
    const orig = c.appName;
    c.appName = brand;
    c.title = c.title.split(orig).join(brand);
    c.description = c.description.split(orig).join(brand);
  }
  return copy;
}
