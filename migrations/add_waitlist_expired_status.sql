-- Widens Waitlist.status to add 'Expired' — for entries whose preferred_date has passed with no
-- match ever found. Previously a Waiting/Contacted entry with a past date just sat there forever,
-- since matching only ever considers newly-freed slots on or after today. A daily cron sweep
-- (see src/lib/waitlist/sweep.ts's runWaitlistExpirySweepFlow) now retires these automatically.
DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT con.conname INTO constraint_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'Waitlist' AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) LIKE '%status%';
  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE "Waitlist" DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE "Waitlist" ADD CONSTRAINT "Waitlist_status_check"
  CHECK (status IN ('Waiting', 'Contacted', 'Booked', 'Cancelled', 'Expired'));
