-- Speeds up per-customer lookups added by the 360° Customer Profile feature.
-- Run in Supabase SQL Editor.

-- email_sends already has indexes on created_at/category/status/trigger_type/to_email
-- (see create_email_sends.sql) but none on client_id — the customer profile filters by it.
CREATE INDEX IF NOT EXISTS idx_email_sends_client_id ON email_sends (client_id);

-- "Operations Log" (legacy Airtable-style naming, quoted identifiers required) has no index
-- at all today — the customer profile filters it by "Client ID" for a customer's activity feed.
CREATE INDEX IF NOT EXISTS idx_operations_log_client_id ON "Operations Log" ("Client ID");
