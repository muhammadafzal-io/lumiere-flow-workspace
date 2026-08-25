-- Migration: create ReviewRequests table
-- Logs every attempt to send a Google Review request triggered by a positive reply to a
-- post-treatment follow-up (see src/lib/retention/review-request.ts). One row per appointment —
-- appointment_id is UNIQUE so a second positive reply to the same follow-up is a no-op duplicate,
-- same "one row per booking" shape as followup_sends (migrations/create_followup_sends.sql).
-- NOTE: identifiers are double-quoted to preserve exact case — see create_services.sql for why.
CREATE TABLE IF NOT EXISTS "ReviewRequests" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id text NOT NULL UNIQUE,
  client_id text,
  client_name text,
  client_contact text,
  client_email text,
  trigger_response text NOT NULL,
  sentiment text NOT NULL, -- 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE'
  status text NOT NULL, -- 'SENT' | 'FAILED' | 'SKIPPED'
  skip_reason text,
  google_review_url text,
  platform text,
  sent_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS review_requests_client_id_idx ON "ReviewRequests" (client_id);
