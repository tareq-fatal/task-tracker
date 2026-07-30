-- Per-tenant feature flags (billingEnabled pattern): hide parent-task and
-- story-points UI where they only add noise. Data is never touched — a
-- disabled feature just stops rendering; re-enabling shows old values again.
ALTER TABLE "Tenant" ADD COLUMN "parentTasksEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Tenant" ADD COLUMN "storyPointsEnabled" BOOLEAN NOT NULL DEFAULT true;

-- Customer decision: the military operation tenant runs without parent tasks
-- and story points (simpler flow). All other tenants keep the defaults.
UPDATE "Tenant" SET "parentTasksEnabled" = false, "storyPointsEnabled" = false
WHERE slug = 'operation';
