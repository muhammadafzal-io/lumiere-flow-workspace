-- Migration: bring Practitioners in line with the Settings PRD (v1) §5
-- Qualifications = Service ids this practitioner may perform.
ALTER TABLE "Practitioners" ADD COLUMN IF NOT EXISTS "Qualifications" text[] DEFAULT ARRAY[]::text[];
-- WorkingHours / Breaks shape: { mon?: {start:"09:00", end:"17:00"}, tue?: {...}, wed?: {...}, thu?: {...}, fri?: {...}, sat?: {...}, sun?: {...} }
ALTER TABLE "Practitioners" ADD COLUMN IF NOT EXISTS "WorkingHours" jsonb;
ALTER TABLE "Practitioners" ADD COLUMN IF NOT EXISTS "Breaks" jsonb;
-- TimeOff shape: Array<{ start: string; end: string; label?: string }> (ISO datetimes) — same shape as Equipment/Rooms ClosedTimes.
ALTER TABLE "Practitioners" ADD COLUMN IF NOT EXISTS "TimeOff" jsonb;
ALTER TABLE "Practitioners" ADD COLUMN IF NOT EXISTS "Locations" text[] DEFAULT ARRAY[]::text[];
