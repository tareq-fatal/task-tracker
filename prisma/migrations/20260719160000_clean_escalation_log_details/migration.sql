-- The removed escalation feature logged hardcoded GERMAN detail strings
-- ("eskaliert"/"deeskaliert") which rendered mixed into Arabic timelines
-- ("الادمن صعّد المهمة · eskaliert"). The localized activity label alone says
-- everything — drop only those fixed strings. Coaching-note details are user
-- content and stay untouched. No new rows can appear (feature removed).
UPDATE "ActivityLog" SET detail = NULL
WHERE type = 'escalated' AND detail IN ('eskaliert', 'deeskaliert');
