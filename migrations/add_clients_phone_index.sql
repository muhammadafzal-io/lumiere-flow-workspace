-- The Clients table is looked up by phone number on nearly every chat/voice/Discord turn
-- (booking, cancel, reschedule, waitlist, promo-code validation) via lookupClientByPhone, but
-- had no index backing that filter — every lookup was a sequential scan over the whole table.
CREATE INDEX IF NOT EXISTS idx_clients_phone ON "Clients" ("Phone");
