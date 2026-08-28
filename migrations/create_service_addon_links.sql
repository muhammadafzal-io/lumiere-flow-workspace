-- Migration: create ServiceAddonLinks table
-- Replaces the old free-text ServiceAddons("name" as typed text) approach with a proper
-- Service-to-Service relationship: an add-on IS a real Service, selected from the existing
-- catalog rather than typed manually. A main service can link to many add-on services; the same
-- add-on service can be linked from multiple main services (each with its own priority ranking —
-- priority is a property of the PAIRING, not of the add-on service itself).
-- NOTE: identifiers are double-quoted to preserve exact case — see create_services.sql for why.
CREATE TABLE IF NOT EXISTS "ServiceAddonLinks" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  main_service_id uuid NOT NULL REFERENCES "Services"(id) ON DELETE CASCADE,
  addon_service_id uuid NOT NULL REFERENCES "Services"(id) ON DELETE CASCADE,
  -- Lower number = higher priority when ranking (see treatment-recommendation.ts); null sorts last.
  priority integer,
  created_at timestamptz DEFAULT now(),
  UNIQUE (main_service_id, addon_service_id),
  CHECK (main_service_id <> addon_service_id)
);

CREATE INDEX IF NOT EXISTS service_addon_links_main_idx ON "ServiceAddonLinks" (main_service_id);
