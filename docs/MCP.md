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

### In Produktion: `infra/mcp-setup.sh`

`npm run mcp:token` läuft **nicht** im Produktions-Container: das Runtime-Image
enthält bewusst weder `tsx` noch `src/` (siehe `Dockerfile`), und `mcp-token.mjs`
importiert `src/lib/api-token.ts` durch `tsx`. Auf dem VPS übernimmt deshalb
`infra/mcp-setup.sh` — es macht aus „neuer Mandant soll den Tracker aus Claude
Code bedienen können" einen Einzeiler:

```bash
bash infra/mcp-setup.sh \
  --tenant-name "Tarek & Claude" --slug tarek-claude \
  --owner-name Claude --owner-username claude \
  --owner-email claude@tasks.coastshield.net --owner-password '…' \
  --token-label "Claude Code" --scopes read,write
```

Der Reihe nach, jeder Schritt für sich wiederholbar:

1. `prisma migrate deploy` (idempotent, läuft ohnehin bei jedem Container-Boot),
2. Mandant nach Slug — nur angelegt, wenn er fehlt,
3. Eigentümer nach Login-Namen — nur angelegt, wenn er fehlt, direkt als `Admin`
   (wie `createTenantAction`), bestehende Passwörter/Rollen bleiben unangetastet,
4. Token — ein aktiver Token mit demselben Etikett wird **wiederverwendet**
   statt neu erzeugt (der Rohwert ist nicht wiederherstellbar, ein zweiter
   Token würde den ersten stillschweigend verwaisen lassen),
5. **Ende-zu-Ende-Prüfung** — der frische Token geht gegen das echte
   `GET /api/mcp` und muss mit dem erwarteten Benutzer und Mandanten
   antworten. Erst danach wird die `export`-Zeile ausgegeben.

| Zusatzoption | Wirkung |
| --- | --- |
| `--rotate-token` | Widerruft die bisherigen Tokens dieses Etiketts und erzeugt einen neuen. |
| `--reset-password` | Setzt das Passwort eines bestehenden Kontos neu (sonst nie angefasst). |
| `--adopt-user` | Holt ein bestehendes Konto in diesen Mandanten — nur wenn es dort nichts besitzt. |
| `--token-days N` | Befristet den Token. |

### Arbeitsregeln für Sessions (Tarek, 14.08.2026)

Drei Regeln, die beim Anlegen und Pflegen von Aufgaben gelten. Sie stehen hier,
weil sie sonst in jeder neuen Session neu erklärt werden müssten.

