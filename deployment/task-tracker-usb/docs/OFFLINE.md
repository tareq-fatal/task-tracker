# Offline-Betrieb — alle möglichen Außenverbindungen

Für den On-Premise-Betrieb ohne Internet (Daten dürfen das Haus nicht
verlassen). Stand: Paket 1.2.0.

**Ergebnis:** Die App baut im Betrieb **keine** Verbindung nach außen auf,
solange kein Fremddienst per Umgebungsvariable konfiguriert ist. Einzige
Ausnahme ohne Konfiguration war `/api-docs` (Swagger-UI von unpkg.com) — mit
`TT_OFFLINE=1` abgeschaltet. `install.sh --offline` setzt das automatisch und
lässt alle Dienst-Variablen leer.

## Was `install.sh --offline` macht

| Maßnahme | Wo | Wirkung |
| --- | --- | --- |
| `TT_OFFLINE=1` | `.env` | `/api-docs` zeigt nur einen Hinweis + Link auf `/api/openapi.json`, lädt nichts von unpkg.com |
| keine VAPID-Schlüssel | `.env` (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` leer) | Web-Push aus — Push läuft immer über die Push-Dienste der Browser-Hersteller (Google FCM, Mozilla, Apple) im Internet |
| keine Mail-Konfiguration | `.env` (`SMTP_*`, `RESEND_API_KEY` leer) | kein Mailversand. Ein Mailserver **im eigenen Netz** (`SMTP_HOST=mail.intern`) ist erlaubt |
| `TT_PULL_POLICY=never` | `.env` → `docker-compose.yml` `pull_policy` | Docker lädt nie ein Image nach; alle Images kommen aus `images/` (install.sh prüft `task-tracker:<VERSION>`, `postgres:16-alpine`, `caddy:2-alpine`) |
| `--no-build` | `install.sh`/`update.sh` (`compose up -d --no-build`) | der `build:`-Abschnitt in `docker-compose.yml` wird offline nie benutzt |
| `CHECKPOINT_DISABLE=1` | `.env` (alle Installationen) | die Prisma-CLI (`migrate deploy` bei jedem Start) fragt nicht bei `checkpoint.prisma.io` nach Updates |
| `NEXT_TELEMETRY_DISABLED=1` | `Dockerfile` (schon vorher) | keine Next.js-Telemetrie |
| `--tls internal` (Standard) | `templates/Caddyfile.internal` | Zertifikate aus Caddys eigener CA: `local_certs` (kein ACME/Let's Encrypt), `ocsp_stapling off` (kein OCSP-Abruf), `skip_install_trust` |

`--tls domain` braucht Let's Encrypt und damit Internet — install.sh warnt bei
`--offline --tls domain`. `--tls http` hat gar kein Zertifikat.

## Jede mögliche Außenverbindung der App

Alle Stellen sind **serverseitig** (Container `app`), außer wo „Browser“ steht.
„Aus“ heißt: ohne die genannte Variable wird der Code-Pfad nie erreicht.

| Dienst | Fundstelle | Ziel | Aktiv nur wenn | Offline-Installation |
| --- | --- | --- | --- | --- |
| Swagger-UI (API-Doku) | `src/app/api-docs/swagger-ui.tsx` (Browser) | `unpkg.com` | `/api-docs` aufgerufen **und** `TT_OFFLINE` nicht gesetzt | aus (`TT_OFFLINE=1`, `src/app/api-docs/page.tsx`, `src/lib/offline.ts`) |
| E-Mail über Resend | `src/lib/email.ts:44` | `api.resend.com` | `RESEND_API_KEY` | leer → aus |
| E-Mail über SMTP | `src/lib/email.ts` / `src/lib/email-config.ts` | `SMTP_HOST` | `SMTP_HOST` | leer → aus (interner Mailserver möglich) |
| Web-Push | `src/lib/push.ts` (`web-push`) | Endpoint der Browser-Subscription (FCM/Mozilla/Apple) | `NEXT_PUBLIC_VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` | leer → aus; ohne Public Key abonniert auch der Browser nichts (`src/components/push-bootstrap.tsx`) |
| Android-Push (FCM) | `src/lib/notifications.ts:172-179` | `fcm.googleapis.com` | `FCM_SERVER_KEY` | nicht gesetzt → aus |
| Telegram | `src/lib/telegram.ts:6-39` | `api.telegram.org` | `TELEGRAM_BOT_TOKEN` | leer → aus |
| SSO Google / Microsoft / GitHub / Apple | `src/lib/sso.ts:65-165`, `src/app/api/auth/[provider]/*` | `accounts.google.com`, `login.microsoftonline.com`, `github.com`, `appleid.apple.com` … | `AZURE_AD_`/`GOOGLE_`/`GITHUB_`/`APPLE_CLIENT_ID` + `…_CLIENT_SECRET` (`isProviderConfigured`) | nicht gesetzt → aus, Login nur mit Benutzername/Passwort |
| Microsoft Planner-Sync | `src/lib/graph.ts:12-127` | `graph.microsoft.com` | `AZURE_AD_CLIENT_ID` + `AZURE_AD_CLIENT_SECRET` | nicht gesetzt → aus |
| Übersetzung (LibreTranslate) | `src/lib/translate.ts:20-53` | `LIBRETRANSLATE_URL` | `LIBRETRANSLATE_URL` | nicht gesetzt → aus (eine **eigene** LibreTranslate-Instanz im LAN wäre möglich). `DEEPL_API_KEY` ist tot (siehe Kommentar dort) |
| Sprachnotiz-Transkription (Whisper) | `src/lib/transcription.ts:20-44` | `WHISPER_API_URL` (Standard `api.openai.com`) | `VOICE_TRANSCRIPTION=true` **und** `WHISPER_API_KEY` | `false`/leer → aus |
| Umami-Analytics | `src/lib/analytics.ts`, `src/components/analytics-script.tsx` (Browser + Server) | `NEXT_PUBLIC_UMAMI_SRC` | `NEXT_PUBLIC_UMAMI_SRC` **und** `NEXT_PUBLIC_UMAMI_WEBSITE_ID` (beim Build) | im Offline-Image nicht gesetzt → aus |
| Sentry | `sentry.server.config.ts`, `sentry.edge.config.ts`, `src/instrumentation-client.ts` | `*.sentry.io` | `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | leer → kein Versand. Source-Map-Upload nur beim Build mit `SENTRY_AUTH_TOKEN` |
| Ausgehende Webhooks | `src/lib/webhooks-dispatch.ts:39` | vom Admin eingetragene URL | ein Admin legt unter Admin → Webhooks einen Webhook an | keiner angelegt → aus |

### Keine Außenverbindung (nur Links/Texte)

- Adresse der Instanz (`src/lib/instance-url.ts`): Basis für erzeugte
  **Links** (Einladungen, E-Mails, canonical/OG, API-Beschreibung), kein Abruf.
  Die Installation setzt `APP_URL`/`TT_PUBLIC_URL` auf die eigene Adresse; das
  vorgefertigte Image enthält nur den neutralen Platzhalter
  `https://task-tracker.local`.
- `https://t.me/...` (`src/actions/telegram.ts`): Link, nur mit Telegram-Bot.
- Schriften `next/font/google` (`src/app/layout.tsx`, Inter + Cairo): werden
  beim **Build** heruntergeladen und ins Image eingebettet; zur Laufzeit wird
  nichts von Google geladen. (Der Build des Offline-Pakets läuft beim
  Herausgeber mit Internet — `make-bundle.sh --offline`.)
- Service Worker (`public/sw.js`, next-pwa/Workbox): cacht nur, was die Seite
  selbst lädt.
- Doku-Links (`docs.sentry.io`, `nextjs.org`, `github.com/...` in
  Kommentaren/OpenAPI-Texten): kein Abruf.

## Außerhalb der App

| Komponente | Außenverbindung | Offline |
| --- | --- | --- |
| Caddy `--tls internal` | keine: `local_certs`, `ocsp_stapling off`, `skip_install_trust`; Caddy v2 hat keine Telemetrie | ✓ |
| Caddy `--tls domain` | Let's Encrypt (ACME) + OCSP | ✗ braucht Internet |
| PostgreSQL | keine | ✓ |
| Docker | `pull` nur online; offline `pull_policy: never` | ✓ |
| install.sh | `get.docker.com` nur wenn Docker fehlt **und** online; offline aus `packages/<jammy\|noble>/` | ✓ mit `--debs`-Bundle |
| Backup-Timer | lokal (`/var/backups/task-tracker`, Modus 700, unverschlüsselt) | ✓ |
| `.run`-Installer | keine: Prüfsumme und Entpacken lokal, ruft `install.sh --offline` | ✓ |

## Nachprüfen auf dem Server

```bash
# Konfigurierte Fremddienste in der .env (alles leer — nur TT_OFFLINE=1):
sudo grep -E '^(RESEND_API_KEY|SMTP_HOST|TELEGRAM_BOT_TOKEN|FCM_SERVER_KEY|SENTRY_DSN|NEXT_PUBLIC_SENTRY_DSN|WHISPER_API_KEY|LIBRETRANSLATE_URL|[A-Z_]*CLIENT_ID|VAPID_PRIVATE_KEY|TT_OFFLINE)=' /opt/task-tracker/.env
```

Am sichersten: ausgehenden Verkehr des Servers in der Firewall sperren — die
Installation funktioniert offline vollständig.
