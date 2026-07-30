-- Comment auto-translation (X/FB style)
ALTER TABLE "Tenant" ADD COLUMN "translationEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "TaskComment" ADD COLUMN "language" TEXT;

CREATE TABLE "CommentTranslation" (
    "id" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "targetLang" TEXT NOT NULL,
    "sourceLang" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommentTranslation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CommentTranslation_commentId_targetLang_key" ON "CommentTranslation"("commentId", "targetLang");

ALTER TABLE "CommentTranslation" ADD CONSTRAINT "CommentTranslation_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "TaskComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
