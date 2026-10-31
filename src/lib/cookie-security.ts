// TOF-0794 (Tarek 31.10.2026): `secure`-Flag der sicherheitsrelevanten Cookies
// (Sitzung tt_session, SSO-State) an EINER Stelle.
//
// Bisher galt hart `secure: NODE_ENV === "production"` — im LAN ohne TLS
// (on-prem `install.sh --tls http`, reiner Zugriff über http://IP:Port) setzt
// der Browser ein Secure-Cookie über HTTP nie, die Anmeldung war unmöglich.
//
//   COOKIE_SECURE nicht gesetzt/leer → bisheriges Verhalten (secure in production)
//   COOKIE_SECURE="true"             → immer secure
//   COOKIE_SECURE="false"            → nie secure (nur für HTTP-only-LAN!)
//
// Bestehende Instanzen setzen die Variable nicht und ändern sich daher nicht.
// Zur Laufzeit gelesen (kein NEXT_PUBLIC_), also per .env + Neustart änderbar.

type Env = Record<string, string | undefined>;

export function cookieSecure(env: Env = process.env): boolean {
  const v = (env.COOKIE_SECURE ?? "").trim().toLowerCase();
  if (v === "true" || v === "1" || v === "yes") return true;
  if (v === "false" || v === "0" || v === "no") return false;
  return env.NODE_ENV === "production";
}
