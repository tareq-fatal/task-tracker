-- CreateTable
CREATE TABLE "PlannerSync" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "groupId" TEXT,
    "direction" TEXT NOT NULL DEFAULT 'pull',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "intervalMin" INTEGER NOT NULL DEFAULT 5,
    "lastSyncedAt" TIMESTAMP(3),
    "lastStatus" TEXT,
    "deltaLink" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlannerSync_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlannerSync_projectId_key" ON "PlannerSync"("projectId");

-- CreateIndex
CREATE INDEX "PlannerSync_tenantId_idx" ON "PlannerSync"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "PlannerSync_tenantId_planId_key" ON "PlannerSync"("tenantId", "planId");

-- AddForeignKey
ALTER TABLE "PlannerSync" ADD CONSTRAINT "PlannerSync_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannerSync" ADD CONSTRAINT "PlannerSync_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

