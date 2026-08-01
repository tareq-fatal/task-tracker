-- Security audit 2026-07 — CRITICAL: cross-tenant write via Planner import.
--
-- `Project.externalId` and `Task.externalId` were GLOBALLY unique. The import
-- upsert in src/actions/import.ts matched on that bare key, so an admin of
-- tenant A importing a workbook carrying a foreign tenant's plan/task id hit
-- the UPDATE branch and overwrote a row belonging to tenant B in place.
--
-- The idempotency key is only ever meaningful within one tenant, so scope it.
-- This direction is strictly MORE permissive than the constraint it replaces:
-- every row that satisfied the global unique also satisfies the compound one,
-- so this cannot fail on existing production data.

DROP INDEX IF EXISTS "Project_externalId_key";
DROP INDEX IF EXISTS "Task_externalId_key";

CREATE UNIQUE INDEX "Project_tenantId_externalId_key" ON "Project"("tenantId", "externalId");
CREATE UNIQUE INDEX "Task_tenantId_externalId_key" ON "Task"("tenantId", "externalId");
