import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomBytes } from "crypto";

// TOF-0967 — Anzeige-Ebene gegen ein ECHTES Postgres (Enum, text[]-Spalte,
// zentraler Filter, MCP, Push-Unterdrückung). Nur mit HIDDEN_TEST_DATABASE_URL
// (migrierte Wegwerf-DB, NIE Produktion) — siehe hidden.db.test.ts.

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

const T = { me: id("tL"), other: id("tO") };
const U = { admin: id("uA"), user: id("uU"), otherAdmin: id("uO") };
const P = { obj: id("pObj"), mar: id("pMar"), mine: id("pMine"), foreign: id("pForeign") };
const K = { obj: id("kObj"), mar: id("kMar"), mine: id("kMine"), loose: id("kLoose"), foreign: id("kForeign") };

type Mods = {
  prisma: typeof import("@/lib/prisma").prisma;
  scope: typeof import("./scope");
  svc: typeof import("./service");
  ops: typeof import("@/lib/mcp/ops");
  token: typeof import("@/lib/api-token");
  notify: typeof import("@/lib/notifications");
};
let m: Mods;

function ctx(userId: string, role: string, tenantId = T.me) {
  return {
    user: { id: userId, name: userId, username: userId, role, locale: "de" },
    tenant: { id: tenantId, slug: tenantId, name: tenantId },
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
const names = async (tenantId: string) =>
  (await m.prisma.project.findMany({ where: { tenantId }, select: { id: true } })).map((p) => p.id).sort();

run("Anzeige-Ebene (Postgres)", () => {
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
    await p.tenant.createMany({ data: [{ id: T.me, slug: T.me, name: "L" }, { id: T.other, slug: T.other, name: "O" }] });
    await p.user.createMany({
      data: [
        { id: U.admin, name: "A", username: U.admin, passwordHash: "x", role: "Admin", tenantId: T.me },
        { id: U.user, name: "U", username: U.user, passwordHash: "x", role: "User", tenantId: T.me },
        { id: U.otherAdmin, name: "O", username: U.otherAdmin, passwordHash: "x", role: "Admin", tenantId: T.other },
      ],
    });
    await p.project.createMany({
      data: [
        { id: P.obj, name: "FSM", affiliation: "objektus", createdByUserId: U.admin, tenantId: T.me },
        { id: P.mar, name: "MariSight", affiliation: "marine", createdByUserId: U.admin, tenantId: T.me },
        { id: P.mine, name: "Mawaddah", createdByUserId: U.admin, tenantId: T.me },
        { id: P.foreign, name: "Fremd", affiliation: "marine", createdByUserId: U.otherAdmin, tenantId: T.other },
      ],
    });
    const tasks: [string, string | null, string, string][] = [
      [K.obj, P.obj, "FSM Termine", T.me],
      [K.mar, P.mar, "Radar Kalibrierung", T.me],
      [K.mine, P.mine, "Mawaddah Store", T.me],
      [K.loose, null, "Lose Notiz", T.me],
      [K.foreign, P.foreign, "Fremde Aufgabe", T.other],
    ];
    for (const [key, projectId, title, tenantId] of tasks) {
      const owner = tenantId === T.me ? U.admin : U.otherAdmin;
      await p.task.create({
        data: { id: key, title, projectId, tenantId, createdByUserId: owner, ...(tenantId === T.me ? { assignees: { create: { userId: U.user } } } : {}) },
      });
    }
    await p.notification.createMany({
      data: [
        { userId: U.admin, tenantId: T.me, type: "comment", title: "zu Radar", taskId: K.mar, url: `/tasks/${K.mar}` },
        { userId: U.admin, tenantId: T.me, type: "comment", title: "Marine-Board", url: `/projects/${P.mar}/board` },
        { userId: U.admin, tenantId: T.me, type: "comment", title: "zu FSM", taskId: K.obj, url: `/tasks/${K.obj}` },
      ],
    });
    expect(await m.svc.setTenantDisplayLevel(T.me, ["objektus"])).toEqual(["objektus"]);
  }, 60_000);

  afterAll(async () => {
    if (!m) return;
    await m.prisma.notification.deleteMany({ where: { tenantId: { in: [T.me, T.other] } } });
    await m.prisma.tenant.deleteMany({ where: { id: { in: [T.me, T.other] } } });
    await m.prisma.$disconnect();
  });

  it("„Nur Objektus“: Projekte, Zähler und Direktzugriffe zeigen nur Objektus", async () => {
    const p = m.prisma;
    expect(await names(T.me)).toEqual([P.obj]);
    expect(await p.project.count({ where: { tenantId: T.me } })).toBe(1);
    expect(await p.project.findUnique({ where: { id: P.mar } })).toBeNull();
    expect(await p.project.findUnique({ where: { id: P.mine } })).toBeNull();
  });

  it("Aufgaben: nur aus Objektus — auch projektlose sind weg; Kind-Tabellen folgen", async () => {
    const p = m.prisma;
    expect((await p.task.findMany({ where: { tenantId: T.me }, select: { id: true } })).map((t) => t.id)).toEqual([K.obj]);
    expect(await p.task.findUnique({ where: { id: K.mar } })).toBeNull();
    expect(await p.task.findUnique({ where: { id: K.loose } })).toBeNull();
    expect(await p.task.count({ where: { tenantId: T.me, title: { contains: "Radar" } } })).toBe(0);
    expect(await p.taskAssignee.count({ where: { userId: U.user } })).toBe(1);
  });

  it("Glocke: Benachrichtigungen zu Marine verschwinden (Feed + Zähler)", async () => {
    const titles = (await m.prisma.notification.findMany({ where: { userId: U.admin }, select: { title: true } })).map((n) => n.title);
    expect(titles).toEqual(["zu FSM"]);
  });

  it("andere Mandanten bleiben unberührt", async () => {
    expect(await names(T.other)).toEqual([P.foreign]);
    expect(await m.prisma.task.count({ where: { tenantId: T.other } })).toBe(1);
  });

  it("Anzeigemodus für Verborgene hebt die Ebene NICHT auf; System-Scope schon", async () => {
    expect(await m.scope.withHiddenProjects(() => names(T.me))).toEqual([P.obj]);
    expect(await m.scope.withAllProjects(() => names(T.me))).toEqual([P.obj, P.mar, P.mine].sort());
  });

  it("MCP: list/get nur Objektus; includeHidden (Admin-Scope) zeigt alles mit Zugehörigkeit", async () => {
    const admin = ctx(U.admin, "Admin");
    const list = (await op("list_projects", admin, {})).data as unknown as { id: string; affiliation: string }[];
    expect(list).toEqual([expect.objectContaining({ id: P.obj, affiliation: "objektus" })]);
    expect((await op("get_task", admin, { taskId: K.mar })).status).toBe(404);
    expect(JSON.stringify((await op("list_tasks", admin, { query: "Radar" })).data)).not.toContain("Radar");
    const all = (await m.scope.withAllProjects(() => op("list_projects", admin, {}))).data as unknown as { id: string }[];
    expect(all.map((x) => x.id).sort()).toEqual([P.obj, P.mar, P.mine].sort());
  });

  it("MCP set_project_affiliation: nur Admin, nur eigener Mandant, wirkt sofort", async () => {
    expect((await op("set_project_affiliation", ctx(U.user, "User"), { projectId: P.mine, affiliation: "objektus" })).status).toBe(403);
    expect((await op("set_project_affiliation", ctx(U.otherAdmin, "Admin", T.other), { projectId: P.mine, affiliation: "objektus" })).status).toBe(404);
    expect((await op("set_project_affiliation", ctx(U.admin, "Admin"), { projectId: P.mine, affiliation: "objektus" })).status).toBe(200);
    expect(await names(T.me)).toEqual([P.obj, P.mine].sort());
    await op("set_project_affiliation", ctx(U.admin, "Admin"), { projectId: P.mine, affiliation: "tarek" });
    expect(await names(T.me)).toEqual([P.obj]);
  });

  it("kein Push/Telegram für Aufgaben außerhalb der Ebene; innerhalb schon", async () => {
    push.mockClear();
    telegram.mockClear();
    group.mockClear();
    await m.notify.notifyMany([U.user], { tenantId: T.me, type: "comment", title: "Radar", taskId: K.mar, url: `/tasks/${K.mar}` });
    await m.notify.notifyMany([U.user], { tenantId: T.me, type: "comment", title: "Lose", taskId: K.loose, url: `/tasks/${K.loose}` });
    expect(push).not.toHaveBeenCalled();
    expect(telegram).not.toHaveBeenCalled();
    expect(group).not.toHaveBeenCalled();
    await m.notify.notifyMany([U.user], { tenantId: T.me, type: "comment", title: "FSM", taskId: K.obj, url: `/tasks/${K.obj}` });
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("Mehrfachauswahl und „Zurück auf Alle“", async () => {
    expect(await m.svc.setTenantDisplayLevel(T.me, ["marine", "objektus"])).toEqual(["objektus", "marine"]);
    expect(await names(T.me)).toEqual([P.obj, P.mar].sort());
    // Alle drei gewählt = Alle (leer gespeichert)
    expect(await m.svc.setTenantDisplayLevel(T.me, ["tarek", "objektus", "marine"])).toEqual([]);
    expect(await names(T.me)).toEqual([P.obj, P.mar, P.mine].sort());
    expect(await m.prisma.task.findUnique({ where: { id: K.loose } })).not.toBeNull();
    // Müll wird ignoriert
    expect(await m.svc.setTenantDisplayLevel(T.me, ["bogus", "objektus"])).toEqual(["objektus"]);
    expect(await m.svc.setTenantDisplayLevel(T.me, [])).toEqual([]);
  });
});
