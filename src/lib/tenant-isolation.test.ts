import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative, sep } from "path";
import { tenantSlugToTry } from "./tenant-decision";
import { acceptLeadLink, leadMatchesTask } from "./leads";
import { hashInviteToken, inviteUsable, mintInviteToken } from "./invite";

// Wächter „Mandant A sieht nie B“ (TOF-0783 / TOF-0782, Tarek 28.10.2026).
// 1. Quelltext-Scan: jede Lead-/Invite-Abfrage trägt tenantId im Aufruf.
// 2. Mandantenbindung hinter getActiveTenant (reine Entscheidung).
// 3. Lead ↔ Aufgabe nur bei gleichem Mandanten UND Projekt.
// 4. Einladung gilt nur für genau ihren Benutzer in genau seinem Mandanten.

const ROOT = join(__dirname, "..");

function walk(dir: string, match: (p: string) => boolean): string[] {
  const out: string[] = [];
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) out.push(...walk(p, match));
    else if (match(p)) out.push(p);
  }
  return out;
}

/** The balanced (...) argument block of a call starting at `from` (the "("). */
function argBlock(src: string, from: number): string {
  let depth = 0;
  let out = "";
  for (let i = from; i < src.length; i++) {
    const c = src[i];
    if (c === "(") depth++;
    out += c;
    if (c === ")") {
      depth--;
      if (depth === 0) break;
    }
  }
  return out;
}

const rel = (p: string) => relative(ROOT, p).split(sep).join("/");

const files = [
  ...walk(join(ROOT, "actions"), (p) => p.endsWith(".ts") && !p.endsWith(".test.ts")),
  ...walk(join(ROOT, "app"), (p) => p.endsWith(`${sep}page.tsx`)),
  ...walk(join(ROOT, "lib"), (p) => /\.tsx?$/.test(p) && !p.endsWith(".test.ts")),
];

// Begründete Ausnahmen: Datei + Aufruf. Einlösen eines Einladungslinks kennt
// noch keinen Mandanten — gesucht wird per eindeutigem tokenHash, danach prüft
// inviteUsable() Benutzer + Mandant (Fall 4 unten).
const ALLOW = new Set([
  "actions/invites.ts prisma.invite.findUnique",
  "app/einladung/[token]/page.tsx prisma.invite.findUnique",
]);

type Call = { file: string; call: string; block: string };
function calls(model: "lead" | "invite", methods: RegExp): Call[] {
  const out: Call[] = [];
  const re = new RegExp(`prisma\\.${model}\\.(\\w+)\\s*\\(`, "g");
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      if (!methods.test(m[1])) continue;
      const block = argBlock(src, m.index + m[0].length - 1);
      out.push({ file: rel(file), call: `prisma.${model}.${m[1]}`, block });
    }
  }
  return out;
}

describe("1. source scan: every Lead/Invite query is tenant-scoped", () => {
  const leadCalls = calls("lead", /^(findMany|findFirst|updateMany|count|create)$/);
  const inviteCalls = calls("invite", /.*/);

  it("finds the queries at all (the scan itself works)", () => {
    expect(leadCalls.some((c) => c.file === "actions/leads.ts")).toBe(true);
    expect(leadCalls.some((c) => c.file === "app/(app)/projects/[id]/leads/page.tsx")).toBe(true);
    expect(inviteCalls.length).toBeGreaterThanOrEqual(3);
  });

  it("prisma.lead.* carries tenantId", () => {
    const bad = leadCalls.filter((c) => !/\btenantId\b/.test(c.block)).map((c) => `${c.file} ${c.call}`);
    expect(bad).toEqual([]);
  });

  it("lead queries in actions/leads.ts and the leads page also pin projectId", () => {
    const bad = leadCalls
      .filter((c) => c.file === "actions/leads.ts" || c.file.endsWith("leads/page.tsx"))
      .filter((c) => !/\bprojectId\b/.test(c.block))
      .map((c) => `${c.file} ${c.call}`);
    expect(bad).toEqual([]);
  });

  it("prisma.invite.* carries tenantId (except the allowlisted token lookups)", () => {
    const bad = inviteCalls
      .filter((c) => !ALLOW.has(`${c.file} ${c.call}`))
      .filter((c) => !/\btenantId\b/.test(c.block))
      .map((c) => `${c.file} ${c.call}`);
    expect(bad).toEqual([]);
  });

  it("allowlist stays minimal: allowlisted lookups go by tokenHash", () => {
    for (const c of inviteCalls.filter((x) => ALLOW.has(`${x.file} ${x.call}`))) {
      expect(c.block, `${c.file}`).toMatch(/tokenHash/);
    }
  });

  it("there is no lead delete anywhere (archive instead)", () => {
    expect(calls("lead", /^(delete|deleteMany)$/)).toEqual([]);
  });
});

