-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "externalId" TEXT;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "bucket" TEXT,
ADD COLUMN     "externalId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Project_externalId_key" ON "Project"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Task_externalId_key" ON "Task"("externalId");

