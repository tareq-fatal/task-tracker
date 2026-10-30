// TOF-0791 (Tarek 30.10.2026): Name der Instanz in der Oberfläche, z. B.
// „Objektus“ für die getrennte Objektus-Instanz (tasks.objektus.app).
// NEXT_PUBLIC_APP_NAME wird beim `next build` eingesetzt (Docker build-arg);
// leer/nicht gesetzt = bisheriges Verhalten (je Sprache „متعقب المهام“, „Task Tracker“ …).

export const BRAND_NAME: string | null = (process.env.NEXT_PUBLIC_APP_NAME || "").trim() || null;

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
