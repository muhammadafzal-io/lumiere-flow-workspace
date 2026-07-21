-- Migration: clinic-wide business hours as real, structured config instead of the previous
-- hardcoded 9 AM-7 PM / Mon-Sat constants in code. Same {mon:{start,end}, tue:{...}, ...} shape
-- as a Practitioner's WorkingHours — a day key absent from the object means closed that day.
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "BusinessHoursSchedule" jsonb;
