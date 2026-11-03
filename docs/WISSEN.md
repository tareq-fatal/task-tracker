# Projekt-Wissen — Gedächtnis für KI-Sitzungen (TOF-0839)

Jede KI-Sitzung (Claude, ChatGPT, Gemini, ein lokales Modell …) soll mit dem Stand eines
Projekts beginnen und am Ende festhalten, was sie gelernt oder entschieden hat. Dieses Wissen
liegt **im Task-Tracker**, nicht bei einem KI-Anbieter: je Mandant, je Projekt, versioniert,
durchsuchbar und als Markdown-ZIP exportierbar. Es gibt **keine Cloud- und keine
Vektor-Datenbank-Abhängigkeit** — nur Postgres (Volltext `german`). Läuft genauso on-premise.

## Für Sitzungen: die zwei Regeln

1. **Zu Beginn:** `projekt_kontext(projectId)` — kompakte Zusammenfassung (≤ ~6000 Zeichen):
   angepinnte Seiten (Ziel/Stand/Regeln/Adressen), die letzten 10 Entscheidungen, offene
   P1/P2-Aufgaben (Nummer, Titel, wer), was auf Tarek wartet (Schlagwort `wartet-auf-tarek`).
   Mehr bei Bedarf: `wissen_lesen(projectId, slug)`, `wissen_suchen(query)`.
2. **Am Ende:** `wissen_schreiben(projectId, slug, anhang | inhalt)` für neues Wissen (meist
   `slug: "stand"` mit `anhang`), `entscheidung_hinzufuegen(projectId, was, warum, aufgaben)`
   für jede Entscheidung. **Nie Zugangsdaten** — der Server lehnt sie ab.

Ohne MCP (z. B. eine KI im Browser): Export-ZIP herunterladen und hochladen, oder die
Kontext-Adresse `GET /api/projekte/<id>/kontext.md` (Token mit Scope `kontext`) — sie liefert
jetzt die angepinnten Wissen-Seiten.

## Daten

| Tabelle | Inhalt |
| --- | --- |
| `WissenSeite` | je Projekt: `slug` (eindeutig im Projekt), `titel`, `art` (`stand` \| `regeln` \| `adressen` \| `seite`), `inhalt` (Markdown, ≤ 50 000 Zeichen), `angepinnt` (= Teil von `projekt_kontext`), `aktualisiertAm/-Von`, weich löschbar (`deletedAt`). Generierte Spalte `suche` (tsvector `german`, Titel Gewicht A, Inhalt B) mit GIN-Index. |
| `WissenVersion` | jede Speicherung eine Zeile (Titel, Art, Inhalt, wer, wann). **Wiederherstellen = neue Version** mit altem Inhalt; nichts wird überschrieben. Unverändert gespeichert → keine Version. |
| `Entscheidung` | Entscheidungs-Log, **nur anhängen**: `datum`, `wer`, `was`, `warum`, `aufgaben` (TOF-Nummern), `korrigiertId` (eine Korrektur ist ein neuer Eintrag, der auf den alten zeigt). Volltext wie oben. |
| `WissenLink` | beim Speichern berechnet: `TOF-XXXX` im Text (Typ `aufgabe`) und `[[slug]]` (Typ `seite`). Die Aufgaben-Detailseite zeigt „Wissen: …“, die Seite zeigt verknüpfte Aufgaben mit Status. Aufgaben werden beim Lesen über die TOF-Nummer im Titel aufgelöst — mit den üblichen Sichtregeln. |
| `Tenant.keineExterneKi` | Schalter: dieser Mandant darf nie an externe KI-/Cloud-Dienste. V1 ruft nichts Externes auf; künftige Funktionen (Zusammenfassen o. ä.) müssen ihn prüfen. Die Migration setzt ihn für Mandanten mit „marin“ in Name/Slug. Weitere von Hand: `UPDATE "Tenant" SET "keineExterneKi" = true WHERE slug = '<slug>';` |

Übernahme: Der frühere „Kontext für Claude“ (`ProjectContext`) wurde je Projekt als angepinnte
Seite `stand` übernommen, alle Fassungen als Versionen. Die Tabelle bleibt bestehen;
`/projects/<id>/kontext` leitet auf `/projects/<id>/wissen` weiter.

## Rechte

- **Mandant** kommt immer aus Sitzung oder Token — nie aus einem Parameter.
- **Lesen:** Admins/BackendAdmin/SubAdmin des Mandanten, Projektmitglieder und der
  Projekt-Ersteller. Wer nur einer einzelnen Aufgabe zugewiesen ist, sieht das Wissen **nicht**
  (es enthält Regeln und Adressen des ganzen Projekts).
- **Schreiben:** Admins und Projektmitglieder/-Ersteller. SubAdmin liest nur (wie überall).
- Fremdes oder unsichtbares Projekt → „nicht gefunden“ (404), nie „verboten“.
- **Tokens:** volle MCP-Tokens (`read`/`write`) wie gewohnt — `read` darf lesen/suchen,
  `write` auch schreiben. Der enge Scope **`kontext`** (Einstellungen → Agenten-Tokens) öffnet im
  MCP genau die fünf Wissen-Werkzeuge (lesen **und** schreiben), sonst nichts.

## Geheimnis-Wächter

