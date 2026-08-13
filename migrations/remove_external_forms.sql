-- Migration: remove external/hosted form URL functionality
-- The form system now only supports in-house Forms (built in this app, filled at
-- /forms/fill/[token]). Externally-hosted form links (e.g. Google Forms) had zero completion
-- tracking of their own and are being removed entirely.
--
-- DESTRUCTIVE: drops any existing external RequiredFormTracking rows and the ServiceFormLinks
-- table outright. Run only when ready — not reversible.
DELETE FROM "RequiredFormTracking" WHERE form_source = 'external';

ALTER TABLE "RequiredFormTracking" DROP COLUMN service_form_link_id;

-- Find and drop the existing form_source CHECK constraint by pattern rather than assuming
-- Postgres's default auto-generated name, in case it differs.
DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT con.conname INTO constraint_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'RequiredFormTracking'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) LIKE '%form_source%';
  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE "RequiredFormTracking" DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE "RequiredFormTracking" ADD CONSTRAINT "RequiredFormTracking_form_source_check"
  CHECK (form_source = 'inhouse');

DROP TABLE "ServiceFormLinks";
