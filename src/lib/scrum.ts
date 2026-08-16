// Pure scrum-board logic: columns, status mapping, sticky styling, WIP. Tested.
import type { TaskStatus, TaskType } from "./enums";

// Die Reihenfolge IST der vereinbarte Ablauf (Tarek, 16.08.2026):
//   1 umsetzen        → in-progress   (Bearbeiter)
//   2 selbst testen   → self-test     (Bearbeiter)
//   3 abnehmen        → to-verify     (Auftraggeber)
//   4 ausliefern      → release       (Bearbeiter) → danach schließen
// `waiting` und `ready-for-golive` bleiben als Nebengleise erhalten, damit
// bestehende Karten nicht heimatlos werden.
export const SCRUM_COLUMNS = [
  { key: "to-do", emoji: "👀" },
  { key: "in-progress", emoji: "⏳" },
  { key: "self-test", emoji: "🧪" },
  { key: "waiting", emoji: "🚩" },
  { key: "to-verify", emoji: "🔍" },
  { key: "release", emoji: "📦" },
  { key: "done", emoji: "✅" },
  { key: "ready-for-golive", emoji: "🚀" },
] as const;

/**
 * Der Ablauf als Kette — nur die vier Schritte, ohne die Nebengleise. Wer
 * „einen Schritt weiter" braucht, fragt hier und baut die Reihenfolge nicht
 * an drei Stellen nach.
 */
export const WORKFLOW_CHAIN = ["in-progress", "self-test", "to-verify", "release"] as const;
export type WorkflowStep = (typeof WORKFLOW_CHAIN)[number];

/** Nächste Spalte im Ablauf, oder null am Ende (dort wird geschlossen). */
export function nextWorkflowColumn(col: string): ScrumColumn | null {
  const i = (WORKFLOW_CHAIN as readonly string[]).indexOf(col);
  if (i === -1 || i === WORKFLOW_CHAIN.length - 1) return null;
  return WORKFLOW_CHAIN[i + 1];
}

export type ScrumColumn = (typeof SCRUM_COLUMNS)[number]["key"];
const KEYS = SCRUM_COLUMNS.map((c) => c.key) as ScrumColumn[];

export function isScrumColumn(v: string | null | undefined): v is ScrumColumn {
  return !!v && (KEYS as string[]).includes(v);
}

/** A task's scrum column: explicit `scrumColumn`, else derived from status. */
export function columnOf(task: { scrumColumn: string | null; status: string }): ScrumColumn {
  if (isScrumColumn(task.scrumColumn)) return task.scrumColumn;
  switch (task.status as TaskStatus) {
    case "InProgress": return "in-progress";
    case "Done": return "done";
    case "Archived": return "done";
    default: return "to-do";
  }
}

/** Keep `status` coherent when a card is dropped into a scrum column. */
export function statusForColumn(col: ScrumColumn): TaskStatus {
  if (col === "to-do") return "Todo";
  if (col === "done" || col === "ready-for-golive") return "Done";
  // Auch `release` bleibt offen: ausgeliefert ist noch nicht geschlossen —
  // geschlossen wird erst, nachdem der Auftraggeber abgenommen hat.
  return "InProgress"; // in-progress | self-test | waiting | to-verify | release
}

/**
 * Auf welche Spalte muss die Karte, wenn sich der STATUS ändert?
 *
 * Nur die Fälle, in denen die alte Spalte sonst lügen würde: eine
 * geschlossene Aufgabe darf nicht in „Release" stehen bleiben, eine wieder
 * geöffnete nicht in „Erledigt". Innerhalb der offenen Spalten bleibt die
 * Karte, wo sie ist — dort trägt die Spalte mehr Bedeutung als der Status.
 *
 * @returns die neue Spalte, oder null wenn die alte gültig bleibt.
 */
export function columnForStatusChange(status: string, current: string | null): ScrumColumn | null {
  const closed = status === "Done" || status === "Archived";
  const inClosedColumn = current === "done" || current === "ready-for-golive";
  if (closed && !inClosedColumn) return "done";
  if (!closed && inClosedColumn) return statusForColumn("to-do") === status ? "to-do" : "in-progress";
  return null;
}

/** Deterministic small rotation (deg) per id — avoids hydration mismatch. */
export function stickyRotation(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffff;
  return ((h % 5) - 2) * 0.8; // -1.6 .. +1.6 deg
}

/** Pastel sticky background per task type. */
export const STICKY_COLOR: Record<TaskType, string> = {
  Story: "bg-amber-100 border-amber-200",
  Task: "bg-sky-100 border-sky-200",
  Epic: "bg-violet-100 border-violet-200",
  Bug: "bg-rose-100 border-rose-200",
  Subtask: "bg-emerald-100 border-emerald-200",
};

/** Soft WIP limits per column (0 = no limit). PR-AK will make these configurable. */
export const WIP_LIMIT: Record<ScrumColumn, number> = {
  "to-do": 0,
  "in-progress": 6,
  "self-test": 0,
  waiting: 0,
  "to-verify": 5,
  release: 0,
  done: 0,
  "ready-for-golive": 0,
};

export function isOverWip(col: ScrumColumn, count: number): boolean {
  const lim = WIP_LIMIT[col];
  return lim > 0 && count > lim;
}
