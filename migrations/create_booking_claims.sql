-- Closes the double-booking race window in bookAdminAppointment (google-calendar.ts): appointments
-- live as Google Calendar events with a plain list-then-check-then-insert sequence and no
-- transactional guarantee, so two near-simultaneous requests for the same room/practitioner/
-- equipment at the exact same start time can both pass the conflict check before either inserts.
--
-- bookAdminAppointment now claims one row per resource (room, practitioner, each equipment item)
-- keyed by resource+exact-start-time before doing its Google Calendar conflict check. The UNIQUE
-- constraint makes the claim atomic: if a concurrent request already holds it, the second request's
-- INSERT fails immediately instead of both requests racing past the check into Google Calendar.
-- Claims are released in a `finally` right after the booking completes or fails; stale rows (from a
-- request that crashed before releasing) are swept on the next claim attempt for the same key, so
-- no separate cleanup cron is required.
--
-- This closes the most common real-world case — two requests for the literal same displayed slot
-- (e.g. two front-desk tabs, or a double-click) — but does not add a Postgres EXCLUDE constraint
-- for arbitrary overlapping-but-different-start-time ranges, which would need the btree_gist
-- extension and is a larger follow-up if that narrower race also needs closing.
--
-- Run in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS booking_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (resource_key)
);

CREATE INDEX IF NOT EXISTS idx_booking_claims_created_at ON booking_claims (created_at);
