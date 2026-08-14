import type { ScrumColumn } from "./scrum";
import { columnOf } from "./scrum";

// "Als Nächstes" — die Antwort auf Tareks Problem vom 14.08.2026: 164 offene
// Aufgaben sind keine Arbeitsliste. Diese Datei entscheidet rein rechnerisch
// (also testbar, ohne Datenbank), welche höchstens zehn Zeilen eine Person
// wirklich als Nächstes anfassen muss, und in welchen Eimer sie gehören.

export type NextBucket = "verify" | "blocked" | "decide" | "doing";

/** Reihenfolge der Abschnitte auf der Seite. */
export const NEXT_BUCKETS: NextBucket[] = ["verify", "blocked", "decide", "doing"];

/** Höchstzahl der Zeilen. Bewusst klein — eine Liste, die man zu Ende liest. */
export const NEXT_UP_LIMIT = 10;

export type NextUpTask = {
  id: string;
  status: string;
  priority: string;
  dueDate: Date | string | null;
  scrumColumn: string | null;
  /** Offene Aufgaben, auf die diese hier wartet (DependsOn/Blocks, beide Richtungen). */
  blockedByOpen: number;
};

const PRIORITY_RANK: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };

/**
 * In welchen Eimer gehört die Aufgabe?
 *
 * - `verify`  — steht in der Spalte „Zur Prüfung": wartet auf Abnahme.
 * - `blocked` — hängt an einer offenen anderen Aufgabe.
 * - `decide`  — Spalte „Wartet": liegt auf einer Entscheidung/Zulieferung.
 * - `doing`   — läuft oder ist dran.
 *
 * Abgeschlossenes und Archiviertes taucht nie auf.
 */
export function bucketOf(task: NextUpTask): NextBucket | null {
  if (task.status === "Done" || task.status === "Archived") return null;
  const col: ScrumColumn = columnOf(task);
  if (col === "done" || col === "ready-for-golive") return null;
  if (col === "to-verify") return "verify";
  if (task.blockedByOpen > 0) return "blocked";
  if (col === "waiting") return "decide";
  return "doing";
}

/** Innerhalb eines Eimers: Priorität, dann Fälligkeit (ohne Datum zuletzt). */
function compare(a: NextUpTask, b: NextUpTask): number {
  const p = (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9);
  if (p !== 0) return p;
  const da = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
  const db = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY;
  return da - db;
}

/**
 * Die höchstens zehn Zeilen, nach Eimern gruppiert und in der Reihenfolge
 * `NEXT_BUCKETS`. Die Kürzung greift über die Eimer hinweg: lieber alle
 * Prüf-Aufgaben als eine willkürliche Auswahl aus jedem Abschnitt.
 */
export function pickNextUp<T extends NextUpTask>(
  tasks: T[],
  limit = NEXT_UP_LIMIT
): { bucket: NextBucket; tasks: T[] }[] {
  const byBucket = new Map<NextBucket, T[]>();
  for (const task of tasks) {
    const b = bucketOf(task);
    if (!b) continue;
    const list = byBucket.get(b);
    if (list) list.push(task);
    else byBucket.set(b, [task]);
  }

  let left = limit;
  const out: { bucket: NextBucket; tasks: T[] }[] = [];
  for (const bucket of NEXT_BUCKETS) {
    if (left <= 0) break;
    const list = (byBucket.get(bucket) ?? []).sort(compare).slice(0, left);
    if (list.length === 0) continue;
    left -= list.length;
    out.push({ bucket, tasks: list });
  }
  return out;
}

/** Wie viele passende Aufgaben die Kürzung weggelassen hat. */
export function hiddenCount(tasks: NextUpTask[], limit = NEXT_UP_LIMIT): number {
  const total = tasks.filter((t) => bucketOf(t) !== null).length;
  return Math.max(0, total - Math.min(total, limit));
}
