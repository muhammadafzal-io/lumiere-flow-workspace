-- Migration: create OfferEvents table
-- Tracks every cross-sell (ServiceAddons) or upsell (ServiceOffers) offer the AI presents during
-- booking, and how the client responded — the data conversion-rate/revenue analytics is computed
-- from later (Accepted / Presented, by offer, by procedure, by offer type).
--
-- offer_id is deliberately NOT a foreign key: it points at either "ServiceAddons".id or
-- "ServiceOffers".id depending on offer_type, and Postgres has no polymorphic FK. offer_name/
-- offered_price/base_price are captured as a snapshot at presentation time so this row's meaning
-- never changes even if the underlying add-on/offer is later renamed, repriced, or deleted.
--
-- chat_id correlates PRESENTED -> ACCEPTED/DECLINED within one conversation, since a client_id
-- and booking (event_id) may not exist yet at the moment an offer is first presented.
-- NOTE: identifiers are double-quoted to preserve exact case — see create_services.sql for why.
CREATE TABLE IF NOT EXISTS "OfferEvents" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id text NOT NULL,
  client_id uuid REFERENCES "Clients"(id) ON DELETE SET NULL,
  client_name text,
  client_contact text,
  event_id text,
  service_id uuid REFERENCES "Services"(id) ON DELETE SET NULL,
  offer_id uuid NOT NULL,
  offer_type text NOT NULL, -- 'CROSS_SELL' | 'UPSELL'
  offer_name text NOT NULL,
  offered_price numeric,
  base_price numeric,
  status text NOT NULL DEFAULT 'PRESENTED', -- 'PRESENTED' | 'ACCEPTED' | 'DECLINED' | 'NO_RESPONSE'
  platform text,
  responded_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS offer_events_chat_id_idx ON "OfferEvents" (chat_id);
CREATE INDEX IF NOT EXISTS offer_events_status_idx ON "OfferEvents" (status);
CREATE INDEX IF NOT EXISTS offer_events_offer_id_idx ON "OfferEvents" (offer_id);
