-- Migration: create BookingCompletions table
-- Tracks the secure, single-use link a customer uses to finish a booking (email, birthday)
-- after the AI collected only name + phone + service during a call/chat.
-- NOTE: table name is double-quoted to preserve exact case — Postgres folds unquoted
-- identifiers to lowercase, which would create a table the app's `.from("BookingCompletions")`
-- queries could never find (see create_equipment.sql/create_services.sql for the same issue).
CREATE TABLE IF NOT EXISTS "BookingCompletions" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  event_id text NOT NULL,           -- Google Calendar event id this link completes
  phone text NOT NULL,              -- identity check at submission time
  client_name text,
  treatment text,
  status text NOT NULL DEFAULT 'pending', -- 'pending' | 'completed' | 'expired'
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS booking_completions_token_idx ON "BookingCompletions"(token);
