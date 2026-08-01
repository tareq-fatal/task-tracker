/**
 * Production-safe tenant bootstrap — IDEMPOTENT, NON-DESTRUCTIVE.
 *
 * Unlike `seed.ts` (which wipes & recreates demo data), this only:
 *   1. ensures the tenants exist (objektus / tarek / marine)
 *   2. re-homes any rows left in the migration's "default" tenant → objektus
 *      (so data that existed before the multi-tenant migration becomes visible)
 *   3. ensures a SuperAdmin exists (without resetting an existing password)
 *   4. ensures the tarek / marine tenant admin logins exist (additive)
 *
 * Safe to run on every deploy. Never deletes tasks/projects/teams/users.
 */
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { PrismaClient } from "@prisma/client";
import { hash } from "@node-rs/argon2";

// Local convenience: load .env when present (no-op in the container, which gets
// its env from docker compose).
function loadEnv() {
  const file = join(process.cwd(), ".env");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    )
      v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}
loadEnv();

const prisma = new PrismaClient();

const ADMIN_USERNAME = (process.env.ADMIN_USERNAME ?? "admin").toLowerCase();
const ADMIN_EMAIL = (
  process.env.ADMIN_EMAIL ?? "admin@task-tracker.local"
).toLowerCase();

// No password fallbacks. These previously defaulted to literals that are
// published in .env.example, so a deploy that simply forgot to set them got a
// SuperAdmin whose password was public (security audit 2026-07). Fail loudly
// instead — this script is documented as safe to run on every deploy, so a
// silent weak default is the worst possible failure mode.
function requiredSecret(name: string): string {
  const v = process.env[name];
  if (!v || v.trim().length < 12) {
    throw new Error(
      `${name} must be set to at least 12 characters before bootstrapping. ` +
        `Set it in the environment (or via ${name}_FILE) and re-run.`
    );
  }
  return v;
}

const ADMIN_PASSWORD = requiredSecret("ADMIN_PASSWORD");
const DEMO_PASSWORD = requiredSecret("DEMO_PASSWORD");

async function main() {
  console.log("🏢 Bootstrapping tenants (non-destructive)…");

  // 1. Tenants
  const objektus = await prisma.tenant.upsert({
    where: { slug: "objektus" },
    update: {},
    create: { slug: "objektus", name: "Objektus", primaryColor: "#0ea5e9" },
  });
  const tarekT = await prisma.tenant.upsert({
    where: { slug: "tarek" },
    update: {},
    create: { slug: "tarek", name: "Tarek (privat)", primaryColor: "#8b5cf6" },
  });
  const marine = await prisma.tenant.upsert({
    where: { slug: "marine" },
    update: {},
    create: {
      slug: "marine",
      name: "Marine (Coast Shield)",
      primaryColor: "#1e3a8a",
    },
  });
  const OBJ = objektus.id;

  // 2. Re-home pre-migration data (migration backfilled it to "default")
  const def = await prisma.tenant.findUnique({ where: { slug: "default" } });
  if (def && def.id !== OBJ) {
    // Users: move per-row, skipping any whose email already exists in objektus
    // (the (email, tenantId) unique constraint would otherwise fail).
    const defUsers = await prisma.user.findMany({ where: { tenantId: def.id } });
    let movedUsers = 0;
    for (const du of defUsers) {
      const clash = await prisma.user.findFirst({
        where: { email: du.email, tenantId: OBJ },
      });
      if (clash) continue;
      await prisma.user.update({
        where: { id: du.id },
        data: { tenantId: OBJ },
      });
      movedUsers++;
    }
    const u = { count: movedUsers };
    const p = await prisma.project.updateMany({
      where: { tenantId: def.id },
      data: { tenantId: OBJ },
    });
    const tm = await prisma.team.updateMany({
      where: { tenantId: def.id },
      data: { tenantId: OBJ },
    });
    const tk = await prisma.task.updateMany({
      where: { tenantId: def.id },
      data: { tenantId: OBJ },
    });
    console.log(
      `   Re-homed from 'default'→objektus: ${u.count} users, ${p.count} projects, ${tm.count} teams, ${tk.count} tasks`
    );
  }

  // 3. SuperAdmin — promote/create without clobbering an existing password
  await prisma.user.upsert({
    where: { username: ADMIN_USERNAME },
    update: { role: "SuperAdmin" },
    create: {
      name: "Administrator",
      username: ADMIN_USERNAME,
      email: ADMIN_EMAIL,
      passwordHash: await hash(ADMIN_PASSWORD),
      role: "SuperAdmin",
      locale: "de",
      hasSeenTour: true,
      mustChangePassword: true,
      tenantId: OBJ,
    },
  });

  // 4. Tenant admin logins for tarek & marine (additive only)
  const demoHash = await hash(DEMO_PASSWORD);
  async function ensureTenantAdmin(
    username: string,
    name: string,
    tenantId: string
  ) {
    await prisma.user.upsert({
      where: { username },
      update: {}, // never overwrite an existing user
      create: {
        name,
        username,
        email: `${username}@coastshield.net`,
        passwordHash: demoHash,
        role: "Admin",
        locale: "de",
        hasSeenTour: true,
        mustChangePassword: true,
        tenantId,
      },
    });
  }
  await ensureTenantAdmin("tarek", "Tarek", tarekT.id);
  await ensureTenantAdmin("marine", "Marine Ops", marine.id);

  const counts = {
    tenants: await prisma.tenant.count(),
    users: await prisma.user.count(),
    tasks: await prisma.task.count(),
  };
  console.log("✅ Bootstrap complete.", counts);
  console.log("   SuperAdmin:", ADMIN_USERNAME, "(home: objektus)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
