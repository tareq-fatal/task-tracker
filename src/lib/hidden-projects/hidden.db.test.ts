import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomBytes } from "crypto";

// TOF-0966 — verborgene Projekte gegen ein ECHTES Postgres: der zentrale Filter
// in lib/prisma.ts, die MCP-Ops und die Benachrichtigungs-Unterdrückung.
// Läuft nur mit HIDDEN_TEST_DATABASE_URL (migrierte Wegwerf-DB, NIE Produktion):
//   docker run -d --name hidden-pg -e POSTGRES_PASSWORD=… -p 55433:5432 postgres:16-alpine
//   DATABASE_URL=<url> npx prisma migrate deploy
//   HIDDEN_TEST_DATABASE_URL=<url> npx vitest run src/lib/hidden-projects/hidden.db.test.ts

const URL_ = process.env.HIDDEN_TEST_DATABASE_URL;
vi.mock("server-only", () => ({}));
const push = vi.fn(async () => {});
const telegram = vi.fn(async () => {});
const group = vi.fn(async () => {});
vi.mock("../push", () => ({ notifyUser: push }));
vi.mock("../telegram", () => ({ notifyUserTelegram: telegram, broadcastToTelegramGroup: group }));
vi.mock("../email", () => ({ sendEmail: vi.fn(async () => true), basicEmailTemplate: () => "" }));

const run = URL_ ? describe : describe.skip;
const sfx = randomBytes(4).toString("hex");
const id = (s: string) => `${s}_${sfx}`;

const T = id("tH");
const U = { admin: id("uAdm"), user: id("uUsr") };
const P = { fsm: id("pFsm"), rfi: id("pRfi") };
const K = { fsm: id("kFsm"), rfi: id("kRfi"), loose: id("kLoose") };

type Mods = {
  prisma: typeof import("@/lib/prisma").prisma;
  scope: typeof import("./scope");
  svc: typeof import("./service");
  ops: typeof import("@/lib/mcp/ops");
  token: typeof import("@/lib/api-token");
  notify: typeof import("@/lib/notifications");
};
let m: Mods;

function ctx(userId: string, role: string) {
  return {
    user: { id: userId, name: userId, username: userId, role, locale: "de" },
    tenant: { id: T, slug: T, name: T },
    scopes: m.token.parseScopes("read,write"),
    tokenId: "t",
  };
}
async function op(name: string, c: ReturnType<typeof ctx>, params: unknown) {
  const o = m.ops.OPS[name];
  const parsed = o.schema.safeParse(params);
  if (!parsed.success) return { status: 400 };
  try {
    return { status: 200, data: (await o.run(c as never, parsed.data as never)) as never };
  } catch (e) {
    return { status: (e as { status?: number }).status ?? 500 };
  }
}

