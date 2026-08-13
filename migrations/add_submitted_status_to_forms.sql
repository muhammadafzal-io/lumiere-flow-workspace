-- Migration: widen RequiredFormTracking.status to a real three-stage lifecycle
-- PENDING (nothing submitted yet) -> SUBMITTED (customer submitted, awaiting staff review) ->
-- COMPLETED (staff reviewed and approved). Previously status flipped straight from PENDING to
-- COMPLETED the instant a customer submitted, with no review step in between.
-- The original CHECK was inline/unnamed on the column, so find-and-drop it by pattern rather
-- than assuming Postgres's auto-generated name (same approach as remove_external_forms.sql).
DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT con.conname INTO constraint_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'RequiredFormTracking'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) LIKE '%status%'
    AND pg_get_constraintdef(con.oid) NOT LIKE '%form_source%';
  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE "RequiredFormTracking" DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE "RequiredFormTracking" ADD CONSTRAINT "RequiredFormTracking_status_check"
  CHECK (status IN ('PENDING', 'SUBMITTED', 'COMPLETED'));

-- Separate timestamp from completed_at, which now means "staff approved it" specifically.
ALTER TABLE "RequiredFormTracking" ADD COLUMN submitted_at timestamptz;
