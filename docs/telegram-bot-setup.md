# Telegram-Bot — Setup & Betrieb

Task-Tracker-Benachrichtigungen zusätzlich per Telegram. Der Bot spiegelt die
Push-Trigger: Aufgabe zugewiesen, Kommentar, @Mention, Statuswechsel bei
High/Critical, Deadline < 24 h. Nachrichten sind in der Sprache des Empfängers
(AR/DE/EN) und tragen einen Inline-Button zur Aufgabe.

## 1. Bot anlegen (einmalig, via BotFather)

1. In Telegram `@BotFather` öffnen → `/newbot` → Name + Username vergeben.
2. Den ausgegebenen **Token** kopieren.
3. Empfohlen bei BotFather:
   - `/setdescription` → „Task-Tracker Benachrichtigungen für Coast Shield“
   - `/setcommands` →
     ```
     start - Konto verbinden
     unlink - Verbindung trennen
     mute - Benachrichtigungen pausieren
     unmute - wieder aktivieren
     help - Hilfe
     ```
   (Beides geht auch per API: `setMyDescription` / `setMyCommands`.)

## 2. Server-Konfiguration

In `/home/marisight/marisight/infra/prod/.env.task-tracker` (NIE in Git):

```
TELEGRAM_BOT_TOKEN=<Token von BotFather>
TELEGRAM_BOT_USERNAME=<BotUsername ohne @>
TELEGRAM_WEBHOOK_SECRET=<zufälliger Hex-String, z. B. openssl rand -hex 24>
```

Danach Container neu erstellen (`docker compose up -d --force-recreate task-tracker`).

## 3. Webhook registrieren (einmalig, nach jedem Token-Wechsel)

```bash
curl -s "https://api.telegram.org/bot$TOKEN/setWebhook" \
  -d "url=https://tasks.coastshield.net/api/telegram/webhook" \
  -d "secret_token=$TELEGRAM_WEBHOOK_SECRET" \
  -d 'allowed_updates=["message"]'
```

Telegram sendet den `secret_token` bei jedem Update im Header
`X-Telegram-Bot-Api-Secret-Token` mit — der Webhook lehnt alles andere mit 401
ab. Status prüfen: `curl "https://api.telegram.org/bot$TOKEN/getWebhookInfo"`.

## 4. Wie User sich verbinden

App → **Einstellungen → „Mit Telegram verbinden“** → öffnet
`t.me/<bot>?start=<einmal-token>` → in Telegram **Start** tippen → fertig.
Der Bot bestätigt in der App-Sprache des Users. `/unlink` trennt, `/mute`
pausiert, `/unmute` reaktiviert.

## 5. Technik-Notizen

- Kanal-Logik: Telegram folgt der **webPush**-Präferenz des Events — gleiche
  Trigger und Masken wie Browser-Push (Status nur High/Critical usw.). Kein
  eigener Spalten-Satz in `NotificationPreference` nötig.
- Kein Chat verknüpft / `telegramMuted` → stiller Skip, nie ein Fehler.
- Antwortet der Bot-API-Call mit 403 (User hat den Bot blockiert), wird die
  Verknüpfung automatisch gelöst.
- Sende-Ergebnisse landen im Container-Log: `docker logs task-tracker | grep telegram`.
- DB-Felder: `User.telegramChatId`, `User.telegramLinkToken` (einmalig, wird
  nach dem Link gelöscht), `User.telegramMuted`
  (Migration `20260719120000_telegram`).
