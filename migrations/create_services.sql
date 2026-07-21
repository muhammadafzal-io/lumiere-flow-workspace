-- Migration: create Services table
-- Fields: id (uuid), Name, DurationMinutes, Locations (branches), OnlineBookable, RequiresConsultation, MinNoticeHours, MaxAdvanceDays, Status
-- NOTE: identifiers are double-quoted to preserve exact case — Postgres folds unquoted
-- identifiers to lowercase, which previously created a table literally named "services"
-- that the app's `.from("Services")` queries could never find.
CREATE TABLE IF NOT EXISTS "Services" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "Name" text NOT NULL,
  "DurationMinutes" integer NOT NULL DEFAULT 60,
  "Locations" text[],
  "OnlineBookable" boolean NOT NULL DEFAULT true,
  "RequiresConsultation" boolean NOT NULL DEFAULT false,
  "MinNoticeHours" integer NOT NULL DEFAULT 0,
  "MaxAdvanceDays" integer NOT NULL DEFAULT 365,
  "Status" text NOT NULL DEFAULT 'Active',
  created_at timestamptz DEFAULT now()
);
