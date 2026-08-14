#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Idempotent MCP onboarding — tenant + owner account + machine token.
//
// Runs INSIDE the production task-tracker container (see infra/mcp-setup.sh),
// because that is the only place on the VPS that has a generated Prisma client
// and the argon2 native addon. The runtime image deliberately ships no tsx and
// no src/, so `npm run mcp:token` (which imports src/lib/api-token.ts through
// tsx) cannot run there — this script is the production-side equivalent.
//
// Everything is safe to re-run:
//   • tenant   — looked up by slug, created only when missing
//   • user     — looked up by username, created only when missing; an existing
//                account's password and role are NEVER overwritten silently
//   • token    — an active token with the same label is REUSED (reported, not
//                re-minted): the raw value is unrecoverable, so minting twice
//                would quietly orphan the first one. --rotate-token is explicit.
//
// The raw token is printed exactly once, on stdout, and never stored.
// ─────────────────────────────────────────────────────────────────────────────

import { createHash, randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { hash as argon2Hash } from "@node-rs/argon2";

// Mirrors src/lib/api-token.ts. Kept in sync by construction: infra/mcp-setup.sh
// verifies the minted token against the live GET /api/mcp, which runs the real
// implementation — a drift here fails the setup instead of shipping a dud token.
const TOKEN_PREFIX = "tt_mcp_";
const TOKEN_BYTES = 32;
const DISPLAY_CHARS = TOKEN_PREFIX.length + 8;
const VALID_SCOPES = ["read", "write"];

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const USERNAME_RE = /^[a-z0-9._-]{3,}$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function arg(name, fallback = undefined) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
    ? process.argv[i + 1]
    : fallback;
}
const flag = (name) => process.argv.includes(`--${name}`);

function die(msg) {
  console.error(`\n  ✖ ${msg}\n`);
  process.exit(1);
}

function mintToken() {
  const raw = TOKEN_PREFIX + randomBytes(TOKEN_BYTES).toString("hex");
  return {
    raw,
    tokenHash: createHash("sha256").update(raw, "utf8").digest("hex"),
    prefix: raw.slice(0, DISPLAY_CHARS),
  };
}

/** Same rule as the API: neither revoked nor past its expiry. */
const tokenUsable = (t) =>
  !t.revokedAt && (!t.expiresAt || t.expiresAt.getTime() > Date.now());

const prisma = new PrismaClient();
const steps = [];
const note = (action, detail) => {
  steps.push({ action, detail });
  console.log(`  ${action.padEnd(9)} ${detail}`);
};

