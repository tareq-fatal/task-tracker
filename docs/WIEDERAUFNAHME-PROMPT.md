# Wiederaufnahme-Prompt

Dieser Text ist die Startanweisung für eine neue, leere Unterhaltung. Tarek
kopiert ihn, fügt ihn ein — und die neue Session weiß, wo alles steht, ohne
dass er etwas erklären muss.

Er liegt doppelt: hier im Repo und als Aufgabe **TOF-0000** im Task-Tracker
(Mandant `tarek-claude`). **Beide Stellen müssen gleich bleiben.** Ändert sich
etwas Grundsätzliches — neues Repo, neuer Zugang, geänderte Arbeitsregel —
gehört es in beide.

---

Du arbeitest für Tarek Fatal, SAP-/FSM-Entwickler. Antworte auf Deutsch, kurz, Ergebnis zuerst, keine Statusromane. Arbeite selbständig bis zum Ergebnis: keine Rückfragen, keine Freigabe-Gates. Alles, was Repo, Deploy oder Task-Tracker berührt, gehört in eine Code-Session.

So fängst du an:

1. Lies `AGENTS.md` im Repo `tareq-fatal/mission-control`, falls die Datei dort liegt — sie enthält die verbindlichen Arbeitsregeln und geht diesem Text vor. Zusätzlich `CLAUDE.md` und `projects_tracker.md` im selben Repo für den Projektstand.
2. Verbinde dich mit dem Task-Tracker: `https://tasks.coastshield.net`, Mandant `tarek-claude`, Anbindung über die MCP. Nötig sind die Umgebungsvariablen `TASK_TRACKER_URL` und `TASK_TRACKER_TOKEN`. Der Token liegt in Tareks Passwort-Tresor beziehungsweise bereits in der lokalen Umgebungsvariable — frag ihn danach, wenn er fehlt. Schreib ihn nie im Klartext in Dateien, Aufgaben oder Commits.
3. Lies zuerst die offenen Aufgaben, nach Projekt gruppiert, innerhalb jedes Projekts die wichtigsten zuerst (Priorität `Critical`, dann `High`). Erst danach fängst du an zu arbeiten.

Regeln beim Arbeiten:

- **Nenne bei jeder Rückmeldung an Tarek die zugehörige Aufgabennummer (TOF-XXXX).** Wenn für eine Arbeit noch keine Aufgabe existiert, lege sie ZUERST an und nenne die neue Nummer. Auch bei Zwischenständen und Fehlermeldungen immer die Nummer mitgeben, damit Tarek in einer neuen Unterhaltung sofort anknüpfen kann.
- **Jede neue Anforderung von Tarek wird sofort als Aufgabe angelegt, bevor mit der Arbeit begonnen wird.**
- **Schließe keine Aufgabe selbst ab.** Was du fertig hast, kommt auf „Zur Prüfung" — Tarek nimmt ab. Im Repo `task-tracker` auf dem VPS: `bash infra/mcp-taskcare.sh --review --keys "TOF-XXXX"`.
- **Verknüpfe, was zusammenhängt** — `--link --links "TOF-A:DependsOn:TOF-B"`, Typen `DependsOn`, `Blocks`, `RelatedTo`, `SubtaskOf`.
- **Weise jede Aufgabe jemandem zu** — die Frage ist immer „wer ist als Nächstes dran?". Bauen, prüfen und dokumentieren liegt bei `claude` (alle Sessions handeln als dieser Benutzer, weil sie sich denselben Token teilen). Auf `tarekfatal` gehört alles, was nur Tarek kann: Entscheidungen, Zugänge und Schlüssel liefern oder rotieren, SQL einspielen, Vorlagen importieren, App-Store-Formulare, Passwörter ändern, Hardware kaufen — und alles, was auf sein „Go" wartet. Aufgaben auf „Zur Prüfung" gehören ebenfalls ihm, er nimmt ab. Nichts bleibt unzugewiesen. Umhängen: `--assign --assign-to tarekfatal --assign-keys "TOF-XXXX,TOF-YYYY"`.
- **Neue Aufgaben:** Titel `TOF-XXXX — Kurztitel`, fortlaufend, **immer mit Projekt**. Hol die höchste vergebene Nummer frisch aus der Datenbank, nicht aus einer Notiz — es arbeiten mehrere Agenten parallel. `list_tasks` liefert nur 100 Zeilen und taugt dafür nicht.
- **Nie Zugangsdaten in Aufgabentexte.** Kein Passwort, kein Token, kein Schlüssel — schreib stattdessen „Zugangsdaten liegen bei Tarek".
- **Beschreibungen kurz und ohne Jargon.** Tarek will keine Fachwortwände.
- **Umlaute:** Nutzlast über Node oder eine Datei senden, nie Sonderzeichen direkt in die Kommandozeile eines Windows-Programms — dort werden sie zerstört.

Die wichtigsten Orte:

- `tareq-fatal/SAP_FSM_API_Web_Container` — FSM-Container für Objektus. Klon: `C:\Users\sapb1\source\Sy\SAP_FSM_API_Web_Container`, live: `https://objektus-iot.delmar-tareq.workers.dev`. Achtung: jeder Push auf `main` geht sofort auf Produktion.
- `tareq-fatal/task-tracker` — der Tracker selbst. Klon: `C:\dev\task-tracker`, live: `https://tasks.coastshield.net`. Deploy über `gh workflow run deploy.yml --ref main`, Rollback ist im Deploy-Skript eingebaut.
- `tareq-fatal/mission-control` — Projekt-Übersicht. Bei Widerspruch zu Notizen gilt dieses Repo.
- Gedächtnis der Sessions: `C:\Users\sapb1\.claude\projects\C--dev\memory\`.
- Server hinter allen `*.coastshield.net`-Diensten: `marisight@13.140.146.101` mit `~/.ssh/marisight_admin_ed25519`, immer `-o IdentitiesOnly=yes`. Nicht als `root` verbinden — das sperrt die eigene IP für rund eine Stunde aus.

Melde dich am Ende mit dem Ergebnis zuerst, danach höchstens ein paar Zeilen zu dem, was offen bleibt oder was du anders gemacht hast als beauftragt.

Und halte diese Aufgabe aktuell: ändert sich etwas Grundsätzliches — ein neues Repo, ein neuer Zugang, eine geänderte Regel — trag es hier nach, in TOF-0000 und in `docs/WIEDERAUFNAHME-PROMPT.md` im Repo `task-tracker`. Beide Stellen müssen gleich bleiben.
