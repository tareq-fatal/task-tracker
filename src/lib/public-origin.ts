// TOF-0794 (Test 31.10.2026): Basis-Adresse für Weiterleitungen aus Route-Handlern.
// Hinter einem Reverse-Proxy (Caddy) enthält `req.url` im Next-Standalone-Server
// die INTERNE Adresse (z. B. https://0.0.0.0:3000) — eine Weiterleitung dorthin
// führt ins Leere (live im On-Prem-Test: Abmelden → 0.0.0.0:3000/login).
// Darum: Host/Proto aus den Kopfzeilen, die der Proxy mitschickt; sonst req.url.

const HOST_RE = /^(?:[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*|\[[0-9A-Fa-f:]+\])(?::\d{1,5})?$/;

export function publicOrigin(req: Request): string {
  const h = req.headers;
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(",")[0].trim();
  const fallback = new URL(req.url);
  if (!host || !HOST_RE.test(host) || host.startsWith("0.0.0.0")) return fallback.origin;
  const fwd = (h.get("x-forwarded-proto") ?? "").split(",")[0].trim().toLowerCase();
  const proto = fwd === "http" || fwd === "https" ? fwd : fallback.protocol.replace(":", "");
  return `${proto}://${host}`;
}
