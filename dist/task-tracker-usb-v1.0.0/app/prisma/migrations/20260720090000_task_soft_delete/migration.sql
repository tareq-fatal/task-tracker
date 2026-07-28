-- Soft-delete for tasks: deleting keeps the row (deletedAt/deletedBy set) so
-- old links from Telegram/push/bookmarks land on a friendly "task was
-- deleted" page instead of a 404, and admins can restore. Additive.
ALTER TABLE "Task" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Task" ADD COLUMN "deletedBy" TEXT;
CREATE INDEX "Task_deletedAt_idx" ON "Task"("deletedAt");
