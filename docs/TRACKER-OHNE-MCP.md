# Den Tracker ohne MCP benutzen

Für Sitzungen, die **nicht** auf Tareks Rechner laufen — zum Beispiel eine
Claude-Code-Sitzung in der Cloud.

Der MCP-Server (`mcp/task-tracker-mcp.mjs`) spricht **nur** über die
Standardein- und -ausgabe. Er muss also als Programm auf derselben Maschine
liegen wie die Sitzung. Eine Cloud-Sitzung sieht weder dieses Skript noch die
lokalen Umgebungsvariablen — für sie ist der Eintrag in `~/.claude.json`
wirkungslos.

**Der Ausweg ist einfach:** der MCP-Server ist ohnehin nur ein dünner Aufsatz.
Jeder Werkzeugaufruf wird bei ihm zu **einem** `POST /api/mcp`. Diesen POST kann
jede Sitzung direkt machen, die das Netz erreicht. Der Tracker läuft öffentlich
unter `https://tasks.coastshield.net`.

---

## Zuerst prüfen: darf die Umgebung überhaupt hinaus?

**Das ist die erste Frage, nicht die letzte.** Cloud-Umgebungen lassen
ausgehende Verbindungen in der Regel nur zu einer kurzen Liste zu — typisch npm,
PyPI, GitHub und Anthropic. `tasks.coastshield.net` ist dort **nicht** dabei.

Woran man es erkennt — es sieht *nicht* wie ein Anmeldeproblem aus:

- `403` mit einem Hinweis auf eine *policy denial*, nicht `401`
- der CONNECT des Proxys wird abgelehnt, bevor der Server überhaupt antwortet
- ein Abrufwerkzeug meldet `EGRESS_BLOCKED`

**In diesem Fall hilft kein Token.** Er käme nie bis zur Adresse. Was hilft, ist
`tasks.coastshield.net` in der **Netzwerk-Richtlinie der Umgebung** freizugeben;
das macht, wer die Umgebung verwaltet.

Ein Test, der die Frage in einer Zeile beantwortet:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://tasks.coastshield.net/api/mcp
```

`401` heißt: die Adresse ist erreichbar, es fehlt nur der Token — alles Weitere
in dieser Anleitung greift. `403` mit Richtlinien-Hinweis oder ein Fehler schon
beim Verbindungsaufbau heißt: erst freigeben lassen, vorher lohnt kein weiterer
Versuch.

*Belegt am 08.09.2026: eine Cloud-Sitzung hat eine halbe Stunde am Token
gesucht, während der Egress-Proxy die Adresse gar nicht durchließ.*

---

## Der eine Endpunkt

```
POST https://tasks.coastshield.net/api/mcp
Authorization: Bearer $TASK_TRACKER_TOKEN
Content-Type: application/json

