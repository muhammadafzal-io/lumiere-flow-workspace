-- Migration: create ServiceFormLinks table
-- Each row is one labeled link to an externally-hosted form (e.g. a consent form or medical
-- history form) that staff attach to a Service. This app does not build or render forms — it
-- only stores label + URL pairs and opens them in a new tab.
-- NOTE: identifiers are double-quoted to preserve exact case — see create_services.sql/
-- create_service_requirements.sql for why (unquoted identifiers get lowercased by Postgres).
CREATE TABLE IF NOT EXISTS "ServiceFormLinks" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid NOT NULL REFERENCES "Services"(id) ON DELETE CASCADE,
  label text NOT NULL,
  url text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
