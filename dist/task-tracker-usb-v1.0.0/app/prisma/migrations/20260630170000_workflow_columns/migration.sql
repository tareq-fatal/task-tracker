-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "workflowColumnId" TEXT;

-- CreateTable
CREATE TABLE "WorkflowColumn" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#6366f1',
    "order" INTEGER NOT NULL DEFAULT 0,
    "wipLimit" INTEGER,
    "isInitial" BOOLEAN NOT NULL DEFAULT false,
    "isFinal" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'InProgress',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowColumn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkflowColumn_projectId_idx" ON "WorkflowColumn"("projectId");

-- CreateIndex
CREATE INDEX "WorkflowColumn_tenantId_idx" ON "WorkflowColumn"("tenantId");

-- CreateIndex
CREATE INDEX "Task_workflowColumnId_idx" ON "Task"("workflowColumnId");

-- AddForeignKey
ALTER TABLE "WorkflowColumn" ADD CONSTRAINT "WorkflowColumn_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_workflowColumnId_fkey" FOREIGN KEY ("workflowColumnId") REFERENCES "WorkflowColumn"("id") ON DELETE SET NULL ON UPDATE CASCADE;

