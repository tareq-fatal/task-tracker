import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  AFFILIATIONS,
  FILTERED_OPERATIONS,
  MODEL_RELATIONS,
  isAffiliation,
  mergeWhere,
  modelWhere,
  notificationWhere,
  projectIdFromUrl,
  visibleProjectWhere,
  visibleTaskWhere,
  type Concealment,
} from "./policy";

const schema = readFileSync(join(__dirname, "..", "..", "..", "prisma", "schema.prisma"), "utf8");

function modelsRelatedVia(field: "projectId" | "taskId"): string[] {
  const out: string[] = [];
  let current = "";
  for (const line of schema.split("\n")) {
    const m = /^model (\w+) \{/.exec(line);
    if (m) current = m[1];
    if (new RegExp(`@relation\\([^)]*fields: \\[${field}\\]`).test(line)) out.push(current);
  }
  return [...new Set(out)];
}

const HIDDEN: Concealment = { hidden: true, restrictions: [] };
const LEVEL: Concealment = { hidden: false, restrictions: [{ tenantId: "t1", allowed: ["objektus"] }] };
const BOTH: Concealment = { hidden: true, restrictions: LEVEL.restrictions };

describe("project-visibility policy", () => {
  it("covers EVERY model that hangs off a project or a task (schema drift guard)", () => {
    // TaskLink wird nur verschachtelt gelesen und dort gefiltert (tasks/[id]/page.tsx).
    const exempt = new Set(["TaskLink"]);
    const related = [...modelsRelatedVia("projectId"), ...modelsRelatedVia("taskId")].filter((m) => !exempt.has(m));
    const missing = related.filter((m) => !(m in MODEL_RELATIONS));
    expect(missing, `neue Modelle in policy.ts eintragen: ${missing.join(", ")}`).toEqual([]);
  });

  it("affiliations match the Prisma enum exactly", () => {
    const enumBody = /enum ProjectAffiliation \{([^}]*)\}/.exec(schema)?.[1] ?? "";
    const values = enumBody.split("\n").map((l) => l.replace(/\/\/.*/, "").trim()).filter(Boolean);
    expect(values).toEqual([...AFFILIATIONS]);
    expect(isAffiliation("objektus")).toBe(true);
    expect(isAffiliation("Objektus")).toBe(false);
  });

  it("only filters read operations — writes stay untouched", () => {
    for (const op of ["create", "update", "updateMany", "upsert", "delete", "deleteMany", "createMany"]) {
      expect(FILTERED_OPERATIONS.has(op)).toBe(false);
    }
    for (const op of ["findMany", "findFirst", "findUnique", "count", "aggregate", "groupBy"]) {
      expect(FILTERED_OPERATIONS.has(op)).toBe(true);
    }
  });

  it("builds the project condition per axis", () => {
    expect(visibleProjectWhere(HIDDEN)).toEqual({ hiddenAt: null });
    expect(visibleProjectWhere(LEVEL)).toEqual({
      NOT: { OR: [{ tenantId: "t1", affiliation: { notIn: ["objektus"] } }] },
    });
    expect(visibleProjectWhere(BOTH)).toEqual({
      AND: [{ hiddenAt: null }, { NOT: { OR: [{ tenantId: "t1", affiliation: { notIn: ["objektus"] } }] } }],
    });
  });

  it("hides tasks without a project only in a tenant with an active display level", () => {
    expect(visibleTaskWhere(HIDDEN)).toEqual({ OR: [{ projectId: null }, { project: { hiddenAt: null } }] });
    expect((visibleTaskWhere(LEVEL) as { OR: unknown[] }).OR[0]).toEqual({
      projectId: null,
      tenantId: { notIn: ["t1"] },
    });
  });

  it("maps every relation kind", () => {
    expect(modelWhere("Lead", HIDDEN)).toEqual({ project: { hiddenAt: null } });
    expect(modelWhere("CustomFieldDef", HIDDEN)).toEqual({ OR: [{ projectId: null }, { project: { hiddenAt: null } }] });
    expect(modelWhere("TaskComment", HIDDEN)).toEqual({ task: visibleTaskWhere(HIDDEN) });
    expect(modelWhere("User", HIDDEN)).toBeNull();
  });

  it("keeps unique selectors on top level and appends to an existing AND", () => {
    expect(mergeWhere({ id: "x" }, { hiddenAt: null })).toEqual({ id: "x", AND: [{ hiddenAt: null }] });
    expect(mergeWhere({ id: "x", AND: { a: 1 } }, { b: 2 })).toEqual({ id: "x", AND: [{ a: 1 }, { b: 2 }] });
    expect(mergeWhere(undefined, { b: 2 })).toEqual({ AND: [{ b: 2 }] });
  });

  it("filters notifications by task ids and project urls, keeping rows without either", () => {
    expect(notificationWhere([], [])).toBeNull();
    const f = notificationWhere(["p1"], ["t1"]) as { AND: unknown[] };
    expect(f.AND).toEqual([
      { OR: [{ taskId: null }, { taskId: { notIn: ["t1"] } }] },
      { OR: [{ url: null }, { NOT: { OR: [{ url: { startsWith: "/projects/p1" } }] } }] },
    ]);
  });

  it("reads the project id out of an app url", () => {
    expect(projectIdFromUrl("/projects/cm123/board")).toBe("cm123");
    expect(projectIdFromUrl("/tasks/cm123")).toBeNull();
    expect(projectIdFromUrl(null)).toBeNull();
  });
});
