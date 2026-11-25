-- TOF-0967: Projekt-Zugehörigkeit + Anzeige-Ebene je Mandant
CREATE TYPE "ProjectAffiliation" AS ENUM ('tarek', 'objektus', 'marine');

ALTER TABLE "Project" ADD COLUMN "affiliation" "ProjectAffiliation" NOT NULL DEFAULT 'tarek';
ALTER TABLE "Tenant" ADD COLUMN "displayAffiliations" "ProjectAffiliation"[] NOT NULL DEFAULT ARRAY[]::"ProjectAffiliation"[];
CREATE INDEX "Project_tenantId_affiliation_idx" ON "Project"("tenantId", "affiliation");

-- Startzuordnung aus den Eigentümer-Markern in der Beschreibung ([owner:…], TOF-0963).
UPDATE "Project" SET "affiliation" = 'objektus' WHERE "description" LIKE '%[owner:objektus]%';
UPDATE "Project" SET "affiliation" = 'marine'   WHERE "description" LIKE '%[owner:marine]%';
-- [owner:klaeren]: fachlich eindeutige Fälle (FSM gehört zu Objektus); der Rest bleibt „Meine“.
UPDATE "Project" SET "affiliation" = 'objektus' WHERE "id" IN ('cmwchbiqz006cx9q8wu2un1ti', 'cmumduo210bktnrx1mihkznze');
-- Mandant „operation“ (Marine-Kunde): seine Projekte sind Marine.
UPDATE "Project" SET "affiliation" = 'marine'
  WHERE "tenantId" IN (SELECT "id" FROM "Tenant" WHERE "slug" = 'operation');
