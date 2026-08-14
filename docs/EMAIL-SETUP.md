# E-Mail-Benachrichtigungen einrichten

**Was Tarek eintragen muss:** in `deployment/.env` auf dem VPS die vier Zeilen
`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` seines Mailkontos plus
`EMAIL_FROM` mit der Absenderadresse — danach `docker compose up -d`, fertig.

Alles andere ist gebaut und wartet nur darauf.

---

## Die zwei Wege

Die Anwendung kann über einen **eigenen Mailserver (SMTP)** verschicken oder über
**Resend**. Zugangsdaten stehen ausschließlich in der Umgebung, nie im Code.

### SMTP — der eigene Mailserver

```env
SMTP_HOST=mail.objektus.de
SMTP_PORT=587
SMTP_USER=…
SMTP_PASSWORD=…
EMAIL_FROM=Task Tracker <no-reply@objektus.de>
APP_URL=https://tasks.coastshield.net
```

`SMTP_PORT=465` schaltet TLS von der ersten Zeile an ein, `587` und `25`
beginnen im Klaren und rüsten per STARTTLS auf. Wer das anders braucht, setzt
`SMTP_SECURE=true` oder `=false` und überschreibt damit die Automatik.
Benutzer und Passwort dürfen zusammen fehlen — ein Relais im eigenen Netz
verlangt oft keine Anmeldung. Nur **eines** von beiden zu setzen ist ein
Fehler, den die Anwendung meldet, statt still nichts zu verschicken.

### Resend — der Dienst

```env
RESEND_API_KEY=re_…
EMAIL_FROM=Task Tracker <noreply@tasks.coastshield.net>
```

### Welcher Weg gilt?

Ohne weitere Angabe entscheidet, was da ist: ist `SMTP_HOST` gesetzt, gewinnt
der eigene Mailserver, sonst Resend. `EMAIL_TRANSPORT=resend|smtp|none`
erzwingt einen Weg.

**Ist nichts eingerichtet, verschickt die Anwendung keine E-Mail und läuft
ansonsten unverändert.** Beim ersten Versandversuch schreibt sie eine Zeile ins
Protokoll, die sagt, welcher Weg gilt oder welche Variable fehlt:

```
[email] E-Mail über SMTP mail.objektus.de:587, Absender Task Tracker <no-reply@objektus.de>
[email] E-Mail ist AUS — es fehlt: SMTP_PASSWORD
```

Ein Passwort steht in dieser Zeile nie.

## Wobei kommt eine E-Mail?

Voreingestellt bei den Ereignissen, die eine Person **direkt ansprechen**:

| Ereignis | wann |
| --- | --- |
| Erwähnung | jemand schreibt `@deinbenutzername` in einen Kommentar — aus dem Browser **oder** aus einer Sitzung über die Schnittstelle |
| Zuweisung | eine Aufgabe wird dir zugewiesen |
| Zur Prüfung | eine Aufgabe wandert in die Spalte „Zur Prüfung" und wartet auf deine Abnahme |

Dazu die Sammel-Erinnerungen „Bald fällig" und „Überfällig", wie bisher.
Kommentare, Statuswechsel und Reaktionen schicken **keine** E-Mail — das wäre
Rauschen; wer sie möchte, schaltet sie ein.

## Abschalten

Jede Person entscheidet für sich: **Einstellungen → Benachrichtigungen**, dort
je Ereignis die Spalte E-Mail. Wer keine E-Mail-Adresse hinterlegt hat,
bekommt ohnehin keine. Ruhezeiten (ebenfalls in den Einstellungen) halten
E-Mails zurück; die Meldung im Programm kommt trotzdem.

## Prüfen, ob es geht

1. In den Einstellungen bei einem Testbenutzer eine erreichbare Adresse hinterlegen.
2. Eine beliebige Aufgabe öffnen und einen Kommentar mit `@testbenutzer` schreiben.
3. Kommt nichts an: `docker compose logs task-tracker | grep '\[email\]'` — dort
   steht entweder der gewählte Weg, die fehlende Variable oder der Grund der
   Ablehnung durch den Mailserver.
