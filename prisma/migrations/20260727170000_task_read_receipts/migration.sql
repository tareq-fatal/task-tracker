-- WhatsApp-style read receipts: one row per (task, user), written on the
-- first open of the task detail by a non-creator. Additive.
CREATE TABLE "TaskReadReceipt" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "firstOpenedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL DEFAULT 'web',
    CONSTRAINT "TaskReadReceipt_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TaskReadReceipt_taskId_userId_key" ON "TaskReadReceipt"("taskId", "userId");
CREATE INDEX "TaskReadReceipt_taskId_idx" ON "TaskReadReceipt"("taskId");
ALTER TABLE "TaskReadReceipt" ADD CONSTRAINT "TaskReadReceipt_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskReadReceipt" ADD CONSTRAINT "TaskReadReceipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
