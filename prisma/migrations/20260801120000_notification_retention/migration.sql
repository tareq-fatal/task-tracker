-- Kunden-Report 2026-08 (Bug 2): Benachrichtigungen liefen unbegrenzt auf.
-- Additive Spalte: pro Mandant konfigurierbare Aufbewahrung in Tagen; der
-- tägliche Sweep (/api/cron/notification-retention) löscht ältere Einträge.
ALTER TABLE "Tenant" ADD COLUMN "notificationRetentionDays" INTEGER NOT NULL DEFAULT 30;

-- Der Sweep und die Admin-Buttons filtern tenantweit nach Alter — ohne diesen
-- Index wäre das ein Seq-Scan über alle Benachrichtigungen.
CREATE INDEX "Notification_tenantId_createdAt_idx" ON "Notification"("tenantId", "createdAt");
