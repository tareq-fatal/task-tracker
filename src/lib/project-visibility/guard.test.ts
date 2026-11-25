import { describe, it, expect, vi } from "vitest";
import { createVisibilityGuard, effectiveConcealment, type VisibilityIndex } from "./guard";
import { visibleTaskWhere } from "./policy";
import {
  withAllProjects,
  withHiddenProjects,
  withFullConcealment,
  currentVisibilityScope,
  revealHiddenProjects,
  type VisibilityScope,
} from "./scope";

const NONE: VisibilityScope = { revealHidden: false, ignoreLevel: false };

function setup(index: Partial<VisibilityIndex> = {}, scope: VisibilityScope = NONE) {
  let t = 0;
  const full: VisibilityIndex = { hiddenProjectIds: [], restrictions: [], ...index };
  const ports = {
    loadIndex: vi.fn(async () => full),
    loadConcealedIds: vi.fn(async () => ({ projectIds: ["p1"], taskIds: ["t1"] })),
    scope: vi.fn(async () => scope),
    now: () => t,
  };
  return { guard: createVisibilityGuard(ports), ports, tick: (ms: number) => (t += ms) };
}

const LEVEL = { restrictions: [{ tenantId: "t1", allowed: ["objektus" as const] }] };

describe("visibility guard", () => {
  it("adds nothing (and no join) while nothing is hidden and no display level is set", async () => {
    const { guard } = setup();
    const args = { where: { tenantId: "t" } };
    expect(await guard.apply("Task", "findMany", args)).toBe(args);
  });

  it("filters by display level: projects, tasks and children", async () => {
    const { guard } = setup(LEVEL);
    const levelWhere = { NOT: { OR: [{ tenantId: "t1", affiliation: { notIn: ["objektus"] } }] } };
    expect(await guard.apply("Project", "findMany", { where: { tenantId: "t1" } })).toEqual({
      where: { tenantId: "t1", AND: [levelWhere] },
    });
    expect(await guard.apply("Task", "findUnique", { where: { id: "k" } })).toEqual({
      where: { id: "k", AND: [visibleTaskWhere({ hidden: false, restrictions: LEVEL.restrictions })] },
    });
    expect(await guard.apply("Lead", "count", {})).toEqual({ where: { AND: [{ project: levelWhere }] } });
  });

  it("never touches writes or unrelated models", async () => {
    const { guard } = setup({ hiddenProjectIds: ["p1"], ...LEVEL });
    const args = { where: { id: "p1" }, data: {} };
    expect(await guard.apply("Project", "updateMany", args)).toBe(args);
    const u = { where: { id: "u" } };
    expect(await guard.apply("User", "findMany", u)).toBe(u);
    expect(await guard.apply("Tenant", "findUnique", u)).toBe(u);
    expect(await guard.apply(undefined, "$queryRaw", undefined)).toBeUndefined();
  });

  it("reveal mode lifts ONLY the hidden axis; the display level still applies", () => {
    const idx: VisibilityIndex = { hiddenProjectIds: ["p1"], ...LEVEL };
    expect(effectiveConcealment(idx, { revealHidden: true, ignoreLevel: false })).toEqual({
      hidden: false,
      restrictions: LEVEL.restrictions,
    });
    expect(effectiveConcealment(idx, { revealHidden: true, ignoreLevel: true })).toEqual({ hidden: false, restrictions: [] });
    expect(effectiveConcealment(idx, NONE)).toEqual({ hidden: true, restrictions: LEVEL.restrictions });
  });

  it("system scope (all projects) passes through unfiltered", async () => {
    const { guard } = setup({ hiddenProjectIds: ["p1"], ...LEVEL }, { revealHidden: true, ignoreLevel: true });
    const args = { where: { tenantId: "t1" } };
    expect(await guard.apply("Task", "findMany", args)).toBe(args);
  });

  it("notifications: ids loaded lazily, once per concealment", async () => {
    const { guard, ports } = setup(LEVEL);
    await guard.apply("Task", "findMany", {});
    expect(ports.loadConcealedIds).not.toHaveBeenCalled();
    const out = (await guard.apply("Notification", "count", { where: { userId: "u" } })) as { where: { AND: unknown[] } };
    expect(JSON.stringify(out.where.AND)).toContain('"notIn":["t1"]');
    await guard.apply("Notification", "findMany", {});
    expect(ports.loadConcealedIds).toHaveBeenCalledTimes(1);
  });

  it("caches briefly and reloads after invalidate()", async () => {
    const { guard, ports, tick } = setup(LEVEL);
    await guard.apply("Task", "findMany", {});
    await guard.apply("Task", "findMany", {});
    expect(ports.loadIndex).toHaveBeenCalledTimes(1);
    guard.invalidate();
    await guard.apply("Task", "findMany", {});
    expect(ports.loadIndex).toHaveBeenCalledTimes(2);
    tick(10_000);
    await guard.apply("Task", "findMany", {});
    expect(ports.loadIndex).toHaveBeenCalledTimes(3);
  });
});

describe("visibility scope", () => {
  it("is fail-closed outside a request and honours explicit scopes", async () => {
    process.env.SESSION_SECRET = ["unit", "secret"].join("-");
    expect(await currentVisibilityScope()).toEqual(NONE);
    expect(await withAllProjects(() => currentVisibilityScope())).toEqual({ revealHidden: true, ignoreLevel: true });
    expect(await withHiddenProjects(() => currentVisibilityScope())).toEqual({ revealHidden: true, ignoreLevel: false });
    expect(await withAllProjects(() => withFullConcealment(() => currentVisibilityScope()))).toEqual(NONE);
    expect(await revealHiddenProjects()).toBe(false);
  });

  it("evaluates LAZY thenables (Prisma queries) inside the scope", async () => {
    const lazy = { then: (ok: (v: VisibilityScope) => void) => void currentVisibilityScope().then(ok) };
    expect(await withAllProjects(() => lazy as unknown as Promise<VisibilityScope>)).toEqual({
      revealHidden: true,
      ignoreLevel: true,
    });
  });

  it("keeps the scope across awaits and parallel work", async () => {
    const inside = await withAllProjects(async () => {
      await new Promise((r) => setTimeout(r, 1));
      return Promise.all([revealHiddenProjects(), revealHiddenProjects()]);
    });
    expect(inside).toEqual([true, true]);
  });
});
