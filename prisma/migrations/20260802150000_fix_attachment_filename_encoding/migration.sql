-- Kunden-Report 2026-08-02: Anhang-Dateinamen mit arabischen/Umlaut-Zeichen
-- wurden durch den Next-Server-Action-Multipart-Parser (busboy ohne
-- defParamCharset) Latin-1-fehldekodiert gespeichert ("Ø§Ù...").
-- Backfill: Latin-1-Bytes zurück nach UTF-8, NUR wenn das Ergebnis gültiges
-- UTF-8 ist (sonst Exception -> Zeile bleibt unangetastet). Zwei Durchläufe
-- fangen doppelt kodierte Namen (erneut hochgeladene, bereits kaputte Dateien).
-- Marker-Zeichen (Ã Â Ø Ù Ú Û Ð Ñ) sind typische Mojibake-Leadbytes; korrekte
-- Namen mit z.B. deutschen Umlauten enthalten sie nicht.
DO $$
DECLARE
  r RECORD;
  fixed TEXT;
  pass INT;
BEGIN
  FOR pass IN 1..2 LOOP
    FOR r IN
      SELECT id, "fileName" AS v FROM "TaskAttachment" WHERE "fileName" ~ '[ÃÂØÙÚÛÐÑ]'
    LOOP
      BEGIN
        fixed := convert_from(convert_to(r.v, 'LATIN1'), 'UTF8');
        IF fixed <> r.v THEN
          UPDATE "TaskAttachment" SET "fileName" = fixed WHERE id = r.id;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        NULL; -- nicht konvertierbar -> war kein Mojibake -> unangetastet
      END;
    END LOOP;

    FOR r IN
      SELECT id, detail AS v FROM "ActivityLog" WHERE type = 'attachment' AND detail ~ '[ÃÂØÙÚÛÐÑ]'
    LOOP
      BEGIN
        fixed := convert_from(convert_to(r.v, 'LATIN1'), 'UTF8');
        IF fixed <> r.v THEN
          UPDATE "ActivityLog" SET detail = fixed WHERE id = r.id;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END LOOP;
  END LOOP;
END $$;
