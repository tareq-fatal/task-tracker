import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// Static invariants for the machine-facing surface (POST /api/mcp).
//
// The behavioural paths need a database, so these tests pin the properties a
// reviewer would otherwise have to re-derive by reading three files: that
// nothing dispatches before authentication, that every mutating op is behind
// the "write" scope, and that every task an op touches is reached through a
// tenant-scoped lookup. They fail loudly if a future op is added carelessly.

const root = join(__dirname, "..", "..", "..");
const routeSrc = readFileSync(join(root, "src/app/api/mcp/route.ts"), "utf8");
const opsSrc = readFileSync(join(root, "src/lib/mcp/ops.ts"), "utf8");
const authSrc = readFileSync(join(root, "src/lib/mcp/auth.ts"), "utf8");

/** Split ops.ts into one source block per operation. */
function opBlocks(): Map<string, string> {
  const blocks = new Map<string, string>();
  // Operations are declared as `  <name>: {` at two-space indentation inside OPS.
  const re = /\n {2}(\w+): \{\n/g;
  const starts: { name: string; index: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(opsSrc))) starts.push({ name: m[1], index: m.index });
  for (let i = 0; i < starts.length; i++) {
    const from = starts[i].index;
    const to = i + 1 < starts.length ? starts[i + 1].index : opsSrc.indexOf("\n};", from);
    blocks.set(starts[i].name, opsSrc.slice(from, to));
  }
  return blocks;
}

const OPS = opBlocks();

const READ_OPS = [
  "whoami",
  "list_projects",
  "list_tasks",
  "list_users",
  "sync_status",
  "get_task",
  "list_steps",
  // TOF-0839 Projekt-Wissen
  "wissen_suchen",
  "wissen_lesen",
  "projekt_kontext",
];
const WRITE_OPS = [
  "create_task",
  "update_task",
  "add_comment",
  "log_prompt",
  "add_step",
  "complete_step",
  "upload_attachment",
  "link_tasks",
  "create_project",
  // TOF-0839 Projekt-Wissen
  "wissen_schreiben",
  "entscheidung_hinzufuegen",
];
const WISSEN_OPS = ["wissen_suchen", "wissen_lesen", "wissen_schreiben", "entscheidung_hinzufuegen", "projekt_kontext"];

describe("MCP op registry", () => {
  it("parses every declared operation", () => {
    expect([...OPS.keys()].sort()).toEqual([...READ_OPS, ...WRITE_OPS].sort());
  });

  it("gives every op a scope, a description and a schema", () => {
    for (const [name, block] of OPS) {
      expect(block, `${name} has no scope`).toMatch(/scope: "(read|write)"/);
      expect(block, `${name} has no describe`).toContain("describe:");
      expect(block, `${name} has no schema`).toContain("schema:");
    }
  });

  it("puts every mutating operation behind the write scope", () => {
    for (const name of WRITE_OPS) {
      expect(OPS.get(name), `${name} must be write-scoped`).toMatch(/scope: "write"/);
    }
  });

  it("keeps read operations read-scoped", () => {
    for (const name of READ_OPS) {
      expect(OPS.get(name), `${name} must be read-scoped`).toMatch(/scope: "read"/);
    }
  });

  it("rejects unknown parameters on every schema (no silent extra fields)", () => {
    for (const [name, block] of OPS) {
      expect(block, `${name}'s schema is not .strict()`).toContain(".strict()");
    }
  });
});

describe("tenant + permission scoping", () => {
  // Ops that reach a task must do so through one of these. `taskVisibility`
  // scopes reads; assertCanAct/assertCanEditContent scope writes AND report a
  // foreign task as 404 rather than 403.
  const GUARDS = /assertCanAct|assertCanEditContent|taskVisibility|visibleProjectIds/;

  it("guards every op that reaches an EXISTING task by a caller-supplied id", () => {
    // Creation is scoped differently — there is no prior row to check, so
    // create_task is covered by the "stamps ctx.tenant.id" test below instead.
    const byId = [...OPS].filter(([, block]) => /params\.(taskId|stepId)/.test(block));
    expect(byId.map(([name]) => name).sort()).toEqual(
      [
        "add_comment",
        "add_step",
        "complete_step",
        "get_task",
        "link_tasks",
        "list_steps",
        "log_prompt",
        "update_task",
        "upload_attachment",
      ].sort()
    );
    for (const [name, block] of byId) {
      expect(block, `${name} reaches a task by id without a guard`).toMatch(GUARDS);
    }
  });

  it("writes tenantId from the token context, never from a parameter", () => {
    // Every create must anchor on ctx.tenant.id. A `tenantId: params.…` would
    // let a caller plant a row in another mandant.
    expect(opsSrc).not.toMatch(/tenantId:\s*params\./);
    for (const name of ["create_task", "create_project"]) {
      expect(OPS.get(name), `${name} must stamp ctx.tenant.id`).toContain("tenantId: ctx.tenant.id");
    }
  });

  it("attributes authorship to the token's user, never to a parameter", () => {
    expect(opsSrc).not.toMatch(/createdByUserId:\s*params\./);
    expect(opsSrc).not.toMatch(/userId:\s*params\./);
  });

  it("derives an attachment's extension from the MIME allowlist, not the filename", () => {
    const block = OPS.get("upload_attachment")!;
    expect(block).toContain("ALLOWED_MIME.includes");
    expect(block).toContain("MIME_EXTENSION[params.mimeType]");
    // The stored name is random + allowlisted extension; the user's filename is
    // only ever a display value.
    expect(block).toMatch(/randomBytes\(12\)\.toString\("hex"\)/);
    expect(block).toContain("MAX_UPLOAD_BYTES");
  });

  it("runs the admin workflow gate before any status change", () => {
    const block = OPS.get("update_task")!;
    expect(block).toContain("statusGateFor");
    expect(block).toMatch(/if \(!gate\.ok\)/);
  });

  it("keeps project creation admin-only", () => {
    expect(OPS.get("create_project")).toContain("isAdminRole(ctx.user.role)");
  });
});

