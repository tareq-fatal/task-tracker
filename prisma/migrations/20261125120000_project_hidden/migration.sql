-- TOF-0966: Projekte verbergen
ALTER TABLE "Project" ADD COLUMN "hiddenAt" TIMESTAMP(3),
ADD COLUMN "hiddenBy" TEXT;

CREATE INDEX "Project_hiddenAt_idx" ON "Project"("hiddenAt");
