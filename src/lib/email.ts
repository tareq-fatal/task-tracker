import "server-only";
import { DEFAULT_LOCALE, dirForLocale, type Locale } from "./enums";
import { translate } from "./i18n";

// Email via Resend (https://resend.com). No-op when RESEND_API_KEY is unset, so
// the app runs fine without email configured. (PR-G will richen the templates.)
export const emailEnabled = Boolean(process.env.RESEND_API_KEY);

const FROM =
  process.env.EMAIL_FROM || "Task Tracker <noreply@tasks.coastshield.net>";

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<boolean> {
  if (!emailEnabled) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: FROM, to: opts.to, subject: opts.subject, html: opts.html }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Minimal branded HTML email, rendered in the recipient's language (RTL for Arabic). */
export function basicEmailTemplate(
  title: string,
  body: string,
  url?: string | null,
  locale: Locale = DEFAULT_LOCALE
): string {
  const dir = dirForLocale(locale);
  const brand = translate(locale, "app.name");
  const btn = url
    ? `<a href="https://tasks.coastshield.net${url}" style="display:inline-block;margin-top:16px;padding:10px 18px;border-radius:10px;background:linear-gradient(110deg,#6366f1,#ec4899);color:#fff;text-decoration:none;font-weight:600">${escapeHtml(translate(locale, "email.open"))}</a>`
    : "";
  return `<div dir="${dir}" lang="${locale}" style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1f2937;text-align:start">
    <div style="font-weight:700;font-size:18px;background:linear-gradient(110deg,#6366f1,#ec4899);-webkit-background-clip:text;background-clip:text;color:transparent">${escapeHtml(brand)}</div>
    <h2 style="font-size:18px;margin:16px 0 4px">${escapeHtml(title)}</h2>
    <p style="color:#4b5563;line-height:1.5">${escapeHtml(body)}</p>
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
