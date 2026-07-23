-- Migration: create Equipment table
-- Fields: id (uuid), Name, Type (Installed|Mobile), HomeRoom, Location, CleanupMinutes, Status, ClosedTimes
-- NOTE: identifiers are double-quoted to preserve exact case — Postgres folds unquoted
-- identifiers to lowercase, which previously created a table literally named "equipment"
-- that the app's `.from("Equipment")` queries could never find.
CREATE TABLE IF NOT EXISTS "Equipment" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "Name" text NOT NULL,
  "Type" text NOT NULL DEFAULT 'Mobile',
  "HomeRoom" text,
  "Location" text,
  "CleanupMinutes" integer NOT NULL DEFAULT 0,
  "Status" text NOT NULL DEFAULT 'Active',
  "ClosedTimes" jsonb,
  created_at timestamptz DEFAULT now()
);