**1. Nichts selbst abschließen.** Was eine Session fertiggestellt hat, geht
NICHT auf `Done`, sondern in den Prüf-Status — Tarek nimmt ab. Der Tracker
kennt den Status: die Scrum-Spalte `to-verify` („Zur Prüfung", 🔍) unter
**Ansichten**. `statusForColumn()` bildet sie bewusst auf `InProgress` ab, eine
Aufgabe dort zählt also nicht als erledigt (`src/lib/scrum.ts`).

```bash
bash infra/mcp-taskcare.sh --review --keys "TOF-0119,TOF-0120"
```

> Einschränkung, ehrlich: das Haupt-Board gruppiert nach `status` und zeigt
> solche Aufgaben als „In Arbeit". Nur die Ansicht **Scrum-Board** hat die
> eigene Spalte. `Done` bleibt `Done` für alles, was historisch abgeschlossen
> ist — umgehängt wird nur, was eine Session selbst gebaut hat.

**2. Zusammenhänge verknüpfen.** `TaskLink` kennt vier Typen: `DependsOn`,
`Blocks`, `RelatedTo`, `SubtaskOf`.

```bash
bash infra/mcp-taskcare.sh --link --links "TOF-0013:DependsOn:TOF-0014,TOF-0011:SubtaskOf:TOF-0005"
```

**3. Aufgaben zuweisen — nach der Frage „wer ist als Nächstes dran?"**

| Nächster Schritt | Zuständig |
| --- | --- |
| eine Session baut, prüft, dokumentiert | `claude` |
| eine Entscheidung (Frontend-Weg, Paket-Kennung, löschen ja/nein) | `tarekfatal` |
| Zugang, Schlüssel oder Lizenz liefern bzw. rotieren | `tarekfatal` |
| SQL einspielen, Vorlage importieren, Konto anlegen | `tarekfatal` |
| App-Store-Formulare, Passwörter ändern, Hardware kaufen | `tarekfatal` |
| irgendetwas wartet auf sein „Go" | `tarekfatal` |
| Aufgabe steht auf **Zur Prüfung** | `tarekfatal` (er nimmt ab) |

Nichts bleibt unzugewiesen — sonst geht es unter. Was auf `tarekfatal` liegt,
ist seine To-do-Liste; was auf `claude` liegt, ist Arbeit für eine Session.

```bash
# Massenlauf: nur Aufgaben OHNE Zuständigen, überschreibt nie
bash infra/mcp-taskcare.sh --assign --assign-to claude

# gezielt umhängen (überschreibt bewusst)
bash infra/mcp-taskcare.sh --assign --assign-to tarekfatal --assign-keys "TOF-0060,TOF-0074"
```

> **Ein Token = ein Benutzer.** Alle Sessions, die sich denselben Token teilen,
> handeln als `claude` — auch parallel laufende. Getrennte Namen je Agent
> (`claude-fsm`, `claude-docs`, …) ergeben deshalb nur Sinn, wenn jeder Agent
> auch einen EIGENEN Token bekommt; sonst wären es Konten, unter denen niemand
> arbeitet. Der einfachere Weg ist deshalb: alle laufen unter `claude`, die
> Zuständigkeit steht am Feld. Wenn getrennte Namen gewünscht sind, ist das
> ein Aufruf je Agent:
>
> ```bash
> bash infra/mcp-setup.sh --tenant-name "Tarek & Claude" --slug tarek-claude \
>   --owner-name "Claude FSM" --owner-username claude-fsm \
>   --owner-password '…' --token-label "Claude Code FSM" --scopes read,write \
>   --adopt-user
> ```
>
> Der Mandant besteht ja schon, das Skript legt dann nur Benutzer und Token an.

**4. TOF-0000 aktuell halten.** `TOF-0000` ist die Wiederaufnahme-Aufgabe: ihr
Inhalt ist ein fertiger Text, den Tarek in eine neue, leere Unterhaltung
kopieren kann, damit eine frische Session sofort weiterarbeiten kann — auch
wenn er die alte Unterhaltung gelöscht hat.

Ändert sich etwas Grundsätzliches — ein neues Repo, ein neuer Zugang, eine
geänderte Arbeitsregel — gehört es dort hinein. Quelle ist
[`docs/WIEDERAUFNAHME-PROMPT.md`](./WIEDERAUFNAHME-PROMPT.md); die Aufgabe wird
daraus erneuert, damit die beiden Stellen nicht auseinanderlaufen:

```bash
bash infra/mcp-taskcare.sh --resume-prompt
```

Der Aufruf ist idempotent und meldet „unverändert", wenn die Aufgabe schon auf
dem Stand der Datei ist. Also: Datei ändern, committen, Skript laufen lassen.

> `TOF-0000` steht bewusst vor `TOF-0001` und trägt Priorität `Critical`, damit
> sie oben steht. Ein echtes Anheften kennt der Tracker nicht — die Listen
> sortieren nach Priorität, und `Titel` ist eine klickbare Sortierspalte, in der
> `TOF-0000` zuerst kommt. Erfasst als TOF-0147.

Warum das alles über ein Skript statt über die MCP läuft: `POST /api/mcp`
kennt weder Verknüpfungen noch die Scrum-Spalte, und `update_task` hat kein
Zuweisungsfeld (nur `create_task`). Erfasst als TOF-0144 bis TOF-0146.

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
