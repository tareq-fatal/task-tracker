# Telegram-Broadcast-Gruppe — Einrichtung (Weg 2)

Telegram erlaubt Bots **nicht**, User zu Gruppen hinzuzufügen (Anti-Spam-Policy).
Die Gruppe wird daher einmal manuell aufgesetzt; danach postet der Bot
ausgewählte Task-Ereignisse automatisch hinein.

## Schritte (einmalig, ~3 Minuten)

1. In Telegram eine **neue Gruppe** erstellen (z. B. „Coast Shield Operations").
2. **@CoastShieldHelpBot als Mitglied hinzufügen** und zum **Admin** machen
   (Gruppe → Mitglieder → Bot → „Zum Admin ernennen"; Posting-Recht reicht).
3. **Gruppen-Chat-ID ermitteln:** In der Gruppe eine beliebige Nachricht
   schreiben, dann im Browser öffnen:
   `https://api.telegram.org/bot<TOKEN>/getUpdates`
   → im JSON steht `"chat":{"id":-100xxxxxxxxxx,...}` — diese negative Zahl ist
   die Chat-ID. (Alternativ den Bot @getidsbot in die Gruppe holen.)
4. Task-Tracker → **Admin → Telegram → „Broadcast-Gruppe"**: Chat-ID eintragen,
   gewünschte Ereignisse anhaken (z. B. Zuweisung, Kommentar), **Speichern**.
   Wirkt sofort, kein Neustart.
5. **Mitglieder einladen:** Gruppen-Invite-Link erzeugen (Gruppe → Mitglied
   hinzufügen → „Über Link einladen") und per Telegram/Signal/WhatsApp teilen —
   die User treten selbst bei.

## Verhalten

- Gespiegelt wird **einmal pro Ereignis** (nicht pro Empfänger), auf Arabisch,
  mit „فتح المهمة"-Button zur Aufgabe.
- Persönliche 1:1-Benachrichtigungen (Weg 1) laufen unabhängig davon weiter.
- Ereignis-Auswahl jederzeit im Admin-Screen änderbar; Feld leeren = Broadcast aus.

## Wichtig

- **Keine Massen-Nachrichten an User, die den Bot nie gestartet haben** —
  Telegram blockiert das. Die persönliche Verbindung läuft ausschließlich über
  die Deep-Links/QR-Codes aus dem Admin-Screen (Admin → Telegram): Link tippen
  → „Start" → verbunden.