Jeder Schreibweg (Oberfläche, MCP, Import; auch der alte Kontext-Editor) prüft den Text. Abgelehnt
wird mit deutscher Meldung und Zeilennummer (nie mit dem Wert), was wie ein Zugangsdatum aussieht:
`tt_mcp_…`, `sk-…`, `ghp_…`/`github_pat_…`, `AKIA…`, `xox…`, `AIza…`, JWTs (`eyJ….….…`),
`-----BEGIN … PRIVATE KEY-----`, `postgres://user:pass@…`, „Passwort:/password:/secret:/api_key:“
**mit Wert** (Platzhalter wie „siehe Passwort-Manager“, `<…>`, `***` sind erlaubt),
`.env`-Zeilen wie `SESSION_SECRET=…`, lange Zufallsketten (≥ 40 Zeichen Base64-artig, Hex ab 48;
Git-Hashes und Pfade bleiben erlaubt). Code: `src/lib/wissen/geheimnis.ts`.

## Oberfläche

- `/projects/<id>/wissen` — Seiten nach Art (Stand, Regeln, Adressen, Seiten), Suche im Projekt,
  Entscheidungs-Log (Datum, Wer, Was, Warum, Aufgaben), neue Seite, Entscheidung eintragen, Export.
- `/projects/<id>/wissen/<slug>` — Markdown-Ansicht (sicherer Renderer, kein HTML aus dem Inhalt),
  verknüpfte Aufgaben/Seiten, Verlauf; `?bearbeiten=1` Editor; `?v=<versionId>` Diff + „Wiederherstellen“.
- `/wissen` — alle sichtbaren Projekte, Suche über den ganzen Mandanten (`/wissen?q=…`), Gesamtexport.

## Export

`GET /api/wissen/export?projectId=<id>` (ein Projekt) oder `GET /api/wissen/export` (alle
sichtbaren, je Projekt ein Ordner). ZIP mit `README.md` (Index), einer `.md` je Seite mit
YAML-Front-Matter (`titel`, `slug`, `art`, `angepinnt`, `aktualisiert`, `von`, `aufgaben`) und
`ENTSCHEIDUNGEN.md`. Im Browser per Sitzung; per CLI mit Token (Scope `kontext`, `read` oder `write`):

```bash
curl -H "Authorization: Bearer $TASK_TRACKER_TOKEN" -o wissen.zip \
  "$TASK_TRACKER_URL/api/wissen/export?projectId=<id>"
```

## MCP-Werkzeuge

| Werkzeug | Scope | Parameter |
| --- | --- | --- |
| `projekt_kontext` | read / kontext | `projectId`, `entscheidungen?` (bool: zusätzlich die letzten 50 als Daten) |
| `wissen_lesen` | read / kontext | `projectId?`, `slug?`, `versionen?` (0–50). Ohne `projectId`: Projekte; ohne `slug`: Seitenliste |
| `wissen_suchen` | read / kontext | `query` (2–200 Zeichen), `projectId?`, `limit?` (1–50) → Treffer mit `rang` und `ausschnitt` (**…** markiert) |
| `wissen_schreiben` | write / kontext | `projectId`, `slug`, `titel?`, `art?`, `angepinnt?`, **entweder** `inhalt` (ganze Seite) **oder** `anhang` (Abschnitt unten, mit Datum falls ohne Überschrift) → `{ unveraendert, neu, seite, versionId }` |
| `entscheidung_hinzufuegen` | write / kontext | `projectId`, `was`, `warum`, `wer?`, `datum?` (YYYY-MM-DD), `aufgaben?` (`["TOF-0839"]`), `korrigiertId?` |

Neue Werkzeuge erscheinen in Claude-Sitzungen erst nach einem **Neustart/Reconnect** des
MCP-Servers (die Liste wird beim Start geholt) — und nur, wenn die lokale
`mcp/task-tracker-mcp.mjs` die neue Fassung ist (`git pull` im Checkout, auf den die
MCP-Konfiguration zeigt).

## Code und Tests

- Regeln an EINER Stelle: `src/lib/wissen/dienst.ts` (UI-Actions `src/actions/wissen.ts`,
  MCP-Ops `src/lib/mcp/ops.ts`, Export-Route `src/app/api/wissen/export/route.ts` rufen nur ihn).
- Reine Funktionen: `src/lib/wissen/text.ts`, `geheimnis.ts`, `zip.ts` (ZIP ohne Abhängigkeit).
- Tests: `src/lib/wissen/wissen.test.ts` (rein), `src/lib/mcp/surface.test.ts` (Ops-Invarianten),
  `src/lib/wissen/dienst.db.test.ts` (echtes Postgres: Mandanten-Trennung inkl. Suche und Export,
  Sichtbarkeit, Versionen, Wiederherstellen, Geheimnisse, Längen, Verweise, `projekt_kontext`).
  Der DB-Test läuft nur mit einer migrierten Wegwerf-DB:

```bash
docker run -d --name wissen-pg -e POSTGRES_PASSWORD=<pw> -p 55432:5432 postgres:16-alpine
DATABASE_URL=postgresql://postgres:<pw>@localhost:55432/postgres npx prisma migrate deploy
WISSEN_TEST_DATABASE_URL=postgresql://postgres:<pw>@localhost:55432/postgres npx vitest run src/lib/wissen/dienst.db.test.ts
```

Hinweis für `prisma migrate dev`: Prisma kennt die generierten `suche`-Spalten nur als
`Unsupported("tsvector")`. Erzeugt es `ALTER COLUMN "suche" DROP DEFAULT`, diese Zeilen aus der
neuen Migration löschen.

## Später (V2, nicht gebaut)

Zusammenfassen/Verdichten alter Abschnitte, semantische Suche — nur lokal oder mit
`keineExterneKi = false`.