describe("2. tenant lock behind getActiveTenant", () => {
  it("non-superusers are hard-locked: the tenant cookie is ignored", () => {
    for (const role of ["Admin", "SubAdmin", "User", "unknown"]) {
      expect(tenantSlugToTry({ role }, "other-tenant"), role).toBeNull();
    }
  });
  it("superuser (BackendAdmin + legacy SuperAdmin) follows the cookie", () => {
    expect(tenantSlugToTry({ role: "BackendAdmin" }, "tof-solution")).toBe("tof-solution");
    expect(tenantSlugToTry({ role: "SuperAdmin" }, "tof-solution")).toBe("tof-solution");
  });
  it("superuser without cookie → own tenant", () => {
    expect(tenantSlugToTry({ role: "BackendAdmin" }, undefined)).toBeNull();
    expect(tenantSlugToTry({ role: "BackendAdmin" }, "")).toBeNull();
  });
});

describe("3. lead ↔ task only within the same tenant AND project", () => {
  const lead = { id: "l1", tenantId: "tA", projectId: "pA1", archivedAt: null };
  it("same tenant + same project → ok", () => {
    expect(leadMatchesTask(lead, { tenantId: "tA", projectId: "pA1" })).toBe(true);
    expect(acceptLeadLink(lead, { tenantId: "tA", projectId: "pA1" })).toBe(true);
  });
  it("foreign tenant → rejected (even with the same project id)", () => {
    expect(leadMatchesTask(lead, { tenantId: "tB", projectId: "pA1" })).toBe(false);
    expect(acceptLeadLink(lead, { tenantId: "tB", projectId: "pA1" }, "l1")).toBe(false);
  });
  it("other project of the same tenant, or no project → rejected", () => {
    expect(leadMatchesTask(lead, { tenantId: "tA", projectId: "pA2" })).toBe(false);
    expect(leadMatchesTask(lead, { tenantId: "tA", projectId: null })).toBe(false);
    expect(leadMatchesTask(null, { tenantId: "tA", projectId: "pA1" })).toBe(false);
  });
});

describe("4. invite never crosses tenants", () => {
  const now = new Date("2026-10-28T12:00:00Z");
  const m = mintInviteToken(now);
  const inviteA = { tenantId: "tA", userId: "uA", expiresAt: m.expiresAt, usedAt: null };

  it("token from tenant A works for its user in A", () => {
    expect(hashInviteToken(m.raw)).toBe(m.tokenHash);
    expect(inviteUsable(inviteA, { id: "uA", tenantId: "tA", deactivatedAt: null }, now)).toBe(true);
  });
  it("token from tenant A never applies to a user of tenant B", () => {
    expect(inviteUsable(inviteA, { id: "uB", tenantId: "tB", deactivatedAt: null }, now)).toBe(false);
    // same user id but moved to / living in B → still rejected
    expect(inviteUsable(inviteA, { id: "uA", tenantId: "tB", deactivatedAt: null }, now)).toBe(false);
  });
  it("expired or used → invalid", () => {
    const user = { id: "uA", tenantId: "tA", deactivatedAt: null };
    expect(inviteUsable(inviteA, user, new Date(m.expiresAt.getTime() + 1))).toBe(false);
    expect(inviteUsable({ ...inviteA, usedAt: now }, user, now)).toBe(false);
  });
});
