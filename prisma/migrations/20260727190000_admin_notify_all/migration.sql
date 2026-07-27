-- Admin personal broadcast: opt-in flag to mirror every tenant event to the
-- admin's own Telegram chat. Additive.
ALTER TABLE "User" ADD COLUMN "notifyAllTenantEvents" BOOLEAN NOT NULL DEFAULT false;
