// Admin-Workflow-Kontrolle (Kundenauftrag 2026-08-04): pure Entscheidungs-
// Logik für JEDEN Status-Wechsel durch Nicht-Admins. Alle vier User-Pfade
// (Kanban-Drag, Status-Select, Bulk, Scrum-Board, Edit-Formular) rufen
// dieselbe Funktion — eine Wahrheit, unit-getestet.
//
// Regeln (Admins sind IMMER ausgenommen — A1):
//  - allowedTargetColumn gesetzt → Nicht-Admins dürfen NUR dorthin wechseln.
//    "Done" ist damit implizit admin-only, außer der Admin hat Done selbst
//    als Ziel-Spalte gewählt.
//  - requireAllTodosDone → "Done" erst, wenn keine offene Unteraufgabe mehr.
//  - requireTimeTracking → "Done" erst, wenn erfasste Minuten > 0.
// Automationen (automation-run.ts) bleiben bewusst ungefiltert — sie sind
// Admin-Konfiguration, kein User-Handeln.

export type StatusGateError = "TARGET_LOCKED" | "TODOS_OPEN" | "TIME_REQUIRED";
export type StatusGate = { ok: true } | { ok: false; error: StatusGateError };

export function checkStatusChange(opts: {
  isAdmin: boolean;
  from: string;
  to: string;
  allowedTargetColumn: string | null;
  requireAllTodosDone: boolean;
  /** Unteraufgaben mit done=false. */
  openTodos: number;
  requireTimeTracking: boolean;
  /** Summe erfasster Minuten (abgeschlossene Einträge). */
  loggedMinutes: number;
}): StatusGate {
  if (opts.isAdmin) return { ok: true };
  if (opts.to === opts.from) return { ok: true };

  if (opts.allowedTargetColumn && opts.to !== opts.allowedTargetColumn) {
    return { ok: false, error: "TARGET_LOCKED" };
  }
  if (opts.to === "Done") {
    if (opts.requireAllTodosDone && opts.openTodos > 0) {
      return { ok: false, error: "TODOS_OPEN" };
    }
    if (opts.requireTimeTracking && opts.loggedMinutes <= 0) {
      return { ok: false, error: "TIME_REQUIRED" };
    }
  }
  return { ok: true };
}
