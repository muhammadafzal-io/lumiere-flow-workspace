-- Migration: create FormResponses table
-- Tracks the secure, single-use link a client uses to fill out and submit an in-house Form
-- (see create_forms.sql) attached to the Service they booked. Mirrors BookingCompletions'
-- token/status/expiry shape exactly (see create_booking_completions.sql) — same "the token is
-- the only credential" model, applied to form submission instead of booking completion.
-- Deliberately separate from ServiceFormLinks/ServiceFormAssignments — see
-- create_service_form_assignments.sql for why the external-link and in-house-form systems
-- are never merged.
-- NOTE: table name is double-quoted to preserve exact case — Postgres folds unquoted
-- identifiers to lowercase, which would create a table the app's `.from("FormResponses")`
-- queries could never find (see create_booking_completions.sql for the same issue).
CREATE TABLE IF NOT EXISTS "FormResponses" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  form_id uuid NOT NULL REFERENCES "Forms"(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES "Services"(id) ON DELETE CASCADE,
  event_id text NOT NULL,           -- Google Calendar event id this response belongs to
  phone text NOT NULL,              -- identity context, not re-verified at submit time
  client_name text,
  status text NOT NULL DEFAULT 'pending', -- 'pending' | 'completed' | 'expired'
  answers jsonb,                    -- null/{} while pending; populated only on submission
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS form_responses_token_idx ON "FormResponses"(token);
