-- Migration: rename Practitioners.Status value "Away" to "Inactive"
-- Every other Settings tab (Rooms, Equipment, Services) uses Active/Inactive; Practitioners is
-- the only one using "Away", purely because the original check constraint only allows that
-- value. This is cosmetic-only — "Away" and "Inactive" mean exactly the same thing today
-- (not bookable, hidden from the active roster) — but the inconsistent label is confusing.
--
-- NOT applied automatically. Run this against the database FIRST, then deploy a matching code
-- change that swaps every "Away" string literal for "Inactive" (src/lib/integrations/airtable.ts,
-- src/app/(admin)/settings/page-client.tsx, src/components/calendar/AppointmentDialogs.tsx) —
-- doing it in the other order will make every deactivate/reactivate call fail the constraint.
ALTER TABLE "Practitioners" DROP CONSTRAINT IF EXISTS practitioners_status_valid;
UPDATE "Practitioners" SET "Status" = 'Inactive' WHERE "Status" = 'Away';
ALTER TABLE "Practitioners" ADD CONSTRAINT practitioners_status_valid
  CHECK ("Status" IN ('Active', 'Inactive'));
