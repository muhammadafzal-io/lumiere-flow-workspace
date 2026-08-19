-- Migration: add Price to Services — the Rate Card. Services already IS the procedure catalog,
-- so its own Price column is the single source of truth for a procedure's base price rather than
-- a separate 1:1 "RateCard" table, which would just duplicate the same rows.
-- Nullable: a service with no price configured yet simply has nothing to quote (see
-- src/lib/booking/offer-pricing.ts) rather than defaulting to some made-up number.
ALTER TABLE "Services" ADD COLUMN IF NOT EXISTS "Price" numeric;
