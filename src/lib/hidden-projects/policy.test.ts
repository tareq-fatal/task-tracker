import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  MODEL_FILTERS,
  FILTERED_OPERATIONS,
  mergeWhere,
  notificationFilter,
  projectIdFromUrl,
  VISIBLE_TASK,
} from "./policy";

const schema = readFileSync(join(__dirname, "..", "..", "..", "prisma", "schema.prisma"), "utf8");

/** Modelle mit einer Relation über projectId bzw. taskId (aus dem Schema gelesen). */
function modelsRelatedVia(field: "projectId" | "taskId" | "linkedTaskId"): string[] {
  const out: string[] = [];
  let current = "";
  for (const line of schema.split("\n")) {
    const m = /^model (\w+) \{/.exec(line);
    if (m) current = m[1];
    if (new RegExp(`@relation\\([^)]*fields: \\[${field}\\]`).test(line)) out.push(current);
  }
  return [...new Set(out)];
}

describe("hidden-projects policy", () => {
  it("covers EVERY model that hangs off a project or a task (schema drift guard)", () => {
    // Bewusst ausgenommen: TaskLink wird nur verschachtelt gelesen und dort
    // gefiltert (tasks/[id]/page.tsx).
    const exempt = new Set(["TaskLink"]);
    const related = [...modelsRelatedVia("projectId"), ...modelsRelatedVia("taskId")].filter(
      (m) => !exempt.has(m)
    );
    const missing = related.filter((m) => !(m in MODEL_FILTERS));
    expect(missing, `neue Modelle in policy.ts eintragen: ${missing.join(", ")}`).toEqual([]);
    expect(MODEL_FILTERS.Project).toEqual({ hiddenAt: null });
    expect(MODEL_FILTERS.Task).toEqual(VISIBLE_TASK);
  });

  it("only filters read operations — writes stay untouched", () => {
    for (const op of ["create", "update", "updateMany", "upsert", "delete", "deleteMany", "createMany"]) {
      expect(FILTERED_OPERATIONS.has(op)).toBe(false);
    }
    for (const op of ["findMany", "findFirst", "findUnique", "count", "aggregate", "groupBy"]) {
      expect(FILTERED_OPERATIONS.has(op)).toBe(true);
    }
  });

  it("keeps unique selectors on top level and appends to an existing AND", () => {
    expect(mergeWhere({ id: "x" }, { hiddenAt: null })).toEqual({ id: "x", AND: [{ hiddenAt: null }] });
    expect(mergeWhere({ id: "x", AND: { a: 1 } }, { b: 2 })).toEqual({ id: "x", AND: [{ a: 1 }, { b: 2 }] });
    expect(mergeWhere({ AND: [{ a: 1 }] }, { b: 2 })).toEqual({ AND: [{ a: 1 }, { b: 2 }] });
    expect(mergeWhere(undefined, { b: 2 })).toEqual({ AND: [{ b: 2 }] });
    // Ein OR des Aufrufers bleibt unangetastet und wird zusätzlich eingeschränkt.
    const caller = { OR: [{ assignedToUserId: "u" }, { createdByUserId: "u" }] };
    expect(mergeWhere(caller, VISIBLE_TASK)).toEqual({ ...caller, AND: [VISIBLE_TASK] });
  });

  it("filters notifications by task id and project url, keeping rows without either", () => {
    expect(notificationFilter([], ["t1"])).toBeNull();
    const f = notificationFilter(["p1"], ["t1", "t2"]) as { AND: unknown[] };
    expect(f.AND).toEqual([
      { OR: [{ taskId: null }, { taskId: { notIn: ["t1", "t2"] } }] },
      { OR: [{ url: null }, { NOT: { OR: [{ url: { startsWith: "/projects/p1" } }] } }] },
    ]);
    // Verborgenes Projekt ohne Aufgaben: nur der URL-Teil.
    expect((notificationFilter(["p1"], []) as { AND: unknown[] }).AND).toHaveLength(1);
  });

  it("reads the project id out of an app url", () => {
    expect(projectIdFromUrl("/projects/cm123/board")).toBe("cm123");
    expect(projectIdFromUrl("/projects/cm123?x=1")).toBe("cm123");
    expect(projectIdFromUrl("/tasks/cm123")).toBeNull();
    expect(projectIdFromUrl(null)).toBeNull();
  });
});
