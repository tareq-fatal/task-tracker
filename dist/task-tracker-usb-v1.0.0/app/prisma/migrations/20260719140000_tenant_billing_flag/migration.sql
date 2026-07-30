-- Per-tenant feature flag: billable/non-billable time UI. Additive; defaults
-- to true so commercial tenants keep the feature. The military tenant
-- ("operation") gets it switched off right away.
ALTER TABLE "Tenant" ADD COLUMN "billingEnabled" BOOLEAN NOT NULL DEFAULT true;
UPDATE "Tenant" SET "billingEnabled" = false WHERE slug = 'operation';
