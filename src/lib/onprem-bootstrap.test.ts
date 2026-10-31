import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRequire } from "node:module";
import { resolve, join } from "node:path";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { hashInviteToken, isPlausibleInviteToken, INVITE_TTL_HOURS } from "./invite";

// TOF-0794 (Tarek 31.10.2026): deployment/task-tracker-usb/lib/bootstrap-admin.cjs
// legt den Superuser per Einladungslink an — exakt wie die App (lib/invite.ts,
// lib/invite-server.ts). Hier gegen ein In-Memory-Prisma ausgeführt.

const SCRIPT = resolve("deployment/task-tracker-usb/lib/bootstrap-admin.cjs");
const req = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Module = req("node:module") as any;

type Row = Record<string, unknown> & { id: string };

function makeDb() {
  let n = 0;
  const id = (p: string) => `${p}_${++n}`;
  const db = {
    tenants: [] as Row[],
    users: [] as Row[],
    invites: [] as Row[],
    hashed: [] as string[],
  };
  const byWhere = (rows: Row[], where: Record<string, unknown>) =>
    rows.find((r) => Object.entries(where).every(([k, v]) => r[k] === v)) ?? null;
  const count = (rows: Row[]) => async ({ where }: { where: Record<string, unknown> }) =>
    rows.filter((r) => Object.entries(where).every(([k, v]) => r[k] === v)).length;
  let resolveDone: () => void = () => {};
  const done = new Promise<void>((r) => (resolveDone = r));
  const prisma = {
    tenant: {
      findUnique: async ({ where }: { where: Record<string, unknown> }) => byWhere(db.tenants, where),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: id("tenant"), ...data };
        db.tenants.push(row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = byWhere(db.tenants, where)!;
        Object.assign(row, data);
        return row;
      },
      delete: async ({ where }: { where: { id: string } }) => {
        db.tenants = db.tenants.filter((t) => t.id !== where.id);
      },
    },
    user: {
      findUnique: async ({ where }: { where: Record<string, unknown> }) => byWhere(db.users, where),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: id("user"), deactivatedAt: null, ...data };
        db.users.push(row);
        return row;
      },
      count: count(db.users),
    },
    project: { count: async () => 0 },
    team: { count: async () => 0 },
    task: { count: async () => 0 },
    apiToken: { count: async () => 0 },
    invite: {
      count: count(db.invites),
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const hit = db.invites.filter((r) => Object.entries(where).every(([k, v]) => r[k] === v));
        hit.forEach((r) => Object.assign(r, data));
        return { count: hit.length };
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: id("invite"), usedAt: null, ...data };
        db.invites.push(row);
        return row;
      },
    },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
    $disconnect: async () => resolveDone(),
  };
  return { db, prisma, done };
}

let origLoad: unknown;
let logs: string[];
let errors: string[];
let exitCode: number | undefined;
const ENV_KEYS = [
  "TT_TENANT_SLUG", "TT_TENANT_NAME", "TT_LOCALE", "ADMIN_USERNAME", "ADMIN_PASSWORD",
  "ADMIN_EMAIL", "TT_PUBLIC_URL", "APP_URL", "TT_INVITE_HOURS", "TT_NEW_INVITE", "TT_INVITE_ONLY",
  "TT_LOGO_SRC", "TT_LOGO_EXT", "UPLOAD_DIR",
];
const savedEnv: Record<string, string | undefined> = {};

async function run(fake: ReturnType<typeof makeDb>, env: Record<string, string>) {
  for (const k of ENV_KEYS) delete process.env[k];
  Object.assign(process.env, env);
  Module._load = function (request: string, ...rest: unknown[]) {
    if (request === "@prisma/client") return { PrismaClient: function () { return fake.prisma; } };
    if (request === "@node-rs/argon2")
      return { hash: async (pw: string) => { fake.db.hashed.push(pw); return `argon2(${pw.length})`; } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (origLoad as any).call(this, request, ...rest);
  };
  delete req.cache[SCRIPT];
  req(SCRIPT);
  await fake.done;
}

beforeEach(() => {
  origLoad = Module._load;
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
  logs = [];
  errors = [];
  exitCode = undefined;
  vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => void logs.push(a.join(" ")));
  vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => void errors.push(a.join(" ")));
  // Erster Exit-Code zählt; nicht werfen (das Skript ruft exit auch im catch).
  vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
    if (exitCode === undefined) exitCode = code;
  }) as never);
});

