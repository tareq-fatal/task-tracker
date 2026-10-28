-- TOF-0786 (Tarek 28.10.2026): Lead „vermittelt von“ + „Provision %“, damit die
-- Provision der Vertriebspartnerin je Lead nachvollziehbar ist. Rein additiv.

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "commissionPct" DOUBLE PRECISION,
ADD COLUMN     "referredBy" TEXT;
