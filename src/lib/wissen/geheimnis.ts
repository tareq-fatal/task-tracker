// TOF-0839: Geheimnis-Wächter für jeden Schreibweg ins Projekt-Wissen (UI, MCP, Import) und
// für den alten „Kontext für Claude“. Reine Funktion, ohne DB — damit testbar.
//
// Ziel ist nicht Perfektion, sondern: nichts, was wie ein Zugangsdatum AUSSIEHT, landet in
// einem Text, den jede KI-Sitzung liest. Die Meldung nennt die Zeile und die Art, NIE den Wert.

export type GeheimnisFund = { zeile: number; art: string };

type Regel = { art: string; re: RegExp };

const REGELN: Regel[] = [
  { art: "Task-Tracker-Token", re: /\btt_mcp_[A-Za-z0-9]{8,}/ },
  { art: "API-Schlüssel (sk-…)", re: /\bsk-(?:ant-|proj-|live-|test-)?[A-Za-z0-9_-]{16,}/ },
  { art: "GitHub-Token", re: /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/ },
  { art: "AWS-Zugangsschlüssel", re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { art: "Slack-Token", re: /\bxox[abpors]-[A-Za-z0-9-]{10,}/ },
  { art: "Google-API-Schlüssel", re: /\bAIza[0-9A-Za-z_-]{30,}/ },
  { art: "JWT", re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/ },
  { art: "privater Schlüssel", re: /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----/ },
  // Verbindungszeichenfolge mit Passwort: postgres://user:geheim@host
  { art: "Passwort in einer Adresse", re: /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:[^\s@/]{3,}@/i },
];

// „Passwort: Wert“ — aber NICHT „Passwort: siehe Passwort-Manager“, „Passwort: <leer>“ usw.
const SCHLUESSELWORT =
  /\b(?:password|passwort|passwd|pwd|kennwort|secret|client[_-]?secret|api[_-]?key|access[_-]?key|private[_-]?key)\b\s*[:=]\s*(\S.*)$/i;
// .env-Zeilen: SESSION_SECRET=…, DB_PASSWORD: …, GITHUB_TOKEN=…
const ENV_ZEILE = /\b[A-Z0-9_]*(?:SECRET|PASSWORD|PASSWD|TOKEN|API_KEY|PRIVATE_KEY)\s*[:=]\s*(\S.*)$/;
const PLATZHALTER =
  /^(?:["'`]?\s*)(?:<[^>]*>|\*{3,}|x{3,}|\.{3}|…|-|—|–|\(|\[|siehe\b|see\b|im\b|in\b|bei\b|nicht\b|kein|none\b|n\/a\b|leer\b|tresor|vault|passwort-?manager|password[- ]?manager|keepass|bitwarden|1password|\$\{|\$[A-Z_]|%[A-Z_]+%|env\b|process\.env)/i;

/** Lange, zufällig aussehende Zeichenketten (Base64/Hex). Pfade und Git-Hashes bleiben erlaubt. */
function langeZufallskette(zeile: string): boolean {
  for (const m of zeile.matchAll(/[A-Za-z0-9+/=_-]{40,}/g)) {
    const s = m[0];
    // Viele Schrägstriche = Pfad, kein Schlüssel.
    if ((s.match(/\//g) ?? []).length > 2) continue;
    // Reines Hex: 40 Zeichen sind ein Git-Hash; erst ab 48 wird es verdächtig (z. B. openssl rand -hex 32).
    if (/^[0-9a-f]+$/i.test(s)) {
      if (s.length >= 48) return true;
      continue;
    }
    // Base64-artig: Groß-, Kleinbuchstaben UND Ziffern gemischt.
    if (/[A-Z]/.test(s) && /[a-z]/.test(s) && /[0-9]/.test(s)) return true;
  }
  return false;
}

/** Erster Fund (Zeile 1-basiert) oder null. */
export function findeGeheimnis(text: string): GeheimnisFund | null {
  const zeilen = text.replace(/\r\n/g, "\n").split("\n");
  for (let i = 0; i < zeilen.length; i++) {
    const z = zeilen[i];
    for (const r of REGELN) if (r.re.test(z)) return { zeile: i + 1, art: r.art };
    const k = SCHLUESSELWORT.exec(z) ?? ENV_ZEILE.exec(z);
    if (k && !PLATZHALTER.test(k[1].trim())) return { zeile: i + 1, art: "Passwort/Schlüssel mit Wert" };
    if (langeZufallskette(z)) return { zeile: i + 1, art: "lange Zufallszeichenkette (Schlüssel?)" };
  }
  return null;
}

/** Deutsche Fehlermeldung — nennt Zeile und Art, nie den Wert. */
export function geheimnisMeldung(f: GeheimnisFund, feld?: string): string {
  const wo = feld ? `${feld}, Zeile ${f.zeile}` : `Zeile ${f.zeile}`;
  return `${wo} sieht nach einem Zugangsdatum aus (${f.art}). Bitte entfernen — Zugangsdaten gehören in den Passwort-Manager, nicht ins Wissen.`;
}

/** Prüft mehrere Felder; gibt die erste Fehlermeldung zurück oder null. */
export function pruefeAufGeheimnisse(felder: Record<string, string | null | undefined>): string | null {
  for (const [name, wert] of Object.entries(felder)) {
    if (!wert) continue;
    const f = findeGeheimnis(wert);
    if (f) return geheimnisMeldung(f, name);
  }
  return null;
}