{ "op": "...", "params": { ... } }
```

Antwort immer `{ "ok": true, "data": ... }` oder `{ "ok": false, "error": "..." }`.

`GET /api/mcp` (mit demselben Kopf) nennt Identität, Mandant und **alle
erlaubten Operationen** — das ist die Liste, die zählt, nicht diese Datei.

Ein Baustein, der überall passt:

```js
const ruf = async (op, params = {}) => {
  const r = await fetch(process.env.TASK_TRACKER_URL + "/api/mcp", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + process.env.TASK_TRACKER_TOKEN,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ op, params }),
  });
  const j = await r.json();
  if (!j.ok) throw new Error(op + ": " + j.error);
  return j.data;
};
```

## Die vier Handgriffe, die man täglich braucht

**Lesen**

```js
await ruf("list_projects");
await ruf("list_tasks", { projectId, limit: 100, status: "Todo" });
await ruf("get_task", { taskId });          // mit Beschreibung, Kommentaren, Schritten
```

**Anlegen**

```js
await ruf("create_task", {
  projectId,                                 // NIE weglassen
  title: "TOF-XXXX — Kurztitel",             // Platzhalter: der Server setzt die Nummer
  description: text,
  priority: "High",                          // Critical | High | Medium | Low
});
```

**Kommentieren** (vor jeder Übergabe an Tarek, beginnt mit `@tarekfatal`)

```js
await ruf("add_comment", { taskId, content: text });
```

**Verschieben**

```js
await ruf("update_task", { taskId, scrumColumn: "to-verify", progress: 90 });
await ruf("update_task", { taskId, status: "Done" });
await ruf("update_task", { taskId, assignee: "tarekfatal" });
```

## Fallen, die schon Zeit gekostet haben

- **Es gibt keine REST-Route je Vorgang.** `/api/tasks/<id>` liefert 404-HTML.
  Alles läuft über die eine RPC-Adresse.
- **Parameternamen weichen ab.** `create_task` will `projectId` und
  `assignedToUserId`; `update_task` dagegen `assignee` (Benutzername).
  `complete_step` will nur `stepId`, **ohne** `taskId`. Im Zweifel:
  `src/lib/mcp/ops.ts`.
- **Grenzen:** `list_tasks` liefert höchstens 100 Zeilen — für die höchste
  vergebene Nummer taugt es nicht. Ein Kommentar fasst 4000 Zeichen, eine
  Beschreibung 20000. Längeres in zwei Kommentare teilen.
- **`projectId` kommt in der Antwort nicht mit.** Wer wissen will, zu welchem
  Projekt ein Vorgang gehört, listet je Projekt und merkt sich die Kennungen.
  Sonst sieht es so aus, als hätte kein einziger Vorgang ein Projekt.
- **Löschen geht nicht.** Weder Vorgänge noch Kommentare — es gibt keine
  Operation dafür. Was weg soll, wird archiviert (`status: "Archived"`).
- **Anhänge lassen sich mit diesem Token nicht herunterladen**
  (`/download/attachment/<id>` antwortet 401). Screenshots von Tarek sind so
  nicht lesbar.
- **Umlaute:** Nutzlast über eine Datei oder ein Node-Skript schicken, nie
  Sonderzeichen direkt in die Kommandozeile eines Windows-Programms.

## Der Token

Er heißt `TASK_TRACKER_TOKEN`, beginnt mit `tt_mcp_` und gehört in die
**Geheimnisse der Umgebung** — dorthin, wo die Cloud-Umgebung ihre
Umgebungsvariablen bekommt. Zusammen mit `TASK_TRACKER_URL`.

**Aber erst, wenn die Adresse freigegeben ist** (siehe oben). Einen Token in
eine Umgebung zu legen, die das Ziel gar nicht erreicht, bringt nichts — außer
dass ein Geheimnis an einer Stelle mehr liegt.

**Nie** in eine Datei, die im Repo landen kann; `.env.example` führt beide
Namen bewusst mit leerem Wert.

Neu ausstellen: `npm run mcp:token` im Tracker-Repo.

**Ein Token, der in einer fremden Umgebung liegt, ist ein eigener Grund, ihn
regelmäßig zu erneuern.** Er liegt dann auf einer Maschine, die Tarek nicht
selbst verwaltet, und wandert durch Protokolle, Abbilder und Sicherungen, die
er nicht sieht. Ein fester Rhythmus ist besser als ein Anlass — und beim
kleinsten Verdacht sofort.

## Und wenn es bequemer werden soll

Der MCP-Server ist ein dünner Aufsatz: die Werkzeugliste steht in
`mcp/task-tracker-mcp.mjs`, die Regeln und Rechte liegen längst serverseitig in
`src/lib/mcp/ops.ts`. Ein **entfernter** MCP-Endpunkt neben `/api/mcp` wäre
deshalb keine zweite Wahrheit, sondern derselbe Weg mit anderem Umschlag:
JSON-RPC (`initialize`, `tools/list`, `tools/call`) statt `{op, params}`, und
die Werkzeugtabelle wandert aus dem Skript in ein gemeinsames Modul, damit
beide Seiten dieselbe Liste benutzen.

Geschätzt ein halber Tag mit Tests. Danach trägt jede Sitzung — lokal wie in der
Cloud — nur noch eine Adresse ein, und niemand muss mehr wissen, wo ein Skript
liegt.

**Reihenfolge beachten:** Das lohnt sich erst, **nachdem** die Adresse in der
Netzwerk-Richtlinie freigegeben ist. Sonst steht nach einem halben Tag ein
Server, den die Cloud-Sitzung genauso wenig erreicht wie den heutigen Endpunkt —
sie scheitert dann nur eine Schicht später.
