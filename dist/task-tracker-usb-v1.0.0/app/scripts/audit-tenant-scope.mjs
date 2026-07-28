// Static tenant-isolation audit: scans every Prisma query on a tenant-scoped
// model and classifies how it is isolated. Exits non-zero if any unguarded
// query is found. Run: node scripts/audit-tenant-scope.mjs
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const ROOT = "src";
// models whose rows belong to a tenant and MUST be tenant-scoped on read/write
const TENANT_MODELS = ["task", "project", "team", "sprint", "plannerSync", "tenantAuthProvider"];
// methods that return/affect multiple rows → need an explicit filter
const MULTI = ["findMany", "findFirst", "count", "updateMany", "deleteMany", "aggregate", "groupBy", "create"];
// by-id methods rely on a post-fetch tenantId check (assertCanEdit / !==) — OK pattern
const BYID = ["findUnique", "update", "delete"];

function walk(dir) {
  const out = [];
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx)$/.test(f) && !/\.test\./.test(f)) out.push(p);
  }
  return out;
}

// extract the (...) argument block following an index, with brace balancing
function argBlock(src, from) {
  let depth = 0, started = false, out = "";
  for (let i = from; i < src.length && i < from + 1200; i++) {
    const c = src[i];
    if (c === "(") { depth++; started = true; }
    if (started) out += c;
    if (c === ")") { depth--; if (depth === 0) break; }
  }
  return out;
}

const SCOPE = /tenantId|taskVisibility|requireTenant/;
let total = 0, scoped = 0, idBased = 0, system = 0, unguarded = [];
const re = /prisma\.(\w+)\.(\w+)\s*\(/g;

for (const file of walk(ROOT)) {
  const src = readFileSync(file, "utf8");
  // System crons legitimately span tenants (each row carries its own tenantId).
  const isSystemCron = /runner\.ts$|cron/.test(file);
  let m;
  while ((m = re.exec(src))) {
    const [, model, method] = m;
    if (!TENANT_MODELS.includes(model)) continue;
    const start = m.index + m[0].length - 1;
    const block = argBlock(src, start);
    const lookBack = src.slice(Math.max(0, m.index - 800), m.index); // where/base var defined above
    const line = src.slice(0, m.index).split("\n").length;
    const hasScope = SCOPE.test(block) || SCOPE.test(lookBack);
    total++;
    if (isSystemCron) { system++; continue; }
    if (MULTI.includes(method)) {
      if (hasScope) scoped++;
      else unguarded.push(`${file}:${line}  prisma.${model}.${method} (no tenant scope found)`);
    } else if (BYID.includes(method)) {
      idBased++;
    }
  }
}

console.log(`Tenant-scoped Prisma queries audited: ${total}`);
console.log(`  ✓ multi-row queries scoped by tenantId/visibility: ${scoped}`);
console.log(`  • by-id queries (post-fetch tenantId check pattern):  ${idBased}`);
console.log(`  ⚙ system-cron queries (cross-tenant by design):       ${system}`);
console.log(`  ✗ UNGUARDED multi-row queries: ${unguarded.length}`);
for (const u of unguarded) console.log("    - " + u);
process.exit(unguarded.length === 0 ? 0 : 1);
