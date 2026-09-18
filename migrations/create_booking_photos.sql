-- Migration: treatment-area photos, configured per service.
-- Additive: PhotoRequirement defaults to 'NONE', so every service already configured keeps today's
-- booking flow exactly — no request is created and nothing is asked of the client.
-- NOTE: identifiers are double-quoted to preserve exact case — see create_services.sql for why.
-- Run in Supabase SQL Editor.
--
-- STORAGE: the files live in a PRIVATE Supabase Storage bucket named "booking-photos" — never in
-- this database. The app creates the bucket on first use; it can also be created by hand in
-- Supabase → Storage with "Public bucket" switched OFF. Nothing may be served from a public URL:
-- staff read photos through short-lived signed URLs issued after a permission check, and the
-- client reaches their own upload page with a one-off token.

-- 1. Per-service configuration. Data-driven, never a hardcoded service name.
ALTER TABLE "Services"
  ADD COLUMN IF NOT EXISTS "PhotoRequirement" text NOT NULL DEFAULT 'NONE'
    CHECK ("PhotoRequirement" IN ('NONE', 'OPTIONAL', 'REQUIRED'));

-- What the client is asked to photograph, in the clinic's own words. Falls back to generic wording
-- when left empty, so a service can switch the requirement on without writing copy first.
ALTER TABLE "Services" ADD COLUMN IF NOT EXISTS "PhotoInstructions" text;

-- 2. One request per booking, keyed by the calendar event id the way BookingCompletions,
-- RequiredFormTracking and BookingApprovals already hang off a booking.
CREATE TABLE IF NOT EXISTS "BookingPhotoRequests" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL UNIQUE,
  service_id uuid REFERENCES "Services"(id) ON DELETE SET NULL,
  client_id uuid REFERENCES "Clients"(id) ON DELETE SET NULL,
  -- The client's key to their own upload page. Random, single-purpose, and the only thing that
  -- grants access — no client or appointment id can be guessed to reach someone else's photos.
  token text NOT NULL UNIQUE,
  requirement text NOT NULL CHECK (requirement IN ('OPTIONAL', 'REQUIRED')),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'COMPLETED', 'SKIPPED', 'CANCELLED')),
  instructions text,
  service_name text NOT NULL,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS booking_photo_requests_status_idx
  ON "BookingPhotoRequests" (status, created_at DESC);

-- 3. The photos themselves — a table rather than a column on the request, so a client can send
-- more than one area photo without a schema change. Only the storage path is kept here.
CREATE TABLE IF NOT EXISTS "BookingPhotos" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES "BookingPhotoRequests"(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  content_type text NOT NULL,
  size_bytes integer NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS booking_photos_request_idx ON "BookingPhotos" (request_id, uploaded_at);

-- 4. RBAC module for staff access to client photos. Same pattern as add_waitlist_rbac_module.sql:
-- new permissions must be granted to Super Admin explicitly.
INSERT INTO "Permissions" ("Module", "Action")
SELECT 'booking_photos', a FROM unnest(ARRAY['View','Create','Update','Delete','Manage']) AS a
ON CONFLICT ("Module", "Action") DO NOTHING;

INSERT INTO "Role_Permissions" (role_id, permission_id)
SELECT r.id, p.id
FROM "Roles" r
CROSS JOIN "Permissions" p
WHERE r."Name" = 'Super Admin' AND p."Module" = 'booking_photos'
ON CONFLICT DO NOTHING;