run("verborgene Projekte (Postgres)", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = URL_;
    m = {
      prisma: (await import("@/lib/prisma")).prisma,
      scope: await import("./scope"),
      svc: await import("./service"),
      ops: await import("@/lib/mcp/ops"),
      token: await import("@/lib/api-token"),
      notify: await import("@/lib/notifications"),
    };
    const p = m.prisma;
    await p.tenant.create({ data: { id: T, slug: T, name: "Mandant H" } });
    await p.user.createMany({
      data: [
        { id: U.admin, name: "Admin", username: U.admin, passwordHash: "x", role: "Admin", tenantId: T },
        { id: U.user, name: "User", username: U.user, passwordHash: "x", role: "User", tenantId: T },
      ],
    });
    await p.project.createMany({
      data: [
        { id: P.fsm, name: "FSM sichtbar", createdByUserId: U.admin, tenantId: T },
        { id: P.rfi, name: "RFI geheim", createdByUserId: U.admin, tenantId: T },
      ],
    });
    await p.projectMember.createMany({ data: [{ projectId: P.fsm, userId: U.user }, { projectId: P.rfi, userId: U.user }] });
    for (const [key, projectId, title] of [
      [K.fsm, P.fsm, "FSM Aufgabe"],
      [K.rfi, P.rfi, "RFI Verkehrsministerium"],
      [K.loose, null, "Ohne Projekt"],
    ] as const) {
      await p.task.create({
        data: {
          id: key,
          title,
          projectId,
          tenantId: T,
          createdByUserId: U.admin,
          assignedToUserId: U.user,
          assignees: { create: { userId: U.user } },
          comments: { create: { userId: U.admin, content: `Kommentar zu ${title}` } },
        },
      });
    }
    await p.notification.createMany({
      data: [
        { userId: U.admin, tenantId: T, type: "comment", title: "zu RFI", taskId: K.rfi, url: `/tasks/${K.rfi}` },
        { userId: U.admin, tenantId: T, type: "comment", title: "RFI-Projekt", url: `/projects/${P.rfi}/board` },
        { userId: U.admin, tenantId: T, type: "comment", title: "zu FSM", taskId: K.fsm, url: `/tasks/${K.fsm}` },
        { userId: U.admin, tenantId: T, type: "admin_activity", title: "allgemein" },
      ],
    });
    expect(await m.svc.setProjectHidden(T, P.rfi, true, U.admin)).toBe(true);
  }, 60_000);

  afterAll(async () => {
    if (!m) return;
    await m.prisma.tenant.deleteMany({ where: { id: T } });
    await m.prisma.$disconnect();
  });

  it("projects: lists, counts and direct lookups pretend it does not exist", async () => {
    const p = m.prisma;
    expect((await p.project.findMany({ where: { tenantId: T } })).map((x) => x.id)).toEqual([P.fsm]);
    expect(await p.project.count({ where: { tenantId: T } })).toBe(1);
    expect(await p.project.findUnique({ where: { id: P.rfi } })).toBeNull();
    expect(await p.project.findFirst({ where: { name: { contains: "RFI" } } })).toBeNull();
    expect(await p.projectMember.count({ where: { userId: U.user } })).toBe(1);
  });

  it("tasks + everything hanging off them vanish; tasks without a project stay", async () => {
    const p = m.prisma;
    const ids = (await p.task.findMany({ where: { tenantId: T }, select: { id: true } })).map((x) => x.id).sort();
    expect(ids).toEqual([K.fsm, K.loose].sort());
    expect(await p.task.count({ where: { tenantId: T, title: { contains: "RFI" } } })).toBe(0);
    expect(await p.task.findUnique({ where: { id: K.rfi } })).toBeNull();
    const grouped = await p.task.groupBy({ by: ["projectId"], where: { tenantId: T }, _count: true });
    expect(grouped.map((g) => g.projectId)).not.toContain(P.rfi);
    const comments = await p.taskComment.findMany({ where: { task: { tenantId: T } }, select: { content: true } });
    expect(comments.map((c) => c.content).join()).not.toContain("RFI");
    expect(await p.taskAssignee.count({ where: { userId: U.user } })).toBe(2);
  });

  it("notifications for the hidden project disappear from feed and badge", async () => {
    const p = m.prisma;
    const titles = (await p.notification.findMany({ where: { userId: U.admin }, select: { title: true } }))
      .map((n) => n.title)
      .sort();
    expect(titles).toEqual(["allgemein", "zu FSM"]);
    expect(await p.notification.count({ where: { userId: U.admin } })).toBe(2);
  });

  it("the explicit reveal scope shows everything again", async () => {
    const all = await m.scope.withHiddenProjects(() =>
      m.prisma.project.findMany({ where: { tenantId: T }, select: { id: true, hiddenAt: true } })
    );
    expect(all.map((x) => x.id).sort()).toEqual([P.fsm, P.rfi].sort());
    expect(all.find((x) => x.id === P.rfi)?.hiddenAt).toBeInstanceOf(Date);
    expect(await m.scope.withHiddenProjects(() => m.prisma.notification.count({ where: { userId: U.admin } }))).toBe(4);
  });

  it("MCP: list/get never return it; hide_project is admin-only", async () => {
    const admin = ctx(U.admin, "Admin");
    const user = ctx(U.user, "User");
    const projects = await op("list_projects", admin, {});
    expect((projects.data as unknown as { id: string }[]).map((x) => x.id)).toEqual([P.fsm]);
    const tasks = await op("list_tasks", admin, { query: "RFI" });
    expect(JSON.stringify(tasks.data)).not.toContain("RFI");
    expect((await op("get_task", admin, { taskId: K.rfi })).status).toBe(404);
    expect((await op("get_task", user, { taskId: K.rfi })).status).toBe(404);
    // Nur Admins dürfen verbergen/einblenden.
    expect((await op("hide_project", user, { projectId: P.fsm, hidden: true })).status).toBe(403);
    // Im Admin-Scope (Route: includeHidden) ist es wieder da, markiert.
    const revealed = (await m.scope.withHiddenProjects(() => op("list_projects", admin, {}))).data as unknown as {
      id: string;
      hidden?: boolean;
    }[];
    expect(revealed.find((x) => x.id === P.rfi)?.hidden).toBe(true);
  });

  it("no push / Telegram / group broadcast for a hidden task — in-app row kept for later", async () => {
    push.mockClear();
    telegram.mockClear();
    group.mockClear();
    await m.notify.notifyMany([U.user], {
      tenantId: T,
      type: "comment",
      title: "Neuer Kommentar RFI",
      taskId: K.rfi,
      url: `/tasks/${K.rfi}`,
      channelMask: {},
    });
    expect(push).not.toHaveBeenCalled();
    expect(telegram).not.toHaveBeenCalled();
    expect(group).not.toHaveBeenCalled();
    const stored = await m.scope.withHiddenProjects(() =>
      m.prisma.notification.count({ where: { userId: U.user, taskId: K.rfi } })
    );
    expect(stored).toBe(1);
    // …aber unsichtbar, solange das Projekt verborgen ist.
    expect(await m.prisma.notification.count({ where: { userId: U.user, taskId: K.rfi } })).toBe(0);

    // Gegenprobe: sichtbares Projekt → Push geht raus.
    await m.notify.notifyMany([U.user], { tenantId: T, type: "comment", title: "FSM", taskId: K.fsm, url: `/tasks/${K.fsm}` });
    expect(push).toHaveBeenCalled();
  });

  it("unhide restores everything immediately (no stale cache)", async () => {
    expect(await m.svc.setProjectHidden(T, P.rfi, false, U.admin)).toBe(true);
    expect(await m.prisma.project.count({ where: { tenantId: T } })).toBe(2);
    expect(await m.prisma.task.findUnique({ where: { id: K.rfi } })).not.toBeNull();
    // Und wieder verbergen greift ebenfalls sofort.
    expect(await m.svc.setProjectHidden(T, P.rfi, true, U.admin)).toBe(true);
    expect(await m.prisma.task.findUnique({ where: { id: K.rfi } })).toBeNull();
  });

  it("cannot hide a project of another tenant", async () => {
    expect(await m.svc.setProjectHidden("fremder-mandant", P.fsm, true, U.admin)).toBe(false);
    expect(await m.prisma.project.findUnique({ where: { id: P.fsm } })).not.toBeNull();
  });
});
