# MCP — Task-Tracker in Claude Code

Mit dieser Anbindung kann **Claude Code** (oder ein anderer MCP-Client) direkt
im Task-Tracker arbeiten: Aufgaben anlegen und ändern, Checklisten pflegen,
Anhänge hochladen — und vor allem **jeden Prompt automatisch in einer Aufgabe
mitschreiben**, damit nichts verlorengeht, was nebenbei gesagt wurde.

Kurzüberblick:

```
Claude Code
   │  MCP (stdio, JSON-RPC)
   ▼
mcp/task-tracker-mcp.mjs        ← abhängigkeitsfrei, reines Node
   │  HTTPS, Authorization: Bearer tt_mcp_…
   ▼
POST /api/mcp                   ← ein RPC-Endpunkt, eine Auth-Prüfung
   │
   ▼
src/lib/mcp/ops.ts              ← erbt exakt die Rechte der Oberfläche
```

---

## 1. Token erzeugen

Auf dem **Server** (dort, wo `DATABASE_URL` erreichbar ist):

```bash
npm run mcp:token -- mint --user tarek --name "Claude Code Laptop" --scopes read,write
```

Der rohe Token wird **genau einmal** angezeigt. Gespeichert wird nur sein
SHA-256-Hash — geht er verloren, muss ein neuer erzeugt werden.

| Option | Bedeutung |
| --- | --- |
| `--user` | Login-Name. Der Token handelt **als dieser Mensch**, in dessen Mandant. |
| `--name` | Freies Etikett, damit man den Token später wiedererkennt. |
| `--scopes` | `read` (nur lesen) oder `read,write`. Voreinstellung: `read`. |
| `--days` | Optionale Gültigkeit in Tagen. Ohne Angabe: unbegrenzt. |

Verwalten:

```bash
npm run mcp:token -- list                  # alle Tokens mit Status
npm run mcp:token -- list --user tarek     # nur die einer Person
npm run mcp:token -- revoke --id <tokenId> # sofort ungültig
```

> **Ein Token = ein Mensch = ein Mandant.** Jede Änderung erscheint in der
> Historie unter dem echten Namen — nicht als anonymer Roboter. Ein Token kann
> weder die Rolle noch den Mandanten wechseln.

## 2. Claude Code einrichten

Die Datei `.mcp.json` liegt bereits im Repo und liest zwei Umgebungsvariablen,
damit **kein Token im Git landet**:

```bash
export TASK_TRACKER_URL="https://tasks.coastshield.net"
export TASK_TRACKER_TOKEN="tt_mcp_…"
```

Danach Claude Code im Projektordner starten. Prüfen, ob es steht:

> „Nutze whoami vom Task-Tracker."

## 3. Prompts automatisch mitschreiben

Das ist der eigentliche Zweck. Zwei Schritte:

**a) Aufgabe anheften** — einmal pro Arbeitssitzung:

> „Hefte Aufgabe `<id>` an." → `set_active_task`

Das schreibt `.claude/task-tracker-active.json` (nur lokal, per `.gitignore`
vom Repo ausgeschlossen).

**b) Ab jetzt läuft es von allein.** Der Hook `UserPromptSubmit` in
`.claude/settings.json` ruft `mcp/prompt-log-hook.mjs` bei **jedem** Prompt auf
und hängt ihn als Kommentar an die angeheftete Aufgabe:

```
🤖 Claude Code

Der Kalender soll auch Feiertage anzeigen.

— task-tracker · feature/kalender · 2026-08-14 09:12
```

**Warum ein Hook und kein Werkzeug?** Ein Werkzeug wird nur aufgerufen, wenn das
Modell daran denkt — und „denk daran, das mitzuschreiben" ist genau die
Anweisung, die in einer langen Sitzung untergeht. Der Hook wird von der
Umgebung ausgeführt, bei jedem einzelnen Prompt. Er kann nicht vergessen
werden, weil nicht das Modell ihn ausführt.

**Der Hook blockiert nie.** Kein Token, Server nicht erreichbar, Netz langsam,
keine Aufgabe angeheftet — jeder Fehlerfall endet still mit Exit-Code 0 und
leerer Ausgabe (auf `stdout` Geschriebenes landet sonst im Modell-Kontext).
Zeitlimit: 4 Sekunden. Zum Diagnostizieren `TASK_TRACKER_HOOK_DEBUG=1` setzen,
dann erklärt er sich auf `stderr`.

Prompt-Mitschriften lösen **absichtlich keine Benachrichtigungen** aus — sonst
klingelt bei jedem Satz ein Telefon. Normale Kommentare (`add_comment`) tun es
weiterhin.

## 4. Werkzeuge

