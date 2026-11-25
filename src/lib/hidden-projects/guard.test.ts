import { describe, it, expect, vi } from "vitest";
import { createHiddenGuard } from "./guard";
import { VISIBLE_TASK } from "./policy";
import { withHiddenProjects, withoutHiddenProjects, revealHiddenProjects } from "./scope";

function setup(opts: { hidden?: string[]; tasks?: string[]; reveal?: boolean } = {}) {
  let t = 0;
  const ports = {
    loadHiddenProjectIds: vi.fn(async () => opts.hidden ?? []),
    loadTaskIds: vi.fn(async () => opts.tasks ?? []),
    reveal: vi.fn(async () => opts.reveal ?? false),
    now: () => t,
  };
  return { guard: createHiddenGuard(ports), ports, tick: (ms: number) => (t += ms) };
}

describe("hidden-projects guard", () => {
  it("adds nothing (and no join) while no project is hidden", async () => {
    const { guard } = setup();
    const args = { where: { tenantId: "t" } };
    expect(await guard.apply("Task", "findMany", args)).toBe(args);
  });

  it("filters projects, tasks and task children once something is hidden", async () => {
    const { guard } = setup({ hidden: ["p1"] });
    expect(await guard.apply("Project", "findMany", { where: { tenantId: "t" } })).toEqual({
      where: { tenantId: "t", AND: [{ hiddenAt: null }] },
    });
    expect(await guard.apply("Task", "count", { where: { tenantId: "t" } })).toEqual({
      where: { tenantId: "t", AND: [VISIBLE_TASK] },
    });
    expect(await guard.apply("TaskComment", "findMany", {})).toEqual({
      where: { AND: [{ task: VISIBLE_TASK }] },
    });
    expect(await guard.apply("Lead", "groupBy", { by: ["status"] })).toEqual({
      by: ["status"],
      where: { AND: [{ project: { hiddenAt: null } }] },
    });
  });

  it("applies to findUnique too — a hidden project does not exist even by direct link", async () => {
    const { guard } = setup({ hidden: ["p1"] });
    expect(await guard.apply("Project", "findUnique", { where: { id: "p1" } })).toEqual({
      where: { id: "p1", AND: [{ hiddenAt: null }] },
    });
  });

  it("never touches writes or unrelated models", async () => {
    const { guard } = setup({ hidden: ["p1"] });
    const args = { where: { id: "p1" }, data: { hiddenAt: null } };
    expect(await guard.apply("Project", "update", args)).toBe(args);
    expect(await guard.apply("Project", "updateMany", args)).toBe(args);
    const userArgs = { where: { id: "u" } };
    expect(await guard.apply("User", "findMany", userArgs)).toBe(userArgs);
    expect(await guard.apply(undefined, "$queryRaw", undefined)).toBeUndefined();
  });

  it("lets the explicit reveal mode through unfiltered", async () => {
    const { guard } = setup({ hidden: ["p1"], reveal: true });
    const args = { where: { tenantId: "t" } };
    expect(await guard.apply("Task", "findMany", args)).toBe(args);
  });

  it("filters notifications via task ids + project urls (loaded lazily, once)", async () => {
    const { guard, ports } = setup({ hidden: ["p1"], tasks: ["t1"] });
    await guard.apply("Task", "findMany", {});
    expect(ports.loadTaskIds).not.toHaveBeenCalled();
    const out = (await guard.apply("Notification", "count", { where: { userId: "u", read: false } })) as {
      where: { AND: { AND: unknown[] }[] };
    };
    expect(out.where.AND[0].AND[0]).toEqual({ OR: [{ taskId: null }, { taskId: { notIn: ["t1"] } }] });
    await guard.apply("Notification", "findMany", {});
    expect(ports.loadTaskIds).toHaveBeenCalledTimes(1);
  });

  it("caches the hidden index briefly and reloads after invalidate()", async () => {
    const { guard, ports, tick } = setup({ hidden: ["p1"] });
    await guard.apply("Task", "findMany", {});
    await guard.apply("Task", "findMany", {});
    expect(ports.loadHiddenProjectIds).toHaveBeenCalledTimes(1);
    guard.invalidate();
    await guard.apply("Task", "findMany", {});
    expect(ports.loadHiddenProjectIds).toHaveBeenCalledTimes(2);
    tick(10_000);
    await guard.apply("Task", "findMany", {});
    expect(ports.loadHiddenProjectIds).toHaveBeenCalledTimes(3);
  });
});

describe("hidden-projects scope", () => {
  it("is fail-closed outside a request and honours explicit scopes", async () => {
    process.env.SESSION_SECRET = ["unit", "secret"].join("-");
    expect(await revealHiddenProjects()).toBe(false);
    expect(await withHiddenProjects(() => revealHiddenProjects())).toBe(true);
    expect(await withHiddenProjects(() => withoutHiddenProjects(() => revealHiddenProjects()))).toBe(false);
    // Scope endet mit dem Callback.
    expect(await revealHiddenProjects()).toBe(false);
  });

  it("evaluates LAZY thenables (Prisma queries) inside the scope", async () => {
    // Wie ein PrismaPromise: die Arbeit startet erst beim then().
    const lazy = { then: (ok: (v: boolean) => void) => void revealHiddenProjects().then(ok) };
    expect(await withHiddenProjects(() => lazy as unknown as Promise<boolean>)).toBe(true);
  });

  it("keeps the scope across awaits and parallel work inside it", async () => {
    const inside = await withHiddenProjects(async () => {
      await new Promise((r) => setTimeout(r, 1));
      return Promise.all([revealHiddenProjects(), revealHiddenProjects()]);
    });
    expect(inside).toEqual([true, true]);
  });
});
