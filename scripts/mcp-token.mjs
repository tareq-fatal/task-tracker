// Mint, list and revoke MCP machine tokens (ApiToken).
//
//   npm run mcp:token -- mint --user tarek --name "Claude Code Laptop" --scopes read,write
//   npm run mcp:token -- mint --user tarek --name "Wall report" --scopes read --days 90
//   npm run mcp:token -- list [--user tarek]
//   npm run mcp:token -- revoke --id <tokenId>
//
// The raw token is printed ONCE and never stored — only its SHA-256 hash goes
// into the database. Losing it means minting a new one.
//
// Runs through tsx so it can share the exact hashing/scope rules the API
// verifies with (src/lib/api-token.ts) instead of reimplementing them.
import { PrismaClient } from "@prisma/client";
import { mintApiToken, serializeScopes, isTokenUsable } from "../src/lib/api-token.ts";

const prisma = new PrismaClient();

function arg(name, fallback = undefined) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function usage(msg) {
  if (msg) console.error(`\n  ✖ ${msg}`);
  console.error(`
  Usage:
    npm run mcp:token -- mint --user <username> --name "<label>" [--scopes read,write] [--days N]
    npm run mcp:token -- list [--user <username>]
    npm run mcp:token -- revoke --id <tokenId>
`);
  process.exit(msg ? 1 : 0);
}

async function findUser(username) {
  if (!username) usage("--user <username> is required");
  const user = await prisma.user.findUnique({
    where: { username },
    select: { id: true, name: true, username: true, role: true, tenantId: true, deactivatedAt: true },
  });
  if (!user) usage(`no user with username '${username}'`);
  if (user.deactivatedAt) usage(`user '${username}' is deactivated — reactivate before minting`);
  return user;
}

async function mint() {
  const user = await findUser(arg("user"));
  const name = arg("name");
  if (!name) usage('--name "<label>" is required (so the token is identifiable later)');

  const scopes = serializeScopes((arg("scopes", "read") ?? "").split(","));
  if (!scopes) usage("--scopes must contain at least one of: read, write, kontext, kommentar");

  const days = arg("days");
  let expiresAt = null;
  if (days !== undefined) {
    const n = Number(days);
    if (!Number.isFinite(n) || n <= 0) usage("--days must be a positive number");
    expiresAt = new Date(Date.now() + n * 24 * 60 * 60 * 1000);
  }

  const { raw, tokenHash, prefix } = mintApiToken();
  const tenant = await prisma.tenant.findUnique({
    where: { id: user.tenantId },
    select: { slug: true, name: true },
  });

  const row = await prisma.apiToken.create({
    data: { name, tokenHash, prefix, userId: user.id, tenantId: user.tenantId, scopes, expiresAt },
    select: { id: true, createdAt: true },
  });

  console.log(`
  ✔ Token minted

    id        ${row.id}
    label     ${name}
    user      ${user.name} (${user.username}, ${user.role})
    tenant    ${tenant?.name ?? "?"} (${tenant?.slug ?? "?"})
    scopes    ${scopes}
    expires   ${expiresAt ? expiresAt.toISOString() : "never"}

  Copy this now — it is shown exactly once and cannot be recovered:

    ${raw}

  Use it with the MCP server:

    export TASK_TRACKER_URL="https://tasks.example.com"
    export TASK_TRACKER_TOKEN="${raw}"
`);
}

async function list() {
  const username = arg("user");
  const where = username ? { user: { username } } : {};
  const rows = await prisma.apiToken.findMany({
    where,
    select: {
      id: true,
      name: true,
      prefix: true,
      scopes: true,
      createdAt: true,
      lastUsedAt: true,
      expiresAt: true,
      revokedAt: true,
      user: { select: { username: true } },
      tenant: { select: { slug: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  if (rows.length === 0) {
    console.log("\n  (no tokens)\n");
    return;
  }
  console.log("");
  for (const r of rows) {
    const state = r.revokedAt
      ? "REVOKED"
      : isTokenUsable(r)
        ? "active"
        : "EXPIRED";
    console.log(
      `  ${state.padEnd(8)} ${r.id}  ${r.prefix}…  ${r.user.username}@${r.tenant.slug}  [${r.scopes}]  "${r.name}"` +
        `\n           created ${r.createdAt.toISOString().slice(0, 10)}` +
        `  last used ${r.lastUsedAt ? r.lastUsedAt.toISOString().slice(0, 16).replace("T", " ") : "never"}` +
        `  expires ${r.expiresAt ? r.expiresAt.toISOString().slice(0, 10) : "never"}`
    );
  }
  console.log("");
}

async function revoke() {
  const id = arg("id");
  if (!id) usage("--id <tokenId> is required (see: npm run mcp:token -- list)");
  const existing = await prisma.apiToken.findUnique({
    where: { id },
    select: { id: true, name: true, revokedAt: true },
  });
  if (!existing) usage(`no token with id '${id}'`);
  if (existing.revokedAt) {
    console.log(`\n  • Token "${existing.name}" was already revoked at ${existing.revokedAt.toISOString()}\n`);
    return;
  }
  await prisma.apiToken.update({ where: { id }, data: { revokedAt: new Date() } });
  console.log(`\n  ✔ Revoked "${existing.name}" (${id}) — it stops working immediately.\n`);
}

const command = process.argv[2];
try {
  if (command === "mint") await mint();
  else if (command === "list") await list();
  else if (command === "revoke") await revoke();
  else usage(command ? `unknown command '${command}'` : undefined);
} finally {
  await prisma.$disconnect();
}
