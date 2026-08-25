-- Migration: add priority ranking to ServiceAddons
-- Lets staff rank a service's paired add-ons (e.g. HydraFacial: LED Therapy=1, Eye Treatment=2,
-- Neck Treatment=3) so the post-booking complementary-treatment recommendation can pick the best
-- available one instead of an arbitrary one. Lower number = higher priority. Nullable — existing
-- rows and any add-on staff never ranks simply sorts last (see recipe.ts's nullsFirst: false).
ALTER TABLE "ServiceAddons" ADD COLUMN IF NOT EXISTS priority integer;
