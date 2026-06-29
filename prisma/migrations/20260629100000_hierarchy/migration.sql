-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "parentId" TEXT,
ADD COLUMN     "storyPoints" INTEGER,
ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'Task';

-- CreateIndex
CREATE INDEX "Task_parentId_idx" ON "Task"("parentId");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

