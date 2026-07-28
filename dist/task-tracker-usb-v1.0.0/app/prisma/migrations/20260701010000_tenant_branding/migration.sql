-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "accentColor" TEXT,
ADD COLUMN     "secondaryColor" TEXT,
ADD COLUMN     "themeName" TEXT NOT NULL DEFAULT 'ocean-pro';

