-- Migration: remove dead multi-location/branch columns
-- These were added by add_room_scheduling_fields.sql, create_equipment.sql,
-- add_practitioner_scheduling_fields.sql, and create_services.sql for a multi-branch feature
-- that was never implemented — no API route, TypeScript type, or UI form ever reads or writes
-- them, and the availability engine (src/lib/booking/recipe.ts) never filters by location. This
-- clinic operates a single location today; drop the columns rather than leave schema that
-- implies a feature that doesn't exist.
ALTER TABLE "Rooms" DROP COLUMN IF EXISTS "Location";
ALTER TABLE "Equipment" DROP COLUMN IF EXISTS "Location";
ALTER TABLE "Practitioners" DROP COLUMN IF EXISTS "Locations";
ALTER TABLE "Services" DROP COLUMN IF EXISTS "Locations";
