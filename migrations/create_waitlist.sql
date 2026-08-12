-- Migration: create Waitlist table
-- Captures a caller's preferred slot when the AI agent (voice/chat/Discord) can't offer it and
-- they don't accept the alternatives offered — instead of losing the lead entirely. Also usable
-- by staff for phone-call/walk-in requests (source = 'admin').
-- Appointments in this app live only in Google Calendar (no Postgres "appointments" table), so
-- like BookingCompletions/FormResponses/RequiredFormTracking, a resulting booking is referenced
-- via a plain event_id text column, not a real FK.
-- NOTE: table name is double-quoted to preserve exact case — see create_form_responses.sql.
CREATE TABLE IF NOT EXISTS "Waitlist" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  client_id uuid NOT NULL REFERENCES "Clients"(id) ON DELETE CASCADE,
  client_name text NOT NULL,

  treatment text NOT NULL,
  service_id uuid REFERENCES "Services"(id) ON DELETE SET NULL,

  preferred_date date NOT NULL,
  preferred_time_start time,
  preferred_time_end time,

  preferred_practitioner_id uuid REFERENCES "Practitioners"(id) ON DELETE SET NULL,
  preferred_practitioner_name text,

  flexibility text,

  status text NOT NULL DEFAULT 'Waiting'
    CHECK (status IN ('Waiting', 'Contacted', 'Booked', 'Cancelled')),

  notes text,
  source text NOT NULL DEFAULT 'voice'
    CHECK (source IN ('voice', 'chat', 'discord', 'admin')),

  booked_event_id text,
  contacted_at timestamptz,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS waitlist_status_idx ON "Waitlist"(status);
CREATE INDEX IF NOT EXISTS waitlist_preferred_date_idx ON "Waitlist"(preferred_date);
CREATE INDEX IF NOT EXISTS waitlist_client_id_idx ON "Waitlist"(client_id);

CREATE OR REPLACE FUNCTION waitlist_set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER waitlist_updated_at BEFORE UPDATE ON "Waitlist"
FOR EACH ROW EXECUTE FUNCTION waitlist_set_updated_at();
