-- Comment reactions + soft-delete for comments/attachments. Additive.
CREATE TABLE "CommentReaction" (
    "id" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommentReaction_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CommentReaction_commentId_userId_type_key" ON "CommentReaction"("commentId", "userId", "type");
CREATE INDEX "CommentReaction_commentId_idx" ON "CommentReaction"("commentId");
ALTER TABLE "CommentReaction" ADD CONSTRAINT "CommentReaction_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "TaskComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommentReaction" ADD CONSTRAINT "CommentReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TaskComment" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "TaskComment" ADD COLUMN "deletedBy" TEXT;
ALTER TABLE "TaskAttachment" ADD COLUMN "uploadedBy" TEXT;
ALTER TABLE "TaskAttachment" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "TaskAttachment" ADD COLUMN "deletedBy" TEXT;
