-- Schlagworte an Aufgaben (frei, mehrere je Aufgabe).
--
-- Rein additiv: eine neue Spalte mit Vorgabewert und ein Index. Bestehende
-- Zeilen bekommen ein leeres Array, kein Lesepfad aendert sich. Der vorherige
-- Build laeuft mit dieser Spalte unveraendert weiter (er kennt sie nicht), die
-- Migration ist also kein Einbahnweg.
--
-- Rueckweg ohne Datenverlust an anderer Stelle:
--   DROP INDEX IF EXISTS "Task_tags_idx";
--   ALTER TABLE "Task" DROP COLUMN "tags";
-- (Nur die Schlagworte selbst sind dann weg.)

ALTER TABLE "Task" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- GIN traegt die Mengenfrage "enthaelt eines dieser Schlagworte" (@>/&&), die
-- der Filter stellt. Ein B-Tree koennte das nicht.
CREATE INDEX "Task_tags_idx" ON "Task" USING GIN ("tags");
