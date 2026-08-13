-- Migration: add client_id to FormResponses and RequiredFormTracking
-- Neither table has ever carried a real link to the Clients table — only denormalized
-- phone/client_name text. This adds the missing link so a form response/tracking row can be
-- tied to the correct customer, not just the correct booking (event_id) and procedure
-- (service_id). Nullable since existing rows predate this and can't be reliably backfilled;
-- ON DELETE SET NULL so a form-history record survives even if the client record is later
-- removed (same pattern as Waitlist.preferred_practitioner_id).
ALTER TABLE "FormResponses" ADD COLUMN client_id uuid REFERENCES "Clients"(id) ON DELETE SET NULL;
ALTER TABLE "RequiredFormTracking" ADD COLUMN client_id uuid REFERENCES "Clients"(id) ON DELETE SET NULL;
