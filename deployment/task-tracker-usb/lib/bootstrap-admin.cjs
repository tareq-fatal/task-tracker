/**
 * Task Tracker — first-run superuser bootstrap (USB / on-prem installer).
 *
 * install.sh (and invite.sh) copy this into the running app container and
 * execute it there, because that is the only place where @prisma/client and the
 * argon2 native addon are guaranteed to be present and match the database
 * schema.
 *
 *   docker compose cp lib/bootstrap-admin.cjs app:/app/bootstrap-admin.cjs
 *   docker compose exec -T app node /app/bootstrap-admin.cjs
 *
 * TOF-0794 (Tarek 31.10.2026): Superuser per EINLADUNGSLINK statt Passwort.
 * Without ADMIN_PASSWORD (the default now) the superuser gets a random password
 * hash nobody ever sees, plus an Invite row — exactly like the app does it
 * (src/lib/invite.ts mintInviteToken / src/lib/invite-server.ts issueInvite):
 *   raw token  = randomBytes(32).toString("base64url")   (43 chars)
 *   tokenHash  = sha256(raw) hex — the ONLY thing stored
 *   expiresAt  = now + TT_INVITE_HOURS (default 72, like INVITE_TTL_HOURS)
 *   usedAt     = null, createdById = the user, tenantId = the user's tenant
 * The raw token leaves this script exactly once, on stdout:
 *   invite_url=<TT_PUBLIC_URL>/einladung/<token>
 *   invite_expires=<ISO timestamp>
 * A password is NEVER printed — not the random one, not ADMIN_PASSWORD.
 *
 * IDEMPOTENT and NON-DESTRUCTIVE. If the superuser already exists, nothing is
 * changed and no link is minted ("status=exists") — unless TT_NEW_INVITE=1:
 * then the user's open invites are invalidated (usedAt = now, never deleted)
 * and a fresh one is minted. The password is never touched either way.
 *
 * TT_INVITE_ONLY=1 (used by invite.sh): touch no tenant, create no user — just
 * mint a fresh link for the EXISTING user ADMIN_USERNAME, in that user's tenant.
 *
 * Tenant: TT_TENANT_SLUG / TT_TENANT_NAME, empty (only tenant + superuser). The
 * multi-tenant migration seeds a placeholder tenant "default". If it is still
 * EMPTY it is renamed into the requested tenant (no data is involved, and the
 * instance ends up with exactly one workspace); if it holds data it is left
 * alone. A leftover empty "default" next to an existing tenant is removed as
 * before.
 *
 * CommonJS (.cjs) on purpose: the runtime image's traced node_modules are
 * CommonJS, and this avoids any ESM/CJS interop surprises.
 *
 * TOF-0795 (Tarek 31.10.2026): logo from install.sh --logo. TT_LOGO_SRC is a
 * file inside the container (install.sh copied it there), TT_LOGO_EXT its type.
 * It is written to <UPLOAD_ROOT>/tenants/<slug>/logo.<ext> and tenant.logo is set
 * to "/uploads/tenants/<slug>/logo.<ext>?v=<bytes>" — exactly what Settings ->
 * Branding does (src/actions/branding.ts, src/lib/upload-paths.ts). The tenant
 * is the superuser's. Prints "logo_url=<url>".
 *
 * Reads from the environment (all supplied by install.sh / invite.sh):
 *   TT_TENANT_SLUG, TT_TENANT_NAME, TT_LOCALE, TT_PUBLIC_URL,
 *   TT_INVITE_HOURS, TT_NEW_INVITE, TT_INVITE_ONLY,
 *   ADMIN_USERNAME, ADMIN_EMAIL, ADMIN_PASSWORD (optional exception),
 *   TT_LOGO_SRC, TT_LOGO_EXT (optional), UPLOAD_DIR (like the app)
 */
const { createHash, randomBytes } = require("crypto");
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");
const { hash } = require("@node-rs/argon2");

