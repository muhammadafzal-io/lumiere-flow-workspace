-- Migration: create WaitlistOffers table
-- Backs "offer a freed slot to the best-matching waitlist candidate, one at a time" — when a
-- booking is cancelled or rescheduled, the freed (room, practitioner, equipment, time) combo is
-- offered to exactly one open Waitlist entry via a single-use accept/decline link (same
-- token/expiry/status recipe as FormResponses/BookingCompletions), falling through to the next
-- matching candidate on decline/expiry/loss-to-someone-else rather than ever offering the same
-- slot to two people at once.
-- source_event_id is a plain text column (not a FK) — same reasoning as Waitlist.booked_event_id:
-- appointments live only in Google Calendar, never in Postgres.
CREATE TABLE IF NOT EXISTS "WaitlistOffers" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  waitlist_id uuid NOT NULL REFERENCES "Waitlist"(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,

  slot_start timestamptz NOT NULL,
  slot_end timestamptz NOT NULL,
  treatment text NOT NULL,
  service_id uuid REFERENCES "Services"(id) ON DELETE SET NULL,
  practitioner_name text,
  room text,
  equipment text[] NOT NULL DEFAULT '{}',

  source_event_id text NOT NULL,

  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'expired', 'superseded')),

  expires_at timestamptz NOT NULL,
  responded_at timestamptz,
  booked_event_id text,

  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS waitlist_offers_waitlist_id_idx ON "WaitlistOffers"(waitlist_id);
CREATE INDEX IF NOT EXISTS waitlist_offers_source_event_idx ON "WaitlistOffers"(source_event_id);
CREATE INDEX IF NOT EXISTS waitlist_offers_status_idx ON "WaitlistOffers"(status);

-- Defense in depth (the application flow already guarantees this): never more than one live
-- offer per waitlist entry, and never more than one live offer per freed slot, at the same time.
CREATE UNIQUE INDEX IF NOT EXISTS waitlist_offers_one_pending_per_entry
  ON "WaitlistOffers"(waitlist_id) WHERE status = 'pending';
CREATE UNIQUE INDEX IF NOT EXISTS waitlist_offers_one_pending_per_slot
  ON "WaitlistOffers"(source_event_id) WHERE status = 'pending';
