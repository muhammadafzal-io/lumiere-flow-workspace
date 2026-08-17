-- Per-service override for the waitlist cap. Nullable: when unset, waitlist enforcement
-- falls back to the flat MAX_WAITLIST_PER_SLOT default in src/lib/waitlist/store.ts.
ALTER TABLE "Services" ADD COLUMN IF NOT EXISTS "WaitlistCap" integer;
