-- Onboarding flow: track first-time onboarding completion (welcome modal +
-- optional sample project). NULL = user has not yet completed/skipped onboarding.
ALTER TABLE "User" ADD COLUMN "onboardedAt" TIMESTAMP(3);
