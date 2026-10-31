// Welchen Versandweg nimmt die Anwendung, und ist er überhaupt vollständig
// eingerichtet? Rein und getestet — die Entscheidung darf nicht irgendwo im
// Versandcode versteckt liegen, sonst kann niemand nachsehen, warum keine
// E-Mail ankommt.
//
// Nichts davon steht im Code: Zugangsdaten und Absender kommen ausschließlich
// aus der Umgebung. Ist nichts gesetzt, ist der Versandweg `none` — die
// Anwendung läuft dann genau wie vorher, nur ohne E-Mail.

import { instanceUrl } from "./instance-url";

export type EmailTransport = "none" | "resend" | "smtp";

export type EmailConfig =
  | { transport: "none"; from: string; baseUrl: string; missing: string[] }
  | { transport: "resend"; from: string; baseUrl: string; apiKey: string; missing: [] }
  | {
      transport: "smtp";
      from: string;
      baseUrl: string;
      host: string;
      port: number;
      secure: boolean;
      user?: string;
      pass?: string;
      missing: [];
    };

export type Env = Record<string, string | undefined>;

// TOF-0795 (Tarek 31.10.2026): Standard-Absender und Link-Basis kommen aus der
// Adresse der Instanz (src/lib/instance-url.ts: APP_URL > NEXT_PUBLIC_APP_URL >
// Build-Adresse). Absender = „<APP_NAME oder Task Tracker> <noreply@<Host>>“ —
// ohne APP_URL/APP_NAME exakt wie bisher.
function defaultFrom(env: Env, baseUrl: string): string {
  let host = "localhost";
  try {
    host = new URL(baseUrl).hostname || host;
  } catch {
    /* unlesbare Adresse → localhost */
  }
  const name = (env.APP_NAME || "").replace(/[<>"\r\n]/g, "").trim() || "Task Tracker";
  return `${name} <noreply@${host}>`;
}

/**
 * Auflösen der Konfiguration.
 *
 * `EMAIL_TRANSPORT` erzwingt einen Weg (`resend` | `smtp` | `none`). Ohne die
 * Variable wird der Weg an den vorhandenen Zugangsdaten erkannt: erst SMTP,
 * dann Resend — wer einen eigenen Mailserver hinterlegt, meint auch ihn.
 *
 * `missing` nennt die Variablen, die für den GEWÄHLTEN Weg fehlen. Damit kann
 * die Anwendung beim Start sagen, was noch einzutragen ist, statt still nichts
 * zu verschicken.
 */
export function resolveEmailConfig(env: Env): EmailConfig {
  const baseUrl = instanceUrl(env);
  const from = env.EMAIL_FROM?.trim() || defaultFrom(env, baseUrl);

  const forced = env.EMAIL_TRANSPORT?.trim().toLowerCase();
  const wanted: EmailTransport =
    forced === "resend" || forced === "smtp" || forced === "none"
      ? forced
      : env.SMTP_HOST
        ? "smtp"
        : env.RESEND_API_KEY
          ? "resend"
          : "none";

  if (wanted === "none") return { transport: "none", from, baseUrl, missing: [] };

  if (wanted === "resend") {
    const apiKey = env.RESEND_API_KEY?.trim();
    if (!apiKey) return { transport: "none", from, baseUrl, missing: ["RESEND_API_KEY"] };
    return { transport: "resend", from, baseUrl, apiKey, missing: [] };
  }

  const host = env.SMTP_HOST?.trim();
  if (!host) return { transport: "none", from, baseUrl, missing: ["SMTP_HOST"] };
  const port = Number(env.SMTP_PORT ?? 587);
  if (!Number.isFinite(port) || port <= 0) {
    return { transport: "none", from, baseUrl, missing: ["SMTP_PORT"] };
  }
  // Port 465 spricht von der ersten Zeile an TLS; 587 und 25 beginnen im Klaren
  // und rüsten per STARTTLS auf. SMTP_SECURE überschreibt das, falls nötig.
  const secure = env.SMTP_SECURE ? env.SMTP_SECURE === "true" : port === 465;
  // Benutzer/Passwort sind optional: ein Relais im eigenen Netz verlangt oft
  // keine Anmeldung. Ist eines gesetzt, muss auch das andere gesetzt sein.
  const user = env.SMTP_USER?.trim() || undefined;
  const pass = env.SMTP_PASSWORD?.trim() || undefined;
  if (Boolean(user) !== Boolean(pass)) {
    return { transport: "none", from, baseUrl, missing: [user ? "SMTP_PASSWORD" : "SMTP_USER"] };
  }
  return { transport: "smtp", from, baseUrl, host, port, secure, user, pass, missing: [] };
}

/** Kurzfassung für ein Startprotokoll — nennt nie ein Passwort. */
export function describeEmailConfig(cfg: EmailConfig): string {
  if (cfg.transport === "none") {
    return cfg.missing.length
      ? `E-Mail ist AUS — es fehlt: ${cfg.missing.join(", ")}`
      : "E-Mail ist AUS (kein Versandweg konfiguriert)";
  }
  if (cfg.transport === "resend") return `E-Mail über Resend, Absender ${cfg.from}`;
  return `E-Mail über SMTP ${cfg.host}:${cfg.port}${cfg.secure ? " (TLS)" : ""}, Absender ${cfg.from}`;
}
