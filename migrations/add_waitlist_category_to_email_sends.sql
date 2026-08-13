-- Widens email_sends.category to accept 'waitlist' (this feature's new send category) — the
-- CHECK constraint was never updated when 'waitlist' was added to the EmailSendCategory TS type,
-- so every waitlist-offer email send attempt was silently failing to log (caught and swallowed
-- by logEmailSend's own try/catch, invisible end-to-end — the same failure mode documented in
-- activity-log.ts's header comment for a previous table/column mismatch).
--
-- Also adds 'followup' while touching this constraint — it's been in the EmailSendCategory TS
-- type and used by src/lib/retention/followup-sends.ts's send path since before this feature,
-- but was likewise never added to the DB constraint, so its email-log rows have been silently
-- failing the exact same way. Same statement, same fix, no reason to leave it broken.
DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT con.conname INTO constraint_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'email_sends'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) LIKE '%category%';
  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE email_sends DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE email_sends ADD CONSTRAINT email_sends_category_check
  CHECK (category IN (
    'rule', 'campaign', 'reminder', 'birthday', 'noshow', 'reactivation',
    'booking', 'cancellation', 'reschedule', 'general', 'followup', 'waitlist'
  ));