| Werkzeug | Bereich | Zweck |
| --- | --- | --- |
| `whoami` | read | Als wem/in welchem Mandanten arbeite ich? |
| `list_tasks` | read | Suchen/filtern (`mine`, `openOnly`, `query`, …) |
| `get_task` | read | Volldetail inkl. Schritte, Kommentare, Anhänge |
| `list_steps` | read | Checkliste einer Aufgabe |
| `list_projects` | read | Sichtbare Projekte |
| `create_task` | write | Aufgabe anlegen, optional mit Checkliste |
| `update_task` | write | Ändern; `descriptionAppend` **ergänzt**, statt zu überschreiben |
| `add_comment` | write | Kommentar — benachrichtigt die Beteiligten |
| `log_prompt` | write | Prompt still mitschreiben |
| `add_step` | write | Checklistenschritt anhängen |
| `complete_step` | write | Schritt abhaken (oder wieder öffnen) |
| `upload_attachment` | write | Lokale Datei anhängen (max. 10 MB) |
| `create_project` | write | Projekt anlegen (nur Admins) |
| `set_active_task` | lokal | Aufgabe für die Mitschrift anheften |
| `get_active_task` | lokal | Welche Aufgabe ist angeheftet? |

## 5. Sicherheit

Die MCP ist **kein zweiter Weg an den Regeln vorbei** — sie ruft dieselben
Prüfungen auf wie die Oberfläche:

- **Mandantentrennung.** Eine Aufgabe aus einem fremden Mandanten meldet
  `404 task not found`, nie `403` — der Endpunkt taugt also nicht dazu,
  fremde IDs zu erraten. `tenantId` wird immer aus dem Token gestempelt und
  kann nicht als Parameter übergeben werden.
- **Rollen.** Wer kein Admin ist, kann Aufgaben nur sich selbst zuweisen, keine
  Projekte anlegen und fremde Aufgaben weder sehen noch ändern.
- **Workflow-Sperren.** Ziel-Spalte, Pflicht-Todos und Pflicht-Zeiterfassung
  gelten auch hier; ein blockierter Statuswechsel antwortet mit `409` und dem
  Grund (`TODOS_OPEN`, `TIME_REQUIRED`, `TARGET_LOCKED`).
- **Anhänge.** MIME-Allowlist wie in der Oberfläche; die Dateiendung auf der
  Platte stammt aus dem geprüften MIME-Typ, **nie** aus dem gelieferten
  Dateinamen. Gespeichert wird unter einem Zufallsnamen in `var/uploads/`.
- **Kein gemeinsames Geheimnis.** Anders als bei den Cron-Routen gibt es hier
  keine `SECRET`-Umgebungsvariable, deren Verlust alles öffnet — nur
  persönliche, einzeln widerrufbare Tokens.
- **Strikte Schemata.** Unbekannte Felder werden abgelehnt, statt still
  ignoriert zu werden.

Diese Eigenschaften sind in `src/lib/mcp/surface.test.ts` festgenagelt: Wer eine
neue Operation ohne Bereichsangabe oder ohne Zugriffsprüfung ergänzt, bekommt
einen roten Test.

### Grenzen

- Der Endpunkt ist immer eingehängt; abgesichert ist er **allein** durch die
  Tokens. Ohne ausgestellten Token antwortet er auf alles mit `401`.
- Tokens werden derzeit **per CLI** verwaltet, nicht in der Oberfläche. Eine
  Selbstbedienung unter „Einstellungen" wäre der nächste sinnvolle Schritt.
- Es gibt keine Ratenbegrenzung. Ein Token ist ein Mensch mit Zugangsdaten —
  wer ihn missbraucht, hätte sich auch anmelden können. Bei Bedarf lässt sich
  eine Begrenzung im Route-Handler ergänzen.

## 6. Fehlersuche

| Symptom | Ursache |
| --- | --- |
| `unauthorized` | Token falsch, widerrufen, abgelaufen — oder Konto deaktiviert. `npm run mcp:token -- list` zeigt den Status. |
| `requires the 'write' scope` | Nur-Lese-Token. Neuen mit `--scopes read,write` erzeugen. |
| `task not found` | Aufgabe existiert nicht **in diesem Mandanten**, oder die Person darf sie nicht sehen. |
| Mitschrift bleibt aus | Keine Aufgabe angeheftet, oder `TASK_TRACKER_URL`/`TASK_TRACKER_TOKEN` fehlen im Hook. Mit `TASK_TRACKER_HOOK_DEBUG=1` prüfen. |
| `status change blocked: …` | Admin-Workflow-Sperre — Todos offen bzw. Zeit fehlt. |

Verbindung direkt prüfen:

```bash
curl -H "Authorization: Bearer $TASK_TRACKER_TOKEN" "$TASK_TRACKER_URL/api/mcp"
```
