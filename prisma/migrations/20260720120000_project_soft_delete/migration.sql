-- Project soft-delete (mirrors task soft-delete from 20260720090000):
-- deleting a project keeps everything and cascades a soft-delete to its
-- tasks (same timestamp, so restore can bring back exactly that set).
ALTER TABLE "Project" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Project" ADD COLUMN "deletedBy" TEXT;
CREATE INDEX "Project_deletedAt_idx" ON "Project"("deletedAt");
