/**
 * Task Tracker — first-run administrator bootstrap (USB installer).
 *
 * install.sh copies this into the running app container and executes it there,
 * because that is the only place where @prisma/client and the argon2 native
 * addon are guaranteed to be present and match the database schema.
 *
 *   docker compose cp lib/bootstrap-admin.cjs app:/app/bootstrap-admin.cjs
 *   docker compose exec -T app node /app/bootstrap-admin.cjs
 *
 * IDEMPOTENT and NON-DESTRUCTIVE. If the administrator already exists, the
 * password is left untouched and the script exits 0 with "status=exists" — so
 * re-running install.sh on a live instance can never lock the customer out.
 *
 * CommonJS (.cjs) on purpose: the runtime image's traced node_modules are
 * CommonJS, and this avoids any ESM/CJS interop surprises.
 *
 * Reads from the environment (all supplied by install.sh):
 *   TT_TENANT_SLUG, TT_TENANT_NAME, TT_LOCALE,
 *   ADMIN_USERNAME, ADMIN_PASSWORD, ADMIN_EMAIL
 */
const { PrismaClient } = require("@prisma/client");
const { hash } = require("@node-rs/argon2");

const TENANT_SLUG = (process.env.TT_TENANT_SLUG || "main").toLowerCase();
const TENANT_NAME = process.env.TT_TENANT_NAME || "Task Tracker";
const LOCALE = process.env.TT_LOCALE || "de";
const USERNAME = (process.env.ADMIN_USERNAME || "admin").toLowerCase();
const PASSWORD = process.env.ADMIN_PASSWORD || "";
const EMAIL = (process.env.ADMIN_EMAIL || "admin@task-tracker.local").toLowerCase();

const prisma = new PrismaClient();

async function pruneEmptyDefaultTenant(keepTenantId) {
  const def = await prisma.tenant.findUnique({ where: { slug: "default" } });
  if (!def || def.id === keepTenantId) return;
  const [users, projects, teams, tasks] = await Promise.all([
    prisma.user.count({ where: { tenantId: def.id } }),
    prisma.project.count({ where: { tenantId: def.id } }),
    prisma.team.count({ where: { tenantId: def.id } }),
    prisma.task.count({ where: { tenantId: def.id } }),
  ]);
  if (users || projects || teams || tasks) return; // has real data — leave it
  await prisma.tenant.delete({ where: { id: def.id } });
  console.log("pruned=empty-default-tenant");
}

async function main() {
  if (!PASSWORD) {
    console.error("ADMIN_PASSWORD is empty — refusing to create an account without a password.");
    process.exit(2);
  }

  // 1. Tenant — the workspace every user and task belongs to.
  const tenant = await prisma.tenant.upsert({
    where: { slug: TENANT_SLUG },
    update: {}, // never overwrite an existing tenant's branding
    create: {
      slug: TENANT_SLUG,
      name: TENANT_NAME,
      primaryColor: "#0ea5e9",
      themeName: "ocean-pro",
    },
  });

  // 2. Administrator. An existing account is reported, never modified — the
  //    customer may have changed the password long ago.
  const existing = await prisma.user.findUnique({ where: { username: USERNAME } });
  if (existing) {
    console.log(`status=exists username=${USERNAME} tenant=${TENANT_SLUG}`);
    return;
  }

  await prisma.user.create({
    data: {
      name: "Administrator",
      username: USERNAME,
      email: EMAIL,
      passwordHash: await hash(PASSWORD),
      role: "SuperAdmin",
      locale: LOCALE,
      hasSeenTour: false,
      tenantId: tenant.id,
    },
  });

  // 3. The multi-tenant migration seeds a placeholder "default" tenant to hang
  //    pre-migration rows off. On a brand-new install nothing ever lands in it,
  //    and a SuperAdmin would see a second, permanently empty workspace in the
  //    tenant switcher. Drop it — but only when it is genuinely empty, so an
  //    upgraded instance whose real data still lives there is never touched.
  await pruneEmptyDefaultTenant(tenant.id);

  console.log(`status=created username=${USERNAME} tenant=${TENANT_SLUG}`);
}

main()
  .catch((e) => {
    console.error("Bootstrap failed:", e && e.message ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
