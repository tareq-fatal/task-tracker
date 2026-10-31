// TOF-0795 (Tarek 31.10.2026): Schalter für Installationen aus dem On-Prem-Paket
// (deployment/task-tracker-usb). install.sh setzt TT_ONPREM=1 in die .env —
// Laufzeit, kein Build-Wert. Ohne die Variable (Live-Instanz) ändert sich nichts.

export type Env = Record<string, string | undefined>;

/** true, wenn diese Instanz aus dem On-Prem-Paket installiert wurde. */
export function isOnPrem(env: Env = process.env): boolean {
  const v = (env.TT_ONPREM || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/**
 * Android-APK-Download anbieten? Die APK ist für einen fremden Server gebaut —
 * auf On-Prem-Instanzen daher aus (die PWA-Installation bleibt).
 */
export function apkDownloadEnabled(env: Env = process.env): boolean {
  return !isOnPrem(env);
}
