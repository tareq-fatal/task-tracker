-- Advanced recurring tasks: custom cron, timezone anchor, end conditions,
-- spawn counter, and a pause flag. Builds on the existing recurringRule /
-- recurringNextAt columns (migration 20260626200000_v9_recurring_activity).
ALTER TABLE "Task"
  ADD COLUMN "recurringCron"     TEXT,
  ADD COLUMN "recurringTz"       TEXT,
  ADD COLUMN "recurringUntil"    TIMESTAMP(3),
  ADD COLUMN "recurringEndCount" INTEGER,
  ADD COLUMN "recurringCount"    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "recurringPaused"   BOOLEAN NOT NULL DEFAULT false;

-- The runner scans for due series; index the hot predicate.
CREATE INDEX "Task_recurringNextAt_idx" ON "Task"("recurringNextAt");
