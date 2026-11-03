# Hinweise für KI-Agenten (jede KI)

- **Projekt-Wissen (TOF-0839):** Zu Beginn jeder Sitzung `projekt_kontext(projectId)` (oder
  `wissen_lesen(projectId)`), am Ende `wissen_schreiben` (neues Wissen) und
  `entscheidung_hinzufuegen` (Entscheidungen mit Begründung). Das Task-Tracker-Projekt selbst
  hat die Id `cmssz6cce006u1sx43uyo9hvi`. Einzelheiten: [docs/WISSEN.md](docs/WISSEN.md).
- Keine Zugangsdaten in Wissen, Aufgaben, Commits oder PR-Texte — der Server lehnt sie im Wissen ab.
- Arbeitsablauf und MCP-Werkzeuge: [docs/MCP.md](docs/MCP.md), [docs/ABLAUF.md](docs/ABLAUF.md).
