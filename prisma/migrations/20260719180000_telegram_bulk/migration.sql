-- Telegram bulk onboarding: official roster handle/nickname per user,
-- token expiry timestamp, and an optional per-tenant broadcast group.
ALTER TABLE "User" ADD COLUMN "telegramLinkTokenAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "telegramHandle" TEXT;
ALTER TABLE "User" ADD COLUMN "telegramNickname" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "telegramGroupChatId" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "telegramGroupEvents" TEXT;
