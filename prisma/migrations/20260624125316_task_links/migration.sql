-- CreateTable
CREATE TABLE "TaskLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "linkedTaskId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskLink_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaskLink_linkedTaskId_fkey" FOREIGN KEY ("linkedTaskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "TaskLink_taskId_idx" ON "TaskLink"("taskId");

-- CreateIndex
CREATE INDEX "TaskLink_linkedTaskId_idx" ON "TaskLink"("linkedTaskId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskLink_taskId_linkedTaskId_type_key" ON "TaskLink"("taskId", "linkedTaskId", "type");
