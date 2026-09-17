-- Migration: create ClientNotes table + "client_notes" RBAC module
-- Practitioner/staff notes about a client, written from the customer profile's appointment view.
-- Client-level (a note written at one visit must still be visible when the next appointment is
-- opened); event_id only records which appointment the note was written from.
-- Clients."Notes" stays as-is — it's the single general note edited from the profile's Edit mode.
-- Additive only. Run in Supabase SQL Editor.
-- NOTE: identifiers are double-quoted to preserve exact case — see create_services.sql for why.
CREATE TABLE IF NOT EXISTS "ClientNotes" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES "Clients"(id) ON DELETE CASCADE,
  event_id text,                           -- Google Calendar event id the note was written from
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 5000),
  author_user_id uuid REFERENCES "Users"(id) ON DELETE SET NULL,
  -- Snapshot, like FormResponses.entered_by_staff_name — the note keeps its author's name even if
  -- the account is later renamed or removed.
  author_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);

CREATE INDEX IF NOT EXISTS client_notes_client_created_idx
  ON "ClientNotes" (client_id, created_at DESC);

-- Same pattern as add_waitlist_rbac_module.sql: new permissions must be granted to Super Admin
-- explicitly, since the original seed only ran against the permissions that existed then.
-- "Manage" here means "may edit/delete notes written by someone else".
INSERT INTO "Permissions" ("Module", "Action")
SELECT 'client_notes', a FROM unnest(ARRAY['View','Create','Update','Delete','Manage']) AS a
ON CONFLICT ("Module", "Action") DO NOTHING;

INSERT INTO "Role_Permissions" (role_id, permission_id)
SELECT r.id, p.id
FROM "Roles" r
CROSS JOIN "Permissions" p
WHERE r."Name" = 'Super Admin' AND p."Module" = 'client_notes'
ON CONFLICT DO NOTHING;
