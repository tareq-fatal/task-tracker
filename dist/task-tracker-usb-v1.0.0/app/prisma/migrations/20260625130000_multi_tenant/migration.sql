-- CreateTable Tenant
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "logo" TEXT,
    "primaryColor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- Default tenant for backfilling pre-existing rows
INSERT INTO "Tenant" ("id", "slug", "name") VALUES ('tenant_default', 'default', 'Default');

-- Add tenantId (nullable first, then backfill, then enforce NOT NULL)
ALTER TABLE "User" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Project" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Team" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Task" ADD COLUMN "tenantId" TEXT;

UPDATE "User" SET "tenantId" = 'tenant_default' WHERE "tenantId" IS NULL;
UPDATE "Project" SET "tenantId" = 'tenant_default' WHERE "tenantId" IS NULL;
UPDATE "Team" SET "tenantId" = 'tenant_default' WHERE "tenantId" IS NULL;
UPDATE "Task" SET "tenantId" = 'tenant_default' WHERE "tenantId" IS NULL;

ALTER TABLE "User" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Project" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Team" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Task" ALTER COLUMN "tenantId" SET NOT NULL;

-- Email becomes unique per tenant (same email may exist across tenants)
DROP INDEX IF EXISTS "User_email_key";
CREATE UNIQUE INDEX "User_email_tenantId_key" ON "User"("email", "tenantId");

-- Indexes
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");
CREATE INDEX "Project_tenantId_idx" ON "Project"("tenantId");
CREATE INDEX "Team_tenantId_idx" ON "Team"("tenantId");
CREATE INDEX "Task_tenantId_idx" ON "Task"("tenantId");

-- Foreign keys
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Team" ADD CONSTRAINT "Team_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
