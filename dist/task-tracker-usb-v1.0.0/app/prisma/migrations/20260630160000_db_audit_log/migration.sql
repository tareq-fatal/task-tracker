-- CreateTable
CREATE TABLE "DbAuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "sql" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "rowCount" INTEGER,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DbAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DbAuditLog_createdAt_idx" ON "DbAuditLog"("createdAt");
