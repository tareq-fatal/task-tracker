import "server-only";
import { resolveEmailConfig, describeEmailConfig, type EmailConfig } from "./email-config";

// E-Mail-Versand. Zwei Wege, beide vollständig aus der Umgebung konfiguriert:
//
//   • SMTP    — SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, EMAIL_FROM
//   • Resend  — RESEND_API_KEY, EMAIL_FROM
//
// Ist keiner eingerichtet, ist der Versand ein No-op und die Anwendung läuft
// unverändert weiter. Welcher Weg genommen wird, entscheidet email-config.ts;
// hier steht nur noch, wie verschickt wird. Kein Zugangsdatum steht im Code.

let cached: EmailConfig | null = null;

function config(): EmailConfig {
  if (!cached) {
    cached = resolveEmailConfig(process.env);
    // Einmal beim ersten Versandversuch ins Protokoll — sonst rätselt man auf
    // dem Server, warum nichts ankommt.
    console.info(`[email] ${describeEmailConfig(cached)}`);
  }
  return cached;
}

/** Nur für Tests: Konfiguration neu einlesen. */
export function resetEmailConfigCache(): void {
  cached = null;
}

export function emailEnabled(): boolean {
  return config().transport !== "none";
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<boolean> {
  const cfg = config();
  if (cfg.transport === "none") return false;

  try {
    if (cfg.transport === "resend") {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cfg.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ from: cfg.from, to: opts.to, subject: opts.subject, html: opts.html }),
      });
      if (!res.ok) console.warn(`[email] Resend hat abgelehnt: ${res.status}`);
      return res.ok;
    }

    // SMTP. nodemailer wird absichtlich erst hier geladen: wer Resend nutzt
    // oder gar keine E-Mail, zieht die Abhängigkeit nie in den Prozess.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const nodemailer = require("nodemailer");
    const transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      ...(cfg.user && cfg.pass ? { auth: { user: cfg.user, pass: cfg.pass } } : {}),
    });
    await transporter.sendMail({
      from: cfg.from,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    });
    return true;
  } catch (err) {
    // Ein fehlgeschlagener Versand darf nie die auslösende Aktion mitreißen —
    // die Benachrichtigung im Programm ist bereits geschrieben.
    console.warn("[email] Versand fehlgeschlagen:", err);
    return false;
  }
}

/** Schlichte HTML-Mail in den Produktfarben. */
export function basicEmailTemplate(
  title: string,
  body: string,
  url?: string | null
): string {
  const base = config().baseUrl;
  const btn = url
    ? `<a href="${base}${url}" style="display:inline-block;margin-top:16px;padding:10px 18px;border-radius:10px;background:linear-gradient(110deg,#6366f1,#ec4899);color:#fff;text-decoration:none;font-weight:600">Im Task Tracker öffnen</a>`
    : "";
  return `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1f2937">
    <div style="font-weight:700;font-size:18px;background:linear-gradient(110deg,#6366f1,#ec4899);-webkit-background-clip:text;background-clip:text;color:transparent">Task Tracker</div>
    <h2 style="font-size:18px;margin:16px 0 4px">${escapeHtml(title)}</h2>
    <p style="color:#4b5563;line-height:1.5;white-space:pre-wrap">${escapeHtml(body)}</p>
    ${btn}
  </div>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
