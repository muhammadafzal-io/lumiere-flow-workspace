-- Migration: bring Rooms in line with the Settings PRD (v1) §3
-- Rooms previously only had Name. Add Type, Location, cleanup buffer, active toggle, and closed times.
ALTER TABLE "Rooms" ADD COLUMN IF NOT EXISTS "Type" text NOT NULL DEFAULT 'Treatment';
ALTER TABLE "Rooms" ADD COLUMN IF NOT EXISTS "Location" text;
ALTER TABLE "Rooms" ADD COLUMN IF NOT EXISTS "CleanupMinutes" integer NOT NULL DEFAULT 0;
ALTER TABLE "Rooms" ADD COLUMN IF NOT EXISTS "Status" text NOT NULL DEFAULT 'Active';
-- ClosedTimes shape: Array<{ start: string; end: string; label?: string }> (ISO datetimes) — same shape as Equipment.ClosedTimes.
ALTER TABLE "Rooms" ADD COLUMN IF NOT EXISTS "ClosedTimes" jsonb;
