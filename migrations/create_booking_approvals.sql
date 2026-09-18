-- Migration: head practitioner sign-off for services that require it.
-- Three additive pieces: a per-service flag, the clinic's head practitioner, and one row per
-- booking awaiting sign-off. Nothing existing changes behaviour: RequiresApproval defaults to
-- false, so every service already configured keeps today's booking flow exactly.
-- NOTE: identifiers are double-quoted to preserve exact case — see create_services.sql for why.
-- Run in Supabase SQL Editor.

-- 1. Which services need sign-off. Data-driven, never a hardcoded service name.
ALTER TABLE "Services" ADD COLUMN IF NOT EXISTS "RequiresApproval" boolean NOT NULL DEFAULT false;

-- 2. Who signs off. Lives on the Settings singleton beside the clinic's other config, so the head
-- practitioner can be changed from the admin UI without a code change.
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "HeadPractitionerId" uuid REFERENCES "Practitioners"(id);

-- Seed the initial head practitioner by looking her up by name rather than pasting an id, so this
-- migration is safe to run against any environment. Only fills an empty setting.
UPDATE "Settings"
SET "HeadPractitionerId" = (
  SELECT id FROM "Practitioners"
  WHERE lower(trim("Name")) = 'dr sophia marchitti' AND "Status" = 'Active'
  LIMIT 1
)
WHERE "HeadPractitionerId" IS NULL;

-- 3. One approval per booking. Keyed by the Google Calendar event id, the same way
-- BookingCompletions and RequiredFormTracking hang off a booking — there is no appointments table.
-- Deliberately holds no customer data: the queue reads name/time/practitioner from the calendar,
-- so there is nothing here to keep in sync or to leak.
CREATE TABLE IF NOT EXISTS "BookingApprovals" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL UNIQUE,
  service_id uuid REFERENCES "Services"(id) ON DELETE SET NULL,
  service_name text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
  -- Who decided, snapshotted like FormResponses.entered_by_staff_name so the record survives the
  -- account being renamed or removed.
  decided_by_user_id uuid REFERENCES "Users"(id) ON DELETE SET NULL,
  decided_by_name text,
  decided_at timestamptz,
  reason text,
  -- The head practitioner's handwritten signature, drawn at approval time and kept as a PNG data
  -- URL. Held inline rather than in object storage: this app uses no storage bucket today, and a
  -- signature is a few tens of KB that is only ever read back with its own approval row.
  signature text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS booking_approvals_status_idx ON "BookingApprovals" (status, created_at DESC);

-- 4. RBAC module. Same pattern as add_waitlist_rbac_module.sql: new permissions must be granted to
-- Super Admin explicitly, since the original seed only covered the permissions that existed then.
INSERT INTO "Permissions" ("Module", "Action")
SELECT 'booking_approvals', a FROM unnest(ARRAY['View','Create','Update','Delete','Manage']) AS a
ON CONFLICT ("Module", "Action") DO NOTHING;

INSERT INTO "Role_Permissions" (role_id, permission_id)
SELECT r.id, p.id
FROM "Roles" r
CROSS JOIN "Permissions" p
WHERE r."Name" = 'Super Admin' AND p."Module" = 'booking_approvals'
ON CONFLICT DO NOTHING;
