-- CreateTable
CREATE TABLE "TaskCommentRead" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskCommentRead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskCommentRead_userId_idx" ON "TaskCommentRead"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskCommentRead_taskId_userId_key" ON "TaskCommentRead"("taskId", "userId");

-- AddForeignKey
ALTER TABLE "TaskCommentRead" ADD CONSTRAINT "TaskCommentRead_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskCommentRead" ADD CONSTRAINT "TaskCommentRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

