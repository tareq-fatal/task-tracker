-- AlterTable
ALTER TABLE "TaskTimeEntry" ADD COLUMN "billable" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "TaskTimeEntry" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'timer';
