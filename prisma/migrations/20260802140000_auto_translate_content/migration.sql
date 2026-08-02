-- Auto-Übersetzung TR<->x beim Anzeigen (Kundenwunsch 2026-08-02). Additiv.
-- Hash-Cache statt FK: Titel/Beschreibungen sind editierbar — eine Änderung
-- ändert den Hash, veraltete Übersetzungen werden nie ausgeliefert.
CREATE TABLE "ContentTranslation" (
    "id" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "sourceLang" TEXT NOT NULL,
    "targetLang" TEXT NOT NULL,
    "translatedText" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentTranslation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContentTranslation_contentHash_targetLang_key" ON "ContentTranslation"("contentHash", "targetLang");
CREATE INDEX "ContentTranslation_contentHash_idx" ON "ContentTranslation"("contentHash");

-- Sprach-Detection beim Speichern (nicht beim Rendern)
ALTER TABLE "Task" ADD COLUMN "detectedLanguage" TEXT;

-- Profil-Setting "immer Original anzeigen" (false = Original)
ALTER TABLE "User" ADD COLUMN "autoTranslate" BOOLEAN NOT NULL DEFAULT true;