afterEach(() => {
  Module._load = origLoad;
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  vi.restoreAllMocks();
});

const BASE = {
  TT_TENANT_SLUG: "coast-shield",
  TT_TENANT_NAME: "Coast Shield",
  TT_LOCALE: "ar",
  ADMIN_USERNAME: "Admin",
  ADMIN_EMAIL: "admin@tracker.marine.local",
  TT_PUBLIC_URL: "https://192.168.1.10/",
};

function linkFrom(out: string[]) {
  const line = out.find((l) => l.startsWith("invite_url="));
  expect(line).toBeTruthy();
  const url = line!.slice("invite_url=".length);
  const m = /^https:\/\/192\.168\.1\.10\/einladung\/([A-Za-z0-9_-]+)$/.exec(url);
  expect(m).toBeTruthy();
  return m![1];
}

describe("TOF-0794: Superuser per Einladungslink (bootstrap-admin.cjs)", () => {
  it("frische Installation: leerer default-Mandant wird umbenannt, Superuser + Einladung wie in der App", async () => {
    const fake = makeDb();
    fake.db.tenants.push({ id: "tenant_default", slug: "default", name: "Default" });
    const before = Date.now();
    await run(fake, BASE);

    expect(exitCode).toBeUndefined();
    // Mandant: der leere Migrations-Mandant heißt jetzt wie gewünscht — genau einer.
    expect(fake.db.tenants).toEqual([{ id: "tenant_default", slug: "coast-shield", name: "Coast Shield" }]);
    expect(logs).toContain("renamed=empty-default-tenant");

    // Superuser
    expect(fake.db.users).toHaveLength(1);
    const u = fake.db.users[0];
    expect(u).toMatchObject({ username: "admin", role: "BackendAdmin", locale: "ar", tenantId: "tenant_default", mustChangePassword: false });
    // Zufallsgeheimnis (64 hex), gehasht, nirgends ausgegeben
    expect(fake.db.hashed).toHaveLength(1);
    const secret = fake.db.hashed[0];
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
    expect([...logs, ...errors].join("\n")).not.toContain(secret);

    // Einladung exakt wie lib/invite.ts
    const raw = linkFrom(logs);
    expect(isPlausibleInviteToken(raw)).toBe(true);
    expect(fake.db.invites).toHaveLength(1);
    const inv = fake.db.invites[0];
    expect(inv.tokenHash).toBe(hashInviteToken(raw));
    expect(JSON.stringify(fake.db.invites)).not.toContain(raw); // nur der Hash liegt in der DB
    expect(inv).toMatchObject({ userId: u.id, tenantId: "tenant_default", createdById: u.id, usedAt: null });
    const ttl = (inv.expiresAt as Date).getTime() - before;
    expect(ttl).toBeGreaterThanOrEqual(INVITE_TTL_HOURS * 3600_000 - 1000);
    expect(ttl).toBeLessThanOrEqual(INVITE_TTL_HOURS * 3600_000 + 5000);
    expect(logs.find((l) => l.startsWith("invite_expires="))).toBe(`invite_expires=${(inv.expiresAt as Date).toISOString()}`);
    expect(logs.some((l) => l.startsWith("status=created") && l.includes("mode=invite"))).toBe(true);
  });

  it("idempotent: existiert der Superuser, entsteht KEIN neuer Link (ohne TT_NEW_INVITE)", async () => {
    const fake = makeDb();
    await run(fake, BASE);
    const firstInvites = fake.db.invites.length;
    // gleiche Daten, neuer Lauf
    const second = makeDb();
    second.db.tenants = fake.db.tenants;
    second.db.users = fake.db.users;
    second.db.invites = fake.db.invites;
    logs = [];
    await run(second, BASE);
    expect(second.db.users).toHaveLength(1);
    expect(second.db.invites).toHaveLength(firstInvites);
    expect(second.db.hashed).toHaveLength(0); // Passwort unberührt
    expect(logs.some((l) => l.startsWith("invite_url="))).toBe(false);
    expect(logs.some((l) => l.startsWith("status=exists"))).toBe(true);
  });

  it("TT_NEW_INVITE=1: alte offene Einladung entwertet (usedAt), neue erzeugt", async () => {
    const fake = makeDb();
    await run(fake, BASE);
    const second = makeDb();
    second.db.tenants = fake.db.tenants;
    second.db.users = fake.db.users;
    second.db.invites = fake.db.invites;
    logs = [];
    await run(second, { ...BASE, TT_NEW_INVITE: "1", TT_INVITE_HOURS: "24" });
    expect(second.db.invites).toHaveLength(2);
    expect(second.db.invites[0].usedAt).toBeInstanceOf(Date);
    expect(second.db.invites[1].usedAt).toBeNull();
    const raw = linkFrom(logs);
    expect(second.db.invites[1].tokenHash).toBe(hashInviteToken(raw));
    const ttl = (second.db.invites[1].expiresAt as Date).getTime() - Date.now();
    expect(Math.round(ttl / 3600_000)).toBe(24);
  });

  it("invite.sh (TT_INVITE_ONLY): unbekannter Benutzer → Abbruch, nichts angelegt", async () => {
    const fake = makeDb();
    await run(fake, { ...BASE, TT_INVITE_ONLY: "1", ADMIN_USERNAME: "nobody" });
    expect(exitCode).toBe(3);
    expect(fake.db.users).toHaveLength(0);
    expect(fake.db.tenants).toHaveLength(0);
    expect(fake.db.invites).toHaveLength(0);
  });

  it("Ausnahme --admin-password: Passwort gehasht, nie ausgegeben, keine Einladung", async () => {
    const fake = makeDb();
    await run(fake, { ...BASE, ADMIN_PASSWORD: "Sehr-Geheim-123" });
    expect(fake.db.hashed).toEqual(["Sehr-Geheim-123"]);
    expect(fake.db.invites).toHaveLength(0);
    expect([...logs, ...errors].join("\n")).not.toContain("Sehr-Geheim-123");
    expect(logs.some((l) => l.includes("mode=password"))).toBe(true);
  });

  it("Mandant mit Daten bleibt unberührt — neuer Mandant wird angelegt", async () => {
    const fake = makeDb();
    fake.db.tenants.push({ id: "tenant_default", slug: "default", name: "Default" });
    fake.db.users.push({ id: "u_old", username: "alt", tenantId: "tenant_default", deactivatedAt: null });
    await run(fake, BASE);
    expect(fake.db.tenants.map((t) => t.slug).sort()).toEqual(["coast-shield", "default"]);
    expect(logs).not.toContain("renamed=empty-default-tenant");
  });
  // TOF-0795 (Tarek 31.10.2026): install.sh --logo
  it("Logo: landet in <UPLOAD_ROOT>/tenants/<slug>/logo.<ext>, tenant.logo wie branding.ts", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tt-logo-"));
    const src = join(dir, "in.png");
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    writeFileSync(src, png);
    const fake = makeDb();
    await run(fake, { ...BASE, TT_LOGO_SRC: src, TT_LOGO_EXT: "png", UPLOAD_DIR: join(dir, "up") });
    expect(exitCode).toBeUndefined();
    const out = join(dir, "up", "tenants", "coast-shield", "logo.png");
    expect(existsSync(out)).toBe(true);
    expect(readFileSync(out).equals(png)).toBe(true);
    const url = `/uploads/tenants/coast-shield/logo.png?v=${png.length}`;
    expect(fake.db.tenants[0].logo).toBe(url);
    expect(logs).toContain(`logo_url=${url}`);
  });

  it("Logo bei bestehendem Superuser: dessen Mandant; ungültiger Typ wird übersprungen, kein Abbruch", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tt-logo-"));
    const src = join(dir, "in.webp");
    writeFileSync(src, Buffer.from("RIFF0000WEBPxxxx"));
    const fake = makeDb();
    await run(fake, BASE);
    const again = makeDb();
    again.db.tenants = fake.db.tenants;
    again.db.users = fake.db.users;
    again.db.invites = fake.db.invites;
    logs = [];
    await run(again, { ...BASE, TT_TENANT_SLUG: "anders", TT_LOGO_SRC: src, TT_LOGO_EXT: "webp", UPLOAD_DIR: dir });
    const home = again.db.tenants.find((t) => t.id === again.db.users[0].tenantId)!;
    expect(home.logo).toBe(`/uploads/tenants/${home.slug}/logo.webp?v=16`);

    const bad = makeDb();
    errors = [];
    await run(bad, { ...BASE, TT_LOGO_SRC: src, TT_LOGO_EXT: "gif", UPLOAD_DIR: dir });
    expect(exitCode).toBeUndefined();
    expect(bad.db.users).toHaveLength(1);
    expect(bad.db.tenants[0].logo).toBeUndefined();
    expect(errors.join("\n")).toMatch(/logo skipped/);
  });
});
