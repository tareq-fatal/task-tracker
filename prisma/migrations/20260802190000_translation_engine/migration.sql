-- Übersetzungs-Engine pro Mandant (Kundenfeedback 2026-08-02: Qualität).
-- "auto" = DeepL bevorzugt mit LibreTranslate-Fallback; additive Spalte.
ALTER TABLE "Tenant" ADD COLUMN "translationEngine" TEXT NOT NULL DEFAULT 'auto';
