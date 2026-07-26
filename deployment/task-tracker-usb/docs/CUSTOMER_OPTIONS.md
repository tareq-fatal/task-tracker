# Task Tracker — Ihre zwei Möglichkeiten

Task Tracker gibt es in zwei Varianten. Beide bieten denselben vollen
Funktionsumfang — der Unterschied liegt nur darin, **wo** die Anwendung läuft
und **wer** sich um den Betrieb kümmert.

| | **Option 1 — Eigener Server** | **Option 2 — Wir hosten (Managed)** |
| --- | --- | --- |
| Läuft auf | Ihrem eigenen Server | unserem Server |
| Sie brauchen | Linux-Server + Domain | nur einen Browser |
| Betrieb (Updates, Backups, SSL) | Sie selbst | wir |
| Ihre Daten liegen | ausschließlich bei Ihnen | auf unserem Server (getrennter Mandant) |
| Startklar in | ca. 15 Minuten Installation | sofort |
| Kosten | einmalig | monatlich |

Kurz gesagt: **Option 1**, wenn Sie volle Datenhoheit auf eigener Hardware
wollen. **Option 2**, wenn Sie sich um nichts kümmern und einfach loslegen
möchten.

---

## Option 1 — Eigener Server (USB-Paket)

Sie erhalten Task Tracker auf einem USB-Stick und installieren es selbst auf
Ihrem eigenen Server. Ein einziger Befehl, der Rest läuft automatisch.

**Was Sie brauchen**
- einen Linux-Server mit Ubuntu 22.04 / 24.04 oder Debian 12
- 4 GB Arbeitsspeicher, 20 GB freien Speicherplatz
- optional einen Domainnamen (z. B. `aufgaben.ihre-firma.de`) für automatisches
  HTTPS — ohne Domain läuft es im internen Netz über die IP-Adresse

**Was Sie bekommen**
- den USB-Stick mit dem kompletten Paket
- bebilderte Installationsanleitung auf Deutsch und Arabisch
  (`INSTALL_DE.pdf`, `INSTALL_AR.pdf`)
- Installation per einem Befehl: `sudo ./install.sh`. Passwörter, Datenbank,
  HTTPS-Zertifikat und Administrator-Konto werden automatisch eingerichtet.
- fertige Befehle für Backup, Wiederherstellung, Update und Deinstallation
- eine nächtliche automatische Sicherung, direkt mit eingerichtet

**Vorteile**
- **Volle Datenhoheit** — Ihre Daten verlassen nie Ihren Server.
- **Keine laufenden Cloud-Kosten** — der Server gehört Ihnen.
- Läuft auch komplett ohne Internet (abgeschottetes Netz) — dafür gibt es eine
  Offline-Variante des USB-Sticks.

**Zu bedenken**
- Sie betreiben den Server selbst.
- Updates spielen Sie selbst ein (ein Befehl, mit automatischer Sicherung und
  Rückroll-Funktion — aber Sie stoßen es an).
- Sie brauchen jemanden, der einen Linux-Server grundlegend bedienen kann.

**Support**
- Einrichtungs-Unterstützung per E-Mail und Telefon.
- Optionaler laufender Support-Vertrag (siehe Preise).

---

## Option 2 — Wir hosten (Managed / SaaS)

Sie nutzen Task Tracker über unseren bestehenden Server. Kein eigener Server,
keine Installation — Sie bekommen Ihre Zugangsdaten und legen sofort los.

**Was Sie brauchen**
- nur einen Browser (am Rechner, Tablet oder Handy)

**Was Sie bekommen**
- Ihren eigenen, von anderen Kunden getrennten Bereich (Mandant) auf unserem
  Server — die Mehrmandanten-Trennung ist fest eingebaut
- Ihre eigene Adresse, Ihr Logo und Ihre Farben
- alles inklusive: Updates, tägliche Sicherungen, HTTPS-Verschlüsselung,
  Überwachung

**Vorteile**
- **Kein Server-Aufwand** — wir kümmern uns um alles.
- **Immer aktuell** — neue Funktionen und Sicherheits-Updates spielen wir ein,
  ohne dass Sie etwas tun müssen.
- **Sofort einsatzbereit** — verfügbar ab sofort auf unserem bestehenden,
  produktiv laufenden Server (`tasks.coastshield.net`).
- Sicherungen und Ausfallsicherheit sind unsere Aufgabe, nicht Ihre.

**Zu bedenken**
- Monatliche Kosten.
- Ihre Daten liegen auf unserem Server (streng von anderen Kunden getrennt).
  Wenn Ihre Vorgaben Daten ausschließlich im eigenen Haus verlangen, ist
  Option 1 die richtige Wahl.

**Verfügbar:** ab sofort.

---

## Preise

> **Hinweis für Tarek:** Die folgenden Zahlen sind ein Vorschlag / Platzhalter.
> Bitte vor Weitergabe an den Kunden anpassen. Diese Box vor dem Versand
> entfernen.

### Option 1 — Eigener Server
- **500 €** einmalig — USB-Paket inkl. 1 Stunde Installations-Unterstützung
- **50 €/Monat** optional — laufender Support (Updates, Fragen, Hilfe bei
  Störungen)

### Option 2 — Wir hosten
- **100 €/Monat** — alles inklusive: Betrieb, Updates, Sicherungen, Support

### Zum Vergleich

| | einmalig | monatlich |
| --- | --- | --- |
| Option 1 (ohne Support) | 500 € | — |
| Option 1 (mit Support) | 500 € | 50 € |
| Option 2 (Managed) | — | 100 € |

Ein späterer Wechsel zwischen den Optionen ist möglich: Ihre Daten lassen sich
aus der einen Variante sichern und in die andere übernehmen.

---

## Häufige Fragen

**Können wir zuerst testen?**
Ja. Am schnellsten über Option 2 — wir richten Ihnen einen Testzugang ein, Sie
schauen sich alles im Browser an, ganz ohne Server.

**Können wir später von „Wir hosten" auf „Eigener Server" wechseln (oder
umgekehrt)?**
Ja. Es gibt eine Sicherungs-/Wiederherstellungsfunktion, mit der die kompletten
Daten von einer Variante in die andere übernommen werden.

**Ist Arabisch unterstützt?**
Ja, vollständig — inklusive Rechts-nach-links-Darstellung. Deutsch, Arabisch und
Englisch stehen zur Verfügung, jeder Benutzer wählt seine Sprache selbst. Die
Standardsprache lässt sich pro Installation festlegen.

**Was passiert bei einem Server-Ausfall (Option 1)?**
Die nächtliche Sicherung läuft automatisch. Für den Ernstfall empfehlen wir,
regelmäßig eine Sicherung auf einen USB-Stick oder einen zweiten Rechner zu
kopieren — dafür gibt es einen fertigen Befehl.

**Wie viele Benutzer sind möglich?**
Beide Varianten sind für Teams ausgelegt; die Benutzerzahl ist technisch nicht
begrenzt. Für sehr große Installationen (Option 2) stimmen wir die
Server-Ausstattung individuell ab.
