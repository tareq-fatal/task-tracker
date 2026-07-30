import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

/**
 * Regression guard for the "+1 counter" bug: nested `_count` relation counts
 * BYPASS the soft-delete client extension (lib/prisma.ts), so every task or
 * project relation count must filter deletedAt itself. This walks src/ and
 * fails if an unfiltered `tasks: true` / `assignedTasks: true` /
 * `createdTasks: true` / `projects: true` appears inside a `_count` select —
 * keeping every counter on the same truth as the lists.
 */
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith(".test.ts")) out.push(p);
  }
  return out;
}

describe("counter consistency (soft-delete)", () => {
  it("no _count select uses an unfiltered task/project relation", () => {
    const offenders: string[] = [];
    for (const file of walk("src")) {
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(/_count:\s*\{\s*select:\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}\s*\}/g)) {
        const inner = m[1];
        if (/\b(tasks|assignedTasks|createdTasks|projects):\s*true\b/.test(inner)) {
          offenders.push(file);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the four known counter sites use filtered relation counts", () => {
    for (const file of [
      "src/actions/tenants.ts",
      "src/actions/workflow-columns.ts",
      "src/app/(app)/projects/page.tsx",
      "src/app/(app)/admin/users/page.tsx",
    ]) {
      const src = readFileSync(file, "utf8");
      expect(src, file).toMatch(/where:\s*\{\s*deletedAt:\s*null\s*\}/);
    }
  });
});