const TENANT_SLUG = (process.env.TT_TENANT_SLUG || "main").toLowerCase();
const TENANT_NAME = process.env.TT_TENANT_NAME || "Task Tracker";
const LOCALE = ["ar", "de", "en"].includes(process.env.TT_LOCALE) ? process.env.TT_LOCALE : "de";
const USERNAME = (process.env.ADMIN_USERNAME || "admin").toLowerCase();
const PASSWORD = process.env.ADMIN_PASSWORD || "";
const EMAIL = (process.env.ADMIN_EMAIL || "admin@task-tracker.local").toLowerCase();
const PUBLIC_URL = (process.env.TT_PUBLIC_URL || process.env.APP_URL || "").replace(/\/+$/, "");
const INVITE_HOURS = Math.max(1, Number.parseInt(process.env.TT_INVITE_HOURS || "72", 10) || 72);
const NEW_INVITE = process.env.TT_NEW_INVITE === "1";
const INVITE_ONLY = process.env.TT_INVITE_ONLY === "1";
// TOF-0795: logo (optional). Same limits/types as the app's logo route.
const LOGO_SRC = process.env.TT_LOGO_SRC || "";
const LOGO_EXT = (process.env.TT_LOGO_EXT || "").toLowerCase();
const LOGO_EXTS = ["png", "jpg", "webp", "svg"];
const LOGO_MAX_BYTES = 2 * 1024 * 1024;
// = src/lib/upload-paths.ts UPLOAD_ROOT
const UPLOAD_ROOT = process.env.UPLOAD_DIR || path.join(process.cwd(), "var", "uploads");
// Same role the app's own user administration stores for the superuser
// (src/lib/enums.ts; legacy "SuperAdmin" is still accepted everywhere).
const ROLE = "BackendAdmin";

const prisma = new PrismaClient();

// --- Invite primitives — kept byte-for-byte equivalent to src/lib/invite.ts --
const INVITE_TOKEN_BYTES = 32;
function hashInviteToken(raw) {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}
function inviteUrl(origin, raw) {
  return `${origin.replace(/\/+$/, "")}/einladung/${raw}`;
}

/** Mint + store a fresh invite; older open invites of the user are invalidated. */
async function issueInvite(user) {
  const now = new Date();
  const raw = randomBytes(INVITE_TOKEN_BYTES).toString("base64url");
  const expiresAt = new Date(now.getTime() + INVITE_HOURS * 60 * 60 * 1000);
  await prisma.$transaction([
    prisma.invite.updateMany({
      where: { tenantId: user.tenantId, userId: user.id, usedAt: null },
      data: { usedAt: now },
    }),
    prisma.invite.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        tokenHash: hashInviteToken(raw),
        expiresAt,
        createdById: user.id,
      },
    }),
  ]);
  console.log(`invite_url=${inviteUrl(PUBLIC_URL, raw)}`);
  console.log(`invite_expires=${expiresAt.toISOString()}`);
}

/** TOF-0795: install.sh --logo → uploads volume + tenant.logo (like branding.ts). */
async function applyLogo(tenant) {
  if (!LOGO_SRC || !tenant) return;
  if (!LOGO_EXTS.includes(LOGO_EXT)) {
    console.error(`logo skipped: unsupported type '${LOGO_EXT}'`);
    return;
  }
  if (!/^[a-z0-9-]{1,60}$/.test(tenant.slug)) {
    console.error(`logo skipped: tenant slug '${tenant.slug}' cannot be served`);
    return;
  }
  // A logo problem must never fail the superuser step — it can be uploaded in
  // the app later.
  try {
    const bytes = fs.readFileSync(LOGO_SRC);
    if (bytes.length === 0 || bytes.length > LOGO_MAX_BYTES) {
      console.error(`logo skipped: ${bytes.length} bytes (max. ${LOGO_MAX_BYTES})`);
      return;
    }
    const dir = path.join(UPLOAD_ROOT, "tenants", tenant.slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `logo.${LOGO_EXT}`), bytes);
    const url = `/uploads/tenants/${tenant.slug}/logo.${LOGO_EXT}?v=${bytes.length}`; // cache-bust on change
    await prisma.tenant.update({ where: { id: tenant.id }, data: { logo: url } });
    console.log(`logo_url=${url}`);
  } catch (e) {
    console.error(`logo skipped: ${e && e.message ? e.message : e}`);
  }
}

