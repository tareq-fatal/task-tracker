-- #12 — replace the coarse per-thread watermark (TaskCommentRead) with a
-- fine-grained per-comment receipt (CommentRead). Telegram tracks read state
-- per message, not per chat; so do we.

-- DropTable (old per-thread watermark)
DROP TABLE "TaskCommentRead";

-- CreateTable (per-comment receipt)
CREATE TABLE "CommentRead" (
    "id" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommentRead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommentRead_userId_idx" ON "CommentRead"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CommentRead_commentId_userId_key" ON "CommentRead"("commentId", "userId");

-- AddForeignKey
ALTER TABLE "CommentRead" ADD CONSTRAINT "CommentRead_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "TaskComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentRead" ADD CONSTRAINT "CommentRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
