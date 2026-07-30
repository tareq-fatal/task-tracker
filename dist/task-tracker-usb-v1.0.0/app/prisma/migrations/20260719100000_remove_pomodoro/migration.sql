-- Pomodoro feature removed (customer request 2026-07-19). There is no separate
-- Pomodoro table — pomodoro sessions were ordinary TaskTimeEntry rows tagged
-- source='pomodoro'. Reclassify them as plain timer entries so the tracked
-- minutes stay intact (prod had exactly 1 such row, 0 minutes).
UPDATE "TaskTimeEntry" SET "source" = 'timer' WHERE "source" = 'pomodoro';
