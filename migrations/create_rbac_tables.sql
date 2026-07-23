-- Migration: RBAC core tables (see RBAC_IMPLEMENTATION_PLAN.md)
-- Additive only — no existing table is modified or dropped.
-- NOTE: identifiers are double-quoted to preserve exact case (Postgres folds
-- unquoted identifiers to lowercase, breaking the app's .from("Users") etc. queries).

-- Staff/login accounts. id matches auth.users.id — Supabase Auth owns credentials,
-- this table holds the app-facing profile + role assignment.
CREATE TABLE IF NOT EXISTS "Users" (
  id uuid PRIMARY KEY,
  "Name" text NOT NULL,
  "Email" text NOT NULL UNIQUE,
  "Status" text NOT NULL DEFAULT 'Active', -- Active | Disabled
  "MustChangePassword" boolean NOT NULL DEFAULT true,
  "PractitionerId" uuid REFERENCES "Practitioners"(id),
  "InvitedAt" timestamptz,
  "InvitedBy" uuid REFERENCES "Users"(id),
  "LastLoginAt" timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "Roles" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "Name" text NOT NULL UNIQUE,
  "Description" text,
  "IsSystem" boolean NOT NULL DEFAULT false, -- true = Super Admin; blocks delete/edit
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "Permissions" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "Module" text NOT NULL,
  "Action" text NOT NULL, -- View | Create | Update | Delete | Manage
  created_at timestamptz DEFAULT now(),
  UNIQUE ("Module", "Action")
);

CREATE TABLE IF NOT EXISTS "Role_Permissions" (
  role_id uuid NOT NULL REFERENCES "Roles"(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES "Permissions"(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS "User_Roles" (
  user_id uuid NOT NULL REFERENCES "Users"(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES "Roles"(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);

-- Seed default roles.
INSERT INTO "Roles" ("Name", "Description", "IsSystem") VALUES
  ('Super Admin', 'Full system access. Cannot be edited or deleted.', true),
  ('Admin', 'Broad operational access.', false),
  ('Receptionist', 'Front-desk booking and customer management.', false),
  ('Practitioner', 'Calendar access only.', false)
ON CONFLICT ("Name") DO NOTHING;

-- Seed the full module x action permission set.
INSERT INTO "Permissions" ("Module", "Action")
SELECT m, a
FROM unnest(ARRAY[
  'dashboard','calendar','pending_bookings','customers','rules','campaigns',
  'activity','email_logs','flows','checkout','settings','credits','voice_chat','rbac'
]) AS m
CROSS JOIN unnest(ARRAY['View','Create','Update','Delete','Manage']) AS a
ON CONFLICT ("Module", "Action") DO NOTHING;

-- Super Admin gets every permission.
INSERT INTO "Role_Permissions" (role_id, permission_id)
SELECT r.id, p.id
FROM "Roles" r
CROSS JOIN "Permissions" p
WHERE r."Name" = 'Super Admin'
ON CONFLICT DO NOTHING;
