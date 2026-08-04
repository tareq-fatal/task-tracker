-- Admin-Workflow-Kontrolle (Kundenauftrag 2026-08-04, Features 1-3). Additiv:
-- Bestandsaufgaben (alles NULL/false) verhalten sich exakt wie bisher.
ALTER TABLE "Task" ADD COLUMN "allowedTargetColumn" TEXT;
ALTER TABLE "Task" ADD COLUMN "requireAllTodosDone" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Task" ADD COLUMN "requireTimeTracking" BOOLEAN NOT NULL DEFAULT false;

-- Feature 2: wer hat wann abgehakt.
ALTER TABLE "Subtask" ADD COLUMN "completedAt" TIMESTAMP(3);
ALTER TABLE "Subtask" ADD COLUMN "completedBy" TEXT;
