-- SubAdmin role support: phone field + temporary user deactivation.
-- Role stays a string column — "SubAdmin" is a new accepted value, existing
-- rows untouched. Additive.
ALTER TABLE "User" ADD COLUMN "phone" TEXT;
ALTER TABLE "User" ADD COLUMN "deactivatedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "deactivatedBy" TEXT;
