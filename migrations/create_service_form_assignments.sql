-- Migration: create ServiceFormAssignments table
-- Many-to-many join between Services and Forms (a form can attach to multiple services, a service
-- can require multiple forms) — managed from the Services edit dialog in Settings, next to the
-- existing "Required forms" [external link] section. Deliberately separate from ServiceFormLinks:
-- that table stores external URLs, this one references in-house Forms.id rows.
-- NOTE: identifiers are double-quoted to preserve exact case — see create_services.sql for why.
CREATE TABLE IF NOT EXISTS "ServiceFormAssignments" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid NOT NULL REFERENCES "Services"(id) ON DELETE CASCADE,
  form_id uuid NOT NULL REFERENCES "Forms"(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE (service_id, form_id)
);