async function tenantIsEmpty(tenantId) {
  const counts = await Promise.all([
    prisma.user.count({ where: { tenantId } }),
    prisma.project.count({ where: { tenantId } }),
    prisma.team.count({ where: { tenantId } }),
    prisma.task.count({ where: { tenantId } }),
    prisma.invite.count({ where: { tenantId } }),
    prisma.apiToken.count({ where: { tenantId } }),
  ]);
  return counts.every((n) => n === 0);
}

async function pruneEmptyDefaultTenant(keepTenantId) {
  const def = await prisma.tenant.findUnique({ where: { slug: "default" } });
  if (!def || def.id === keepTenantId) return;
  if (!(await tenantIsEmpty(def.id))) return; // has real data — leave it
  await prisma.tenant.delete({ where: { id: def.id } });
  console.log("pruned=empty-default-tenant");
}

/** The requested tenant: existing → as is; else the empty "default" renamed; else new. */
async function resolveTenant() {
  const existing = await prisma.tenant.findUnique({ where: { slug: TENANT_SLUG } });
  if (existing) return existing; // never overwrite an existing tenant's branding

  const def = await prisma.tenant.findUnique({ where: { slug: "default" } });
  if (def && (await tenantIsEmpty(def.id))) {
    const renamed = await prisma.tenant.update({
      where: { id: def.id },
      data: { slug: TENANT_SLUG, name: TENANT_NAME },
    });
    console.log("renamed=empty-default-tenant");
    return renamed;
  }

  return prisma.tenant.create({
    data: {
      slug: TENANT_SLUG,
      name: TENANT_NAME,
      primaryColor: "#0ea5e9",
      themeName: "ocean-pro",
    },
  });
}

async function main() {
  if (!PASSWORD && !PUBLIC_URL) {
    console.error("TT_PUBLIC_URL is empty — cannot build an invite link.");
    process.exit(2);
  }

  // --- invite.sh: fresh link for an existing user, nothing else ------------
  if (INVITE_ONLY) {
    const user = await prisma.user.findUnique({ where: { username: USERNAME } });
    if (!user) {
      console.error(`No user '${USERNAME}' — nothing to invite.`);
      process.exit(3);
    }
    if (user.deactivatedAt) {
      console.error(`User '${USERNAME}' is deactivated — reactivate it in the app first.`);
      process.exit(4);
    }
    await issueInvite(user);
    console.log(`status=invited username=${USERNAME}`);
    return;
  }

  // 1. Tenant — the workspace every user and task belongs to.
  const tenant = await resolveTenant();

  // 2. Superuser. An existing account is reported, never modified — the
  //    customer may have set the password long ago.
  const existing = await prisma.user.findUnique({ where: { username: USERNAME } });
  if (existing) {
    if (NEW_INVITE) await issueInvite(existing);
    if (LOGO_SRC) await applyLogo(await prisma.tenant.findUnique({ where: { id: existing.tenantId } }));
    await pruneEmptyDefaultTenant(existing.tenantId);
    console.log(`status=exists username=${USERNAME} tenant=${TENANT_SLUG}`);
    return;
  }

  // Invite (default): random secret, hashed, never shown — nobody can log in
  // with it; the superuser sets a real password through the link.
  // --admin-password (exception): that password, also never echoed here.
  const secret = PASSWORD || randomBytes(32).toString("hex");
  const user = await prisma.user.create({
    data: {
      name: "Superuser",
      username: USERNAME,
      email: EMAIL,
      passwordHash: await hash(secret),
      mustChangePassword: false,
      role: ROLE,
      locale: LOCALE,
      hasSeenTour: false,
      tenantId: tenant.id,
    },
  });
  if (!PASSWORD) await issueInvite(user);
  await applyLogo(tenant);

  // 3. Drop a still-empty placeholder "default" tenant next to the real one —
  //    only when it is genuinely empty, so an upgraded instance whose real data
  //    still lives there is never touched.
  await pruneEmptyDefaultTenant(tenant.id);

  const mode = PASSWORD ? "password" : "invite";
  console.log(`status=created username=${USERNAME} tenant=${TENANT_SLUG} mode=${mode}`);
}

main()
  .catch((e) => {
    console.error("Bootstrap failed:", e && e.message ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
