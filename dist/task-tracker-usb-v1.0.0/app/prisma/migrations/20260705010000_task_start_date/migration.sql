-- Gantt: planned schedule start date (nullable, additive — falls back to createdAt).
-- IF NOT EXISTS keeps this safe to (re)apply on a shared dev database.
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "startDate" TIMESTAMP(3);
