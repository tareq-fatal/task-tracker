# Der Ablauf für jede Aufgabe

Verbindlich seit 16.08.2026, festgelegt von Tarek. Wörtlich:

> 1 — Claude beheben / umsetzen / machen
> 2 — Claude testen
> 3 — Tarek testen und Claude zuweisen
> 4 — Claude releasen, Tarek Bescheid geben und Aufgabe schließen

**Das ersetzt die alte Regel „Claude schließt nie".** Neu gilt: Claude schließt
die Aufgabe — aber erst **nach** Schritt 3, also nachdem Tarek getestet und sie
wieder Claude zugewiesen hat. Vorher nicht.

## Die Spalten

Der Ablauf ist die Spaltenreihenfolge auf dem Scrum-Board (**Ansichten →
Scrum**). `src/lib/scrum.ts` ist die einzige Stelle, an der die Reihenfolge
steht; `WORKFLOW_CHAIN` nennt die vier Schritte.

| Schritt | Spalte | Anzeige | Zuständig | Bedeutung |
| --- | --- | --- | --- | --- |
| — | `to-do` | Zu erledigen | — | Rückstand, noch nicht angefangen |
| **1** | `in-progress` | In Arbeit | `claude` | umsetzen |
| **2** | `self-test` | Test (Bearbeiter) | `claude` | selbst testen, Nachweis anhängen |
| **3** | `to-verify` | Test (Auftraggeber) | `tarekfatal` | Tarek nimmt ab |
| **4** | `release` | Release | `claude` | ausliefern, Bescheid geben, dann schließen |
| — | `done` | Erledigt | — | geschlossen |

### Test gegen Entscheidung — zwei verschiedene Dinge

Nicht alles, was bei Tarek liegt, ist ein Test. Manches wartet auf eine
**Handlung** von ihm: einen Zugang, einen Schlüssel, eine Freigabe, eine
Bundle-ID. Das gehört nicht in Schritt 3, sonst sucht er dort vergeblich nach
etwas zum Ausprobieren.

| Es geht um | Spalte | Anzeige |
| --- | --- | --- |
| etwas ausprobieren und abnehmen | `to-verify` | Test (Auftraggeber) |
| etwas entscheiden oder liefern | `waiting` | Wartet auf Entscheidung |

Beide sind auf `tarekfatal` zugewiesen. Der Tracker kennt keine Labels — die
Spalte IST die Kennzeichnung. Bei einer Entscheidungsaufgabe gehört die Frage
samt Auswahlmöglichkeiten in die Beschreibung, jede mit einem Satz Folge.

Weiteres Nebengleis: `ready-for-golive`.

Wichtig: **jeder Schritt der Kette hat den Status `InProgress`** — auch
`release`. Ausgeliefert ist noch nicht geschlossen. Nur `done` zählt als
erledigt. Dafür gibt es einen Test (`src/lib/scrum.test.ts`).

## Die Zuständigkeit wechselt von allein

Vier Automatik-Regeln hängen die Zuständigkeit an die Spalte, statt sie dem
Gedächtnis der Beteiligten zu überlassen:

```
Spalte wird in-progress → Zuweisen an claude
Spalte wird self-test   → Zuweisen an claude
Spalte wird to-verify   → Zuweisen an tarekfatal
Spalte wird release     → Zuweisen an claude
```

Sie stehen unter **Einstellungen → Automatik** und sind dort änderbar oder
abschaltbar — sie sind Daten, kein Code. Angelegt hat sie die Migration
`20260816120000_workflow_chain_rules`, nur für den Mandanten `tarek-claude`.

Die Regeln greifen bei jedem Spaltenwechsel: beim Ziehen auf dem Board genauso
wie über die Schnittstelle. Eine ausdrücklich mitgegebene `assignee` schlägt die
Regel — wer bewusst jemand anderen einträgt, wird nicht überstimmt.

Wer in Schritt 3 landet, bekommt zusätzlich eine Benachrichtigung
(Ereignis `review`, per E-Mail sobald der Versand eingerichtet ist — siehe
[EMAIL-SETUP.md](EMAIL-SETUP.md)).

## So bewegt eine Sitzung eine Aufgabe

```js
// Schritt 1 → 2: umgesetzt, jetzt selbst testen
await mcp("update_task", { taskId, scrumColumn: "self-test", progress: 80 });

// Schritt 2 → 3: getestet, Tarek soll abnehmen. IMMER zuerst der Kommentar.
await mcp("add_comment", { taskId, content: "@tarekfatal Fertig: … Zu prüfen: … Zu sehen: …" });
await mcp("update_task", { taskId, scrumColumn: "to-verify" });

// Schritt 3 → 4: Tarek hat abgenommen und zurückgegeben
await mcp("update_task", { taskId, scrumColumn: "release" });

// Nach dem Release: Bescheid geben, DANN schließen
await mcp("add_comment", { taskId, content: "@tarekfatal Ausgeliefert in Build …" });
await mcp("update_task", { taskId, status: "Done", progress: 100 });
```

Die Zuweisung muss man nicht mitgeben — die Regel erledigt sie.

## Was dabei zu pflegen ist

- **Abhängigkeiten als Verknüpfung, nicht als Prosa.** `link_tasks` mit
  `DependsOn`, `Blocks`, `RelatedTo` oder `SubtaskOf`. Eine Abhängigkeit, die
  nur im Beschreibungstext steht, taucht in keiner Ansicht auf und blockiert
  nichts.
- **Große Themen als Unteraufgaben gliedern**, nicht als eine große Aufgabe:
  `add_step` je Punkt, `complete_step` beim Abhaken. Der Fortschritt rechnet
  sich daraus von selbst.
- **Fortschritt in Prozent pflegen** (`progress`), damit Tarek den Stand sieht,
  ohne zu fragen. Bei Aufgaben mit Unteraufgaben passiert das automatisch.
- **Zeiterfassung** läuft über den Timer in der Aufgabe.

## Wo Tarek seine Liste sieht

- **`/list?spalte=to-verify&nur=ich`** — die vollständige Prüfliste, ohne
  Kürzung, gruppiert nach Projekt. Das ist die Adresse zum Merken.
- **`/list?spalte=waiting&nur=ich`** — was auf eine Entscheidung von ihm wartet.
- **`/next`** — die zehn dringendsten, Schritt 3 ganz oben, mit einem Link auf
  die vollständige Liste.
- **`/views`** — das Board mit allen Spalten nebeneinander.
