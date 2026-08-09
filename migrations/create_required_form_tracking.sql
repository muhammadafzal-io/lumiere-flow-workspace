-- Migration: create RequiredFormTracking table
-- Per-booking, per-form completion tracking, unified across both of this app's form systems —
-- ServiceFormLinks (externally-hosted forms, e.g. Google Forms) and Forms/FormResponses
-- (in-house structured forms filled via /forms/fill/[token]). Neither source table carries any
-- per-booking state on its own (ServiceFormLinks is a static per-Service label+URL; FormResponses
-- already tracks per-booking completion but only for in-house forms, has no sent_at, and no
-- "list everything for this booking" query exists anywhere). This table is the single list staff
-- and the reminder cron read, regardless of which system a given form came from. Deliberately NOT
-- a merge of the two source tables — see create_service_form_assignments.sql for why the
-- external-link and in-house-form systems stay independent; this sits on top of both.
-- NOTE: table name is double-quoted to preserve exact case — see create_form_responses.sql.
CREATE TABLE IF NOT EXISTS "RequiredFormTracking" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL,                 -- Google Calendar event id — the booking this form belongs to
  service_id uuid REFERENCES "Services"(id) ON DELETE CASCADE,
  form_source text NOT NULL CHECK (form_source IN ('external', 'inhouse')),
  -- Denormalized name/url snapshot at send time, not a live join — mirrors FormResponses'
  -- client_name/phone snapshot pattern. Staff UI and reminder emails must keep showing the form
  -- exactly as sent even if the underlying ServiceFormLinks row is later edited/deleted.
  form_name text NOT NULL,
  form_url text NOT NULL,
  service_form_link_id uuid REFERENCES "ServiceFormLinks"(id) ON DELETE SET NULL,
  form_response_id uuid REFERENCES "FormResponses"(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'COMPLETED')),
  sent_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  reminder_sent_at timestamptz,            -- dedup guard for the T-24h form-reminder cron
  created_at timestamptz DEFAULT now()
);

-- Primary lookup key for both the staff slide-over and the reminder cron.
CREATE INDEX IF NOT EXISTS required_form_tracking_event_id_idx ON "RequiredFormTracking"(event_id);