async function main() {
  const tenantName = arg("tenant-name");
  const slug = (arg("slug") ?? "").trim().toLowerCase();
  const ownerName = arg("owner-name");
  const ownerUsername = (arg("owner-username") ?? "").trim().toLowerCase();
  const ownerEmail = (arg("owner-email") ?? "").trim().toLowerCase();
  const ownerPassword = arg("owner-password");
  const tokenLabel = arg("token-label", "Claude Code");
  const locale = arg("locale", "de");

  const scopes = VALID_SCOPES.filter((s) =>
    (arg("scopes", "read") ?? "").split(",").map((x) => x.trim().toLowerCase()).includes(s)
  ).join(",");

  if (!tenantName || !slug || !ownerName || !ownerUsername || !ownerPassword) {
    die(
      "required: --tenant-name --slug --owner-name --owner-username --owner-password\n" +
        "  optional: --owner-email --token-label --scopes read,write --token-days N\n" +
        "            --locale de --rotate-token --reset-password --adopt-user"
    );
  }
  // Same input rules as createTenantAction (src/actions/tenants.ts) so a tenant
  // made here is indistinguishable from one made through the admin UI.
  if (!SLUG_RE.test(slug)) die(`bad slug '${slug}' — lowercase letters, digits and dashes only`);
  if (!USERNAME_RE.test(ownerUsername)) die(`bad username '${ownerUsername}' — [a-z0-9._-], min 3 chars`);
  if (ownerEmail && !EMAIL_RE.test(ownerEmail)) die(`bad email '${ownerEmail}'`);
  if (ownerPassword.length < 6) die("password must be at least 6 characters");
  if (!scopes) die("--scopes must contain at least one of: read, write");

  let expiresAt = null;
  const days = arg("token-days");
  if (days !== undefined) {
    const n = Number(days);
    if (!Number.isFinite(n) || n <= 0) die("--token-days must be a positive number");
    expiresAt = new Date(Date.now() + n * 86_400_000);
  }

  console.log("");

  // ── 0. Preflight ───────────────────────────────────────────────────────────
  // Every blocking condition is checked BEFORE the first write, so a rejected
  // run leaves no half-built mandant behind.
  let tenant = await prisma.tenant.findUnique({ where: { slug } });
  let user = await prisma.user.findUnique({ where: { username: ownerUsername } });
  const foreignUser = user && user.tenantId !== tenant?.id;

  if (foreignUser && !flag("adopt-user")) {
    const home = await prisma.tenant.findUnique({ where: { id: user.tenantId } });
    die(
      `username '${ownerUsername}' already exists in mandant '${home?.slug ?? user.tenantId}' ` +
        `(usernames are globally unique).\n    Either pick another --owner-username, ` +
        `or pass --adopt-user to move that account into '${slug}'.`
    );
  }
  if (foreignUser) {
    // Moving an account across mandants is only harmless while it owns nothing:
    // its tasks/projects/comments stay behind and would become cross-tenant
    // references. Refuse rather than produce that.
    const [tasks, created, projects, comments] = await Promise.all([
      prisma.task.count({ where: { assignedToUserId: user.id } }),
      prisma.task.count({ where: { createdByUserId: user.id } }),
      prisma.project.count({ where: { createdByUserId: user.id } }),
      prisma.taskComment.count({ where: { userId: user.id } }),
    ]);
    const owned = tasks + created + projects + comments;
    if (owned > 0) {
      die(
        `refusing --adopt-user: '${ownerUsername}' owns ${owned} object(s) ` +
          `(${tasks} assigned, ${created} created tasks, ${projects} projects, ${comments} comments) ` +
          `in its current mandant. Moving it would leave cross-tenant references behind.`
      );
    }
  }

  // ── 1. Tenant ──────────────────────────────────────────────────────────────
  if (tenant) {
    note("exists", `tenant '${slug}' (${tenant.name}) — left untouched`);
  } else {
    tenant = await prisma.tenant.create({
      data: { slug, name: tenantName, primaryColor: arg("primary-color", "#4f46e5") },
    });
    note("created", `tenant '${slug}' (${tenant.name})`);
  }

  // ── 2. Owner ───────────────────────────────────────────────────────────────
  // Owner = Admin from the start, exactly like createTenantAction does it, so
  // no second "promote to admin" step is ever needed.
  if (user && user.tenantId !== tenant.id) {
    const from = await prisma.tenant.findUnique({ where: { id: user.tenantId } });
    user = await prisma.user.update({
      where: { id: user.id },
      data: { tenantId: tenant.id },
    });
    note("changed", `user '${ownerUsername}' moved from '${from?.slug ?? "?"}' into '${slug}' (--adopt-user)`);
  }
  if (user) {
    note("exists", `user '${ownerUsername}' (${user.name}, ${user.role})`);
    // Never silently escalate an existing account — say it and let the operator
    // decide, since the token inherits exactly this role.
    if (!["Admin", "BackendAdmin", "SuperAdmin"].includes(user.role)) {
      note("warning", `'${ownerUsername}' has role '${user.role}', not Admin — the MCP token inherits it`);
    }
    if (user.deactivatedAt) {
      await prisma.user.update({
        where: { id: user.id },
        data: { deactivatedAt: null, deactivatedBy: null },
      });
      note("changed", `user '${ownerUsername}' reactivated (tokens are refused for deactivated accounts)`);
    }
    if (flag("reset-password")) {
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await argon2Hash(ownerPassword) },
      });
      note("changed", `password of '${ownerUsername}' reset (--reset-password)`);
    }
  } else {
    user = await prisma.user.create({
      data: {
        name: ownerName,
        username: ownerUsername,
        email: ownerEmail || null,
        passwordHash: await argon2Hash(ownerPassword),
        role: "Admin",
        tenantId: tenant.id,
        locale,
        hasSeenTour: false,
      },
    });
    note("created", `user '${ownerUsername}' (${ownerName}, Admin) in '${slug}'`);
  }

  // ── 3. Token ───────────────────────────────────────────────────────────────
  const existing = (
    await prisma.apiToken.findMany({
      where: { userId: user.id, name: tokenLabel },
      orderBy: { createdAt: "desc" },
    })
  ).filter(tokenUsable);

  let raw = null;
  let token = existing[0] ?? null;

  if (token && !flag("rotate-token")) {
    note(
      "exists",
      `token "${tokenLabel}" (${token.prefix}…, [${token.scopes}]) — NOT re-minted, ` +
        `the raw value cannot be recovered. Use --rotate-token for a fresh one.`
    );
  } else {
    if (token) {
      await prisma.apiToken.updateMany({
        where: { id: { in: existing.map((t) => t.id) } },
        data: { revokedAt: new Date(), revokedBy: "mcp-setup --rotate-token" },
      });
      note("changed", `revoked ${existing.length} previous token(s) labelled "${tokenLabel}"`);
    }
    const minted = mintToken();
    raw = minted.raw;
    token = await prisma.apiToken.create({
      data: {
        name: tokenLabel,
        tokenHash: minted.tokenHash,
        prefix: minted.prefix,
        userId: user.id,
        tenantId: tenant.id,
        scopes,
        expiresAt,
      },
    });
    note("created", `token "${tokenLabel}" (${minted.prefix}…, [${scopes}], expires ${expiresAt ? expiresAt.toISOString().slice(0, 10) : "never"})`);
  }

  // Machine-readable tail — infra/mcp-setup.sh reads this last line to verify
  // the token against the live endpoint and to print the export line.
  console.log(
    "\nSETUP_RESULT " +
      JSON.stringify({
        tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name },
        user: { id: user.id, username: user.username, name: user.name, role: user.role },
        token: { id: token.id, prefix: token.prefix, scopes: token.scopes, minted: Boolean(raw) },
        raw,
        changed: steps.some((s) => s.action !== "exists"),
      })
  );
}

main()
  .catch((err) => {
    console.error(`\n  ✖ ${err?.message ?? err}\n`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
