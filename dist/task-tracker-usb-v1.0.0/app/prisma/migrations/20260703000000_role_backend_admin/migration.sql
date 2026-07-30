-- Formalize the backend/system admin role: rename legacy "SuperAdmin" → "BackendAdmin".
-- Data-only, idempotent. App code still accepts both values, so this never breaks a login.
UPDATE "User" SET "role" = 'BackendAdmin' WHERE "role" = 'SuperAdmin';