describe("TOF-0839 Projekt-Wissen ops", () => {
  it("only the knowledge ops carry a second scope, and it is exactly \"kontext\"", () => {
    for (const [name, block] of OPS) {
      if (WISSEN_OPS.includes(name)) expect(block, name).toContain('alsoScope: "kontext"');
      else expect(block, name).not.toContain("alsoScope");
    }
  });

  it("run with the token's user and tenant, and route every rule through lib/wissen/dienst", () => {
    for (const name of WISSEN_OPS) {
      const block = OPS.get(name)!;
      expect(block, name).toContain("ctx.user, ctx.tenant.id");
      expect(block, name).toContain("wissenAufruf(");
      expect(block, name).not.toMatch(/prisma\./);
    }
    expect(opsSrc).toMatch(/from "@\/lib\/wissen\/dienst"/);
  });

  it("route accepts alsoScope only in addition to — never instead of — the scope check", () => {
    expect(routeSrc).toContain("!requireScope(ctx, operation.scope) && !(operation.alsoScope && requireScope(ctx, operation.alsoScope))");
  });
});

describe("route dispatch", () => {
  it("authenticates before it looks at the requested op", () => {
    const authAt = routeSrc.indexOf("authenticateMcp(req)", routeSrc.indexOf("export async function POST"));
    const dispatchAt = routeSrc.indexOf("OPS[op]");
    expect(authAt).toBeGreaterThan(-1);
    expect(dispatchAt).toBeGreaterThan(authAt);
  });

  it("checks the op's scope before running it", () => {
    const scopeAt = routeSrc.indexOf("requireScope(ctx, operation.scope)");
    const runAt = routeSrc.indexOf("operation.run(");
    expect(scopeAt).toBeGreaterThan(-1);
    expect(runAt).toBeGreaterThan(scopeAt);
  });

  it("validates params against the op's schema before running it", () => {
    const parseAt = routeSrc.indexOf("operation.schema.safeParse");
    expect(parseAt).toBeGreaterThan(-1);
    expect(routeSrc.indexOf("operation.run(")).toBeGreaterThan(parseAt);
  });

  it("never leaks an internal error message to the caller", () => {
    expect(routeSrc).toContain('fail(500, "internal error")');
  });

  it("has no shared-secret or env-var bypass", () => {
    // Unlike the cron/wall routes there is no static secret here: access is
    // per-user tokens only, so a leaked env var cannot unlock the whole API.
    expect(routeSrc).not.toMatch(/process\.env/);
  });
});

describe("token authentication", () => {
  it("only ever reads the token from the Authorization header", () => {
    expect(authSrc).toContain('req.headers.get("authorization")');
    // A query-parameter fallback would write tokens into access logs.
    expect(authSrc).not.toMatch(/searchParams/);
  });

  it("looks the token up by hash, never by raw value", () => {
    expect(authSrc).toContain("hashApiToken(raw)");
    expect(authSrc).toMatch(/where: \{ tokenHash \}/);
  });

  it("refuses revoked, expired, deactivated and tenant-mismatched tokens", () => {
    expect(authSrc).toContain("isTokenUsable(row)");
    expect(authSrc).toContain("row.user.deactivatedAt");
    expect(authSrc).toContain("row.user.tenantId !== row.tenantId");
  });

  it("answers every failure with the same opaque 401", () => {
    const failures = authSrc.match(/return \{ ok: false, status: \d+, error: "[^"]+" \}/g) ?? [];
    expect(failures.length).toBeGreaterThanOrEqual(5);
    for (const f of failures) {
      expect(f).toContain('status: 401, error: "unauthorized"');
    }
  });
});
