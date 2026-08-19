-- Migration: create ServiceAddons table
-- Each row is one optional add-on/upsell a client can attach to a booking of the given Service
-- (e.g. "LED Light Therapy" on top of a HydraFacial). Rides along inside the same appointment —
-- it does not have its own room/equipment/practitioner requirements, only extra duration and an
-- informational price, added to the base Service's own recipe and resolved availability.
-- NOTE: identifiers are double-quoted to preserve exact case — see create_services.sql for why.
CREATE TABLE IF NOT EXISTS "ServiceAddons" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid NOT NULL REFERENCES "Services"(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  price numeric,
  duration_minutes integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'Active', -- 'Active' | 'Inactive'
  created_at timestamptz DEFAULT now()
);
