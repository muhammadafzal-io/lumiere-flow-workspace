-- Migration: create ServiceOffers table
-- Each row is one discount offer a clinic can toggle on/off for a Service. The offer never
-- stores a price itself — only a discount type/value — so it always applies against whatever the
-- Service's own current Price (Rate Card) is at the moment it's read (see
-- src/lib/booking/offer-pricing.ts). starts_at/ends_at are optional scheduling bounds; a null
-- value on either side means "no start/end limit" on that side.
-- NOTE: identifiers are double-quoted to preserve exact case — see create_services.sql for why.
CREATE TABLE IF NOT EXISTS "ServiceOffers" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid NOT NULL REFERENCES "Services"(id) ON DELETE CASCADE,
  name text NOT NULL,
  discount_type text NOT NULL, -- 'percentage' | 'fixed'
  discount_value numeric NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz DEFAULT now()
);
