-- Der vereinbarte Ablauf als Automatik-Regeln (Tarek, 16.08.2026):
--
--   1 umsetzen      → in-progress  → claude
--   2 selbst testen → self-test    → claude
--   3 abnehmen      → to-verify    → tarekfatal
--   4 ausliefern    → release      → claude   → danach schließen
--
-- Die Zuständigkeit hängt damit an der Spalte statt an der Erinnerung der
-- Beteiligten. Bewusst als DATEN, nicht im Code: die Regeln stehen unter
-- Einstellungen → Automatik und können dort geändert oder abgeschaltet werden,
-- ohne ein Deployment.
--
-- Nur für den Mandanten `tarek-claude` — andere Mandanten haben diesen Ablauf
-- nicht vereinbart. Idempotent: bereits vorhandene Regeln gleichen Namens
-- bleiben unangetastet, damit ein erneutes Ausführen nichts verdoppelt und
-- eine von Hand geänderte Regel nicht zurückgesetzt wird.
INSERT INTO "AutomationRule" ("id", "tenantId", "projectId", "name", "enabled", "triggerType", "triggerValue", "actionType", "actionValue", "createdAt")
SELECT
    'wf_' || t."id" || '_' || step."col",
    t."id",
    NULL,
    step."label",
    true,
    'column_to',
    step."col",
    'assign_to',
    step."owner",
    CURRENT_TIMESTAMP
FROM "Tenant" t
CROSS JOIN (
    VALUES
        ('in-progress', 'Schritt 1 — In Arbeit liegt bei Claude',        'claude'),
        ('self-test',   'Schritt 2 — Test durch Claude',                 'claude'),
        ('to-verify',   'Schritt 3 — Test durch Tarek',                  'tarekfatal'),
        ('release',     'Schritt 4 — Release durch Claude',              'claude')
) AS step("col", "label", "owner")
WHERE t."slug" = 'tarek-claude'
  -- Die Regel zeigt auf einen Benutzernamen; ohne den Benutzer wäre sie tot.
  AND EXISTS (SELECT 1 FROM "User" u WHERE u."tenantId" = t."id" AND u."username" = step."owner")
  AND NOT EXISTS (
      SELECT 1 FROM "AutomationRule" r
      WHERE r."tenantId" = t."id"
        AND r."triggerType" = 'column_to'
        AND r."triggerValue" = step."col"
  );
