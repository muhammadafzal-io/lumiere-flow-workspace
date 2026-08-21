-- Migration: add token/expires_at to OfferEvents
-- Offers now get presented via a secure link in the booking confirmation email (alongside the
-- required-form links) instead of inside the live chat conversation — this is the token that
-- link carries. Mirrors the exact token/expiry shape already used by FormResponses,
-- BookingCompletions, and WaitlistOffers (crypto.randomBytes(32) base64url, single-use).
ALTER TABLE "OfferEvents" ADD COLUMN IF NOT EXISTS "token" text UNIQUE;
ALTER TABLE "OfferEvents" ADD COLUMN IF NOT EXISTS "expires_at" timestamptz;
CREATE INDEX IF NOT EXISTS offer_events_token_idx ON "OfferEvents" (token);
