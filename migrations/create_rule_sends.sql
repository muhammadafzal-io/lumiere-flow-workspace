-- Tracks automated rule/campaign sends (dedupe for once_per_client mode).
-- Run in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS rule_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  client_email TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'sent'
    CHECK (status IN ('sent', 'failed', 'skipped')),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rule_sends_rule ON rule_sends (rule_id);
CREATE INDEX IF NOT EXISTS idx_rule_sends_rule_client ON rule_sends (rule_id, client_id);
CREATE INDEX IF NOT EXISTS idx_rule_sends_sent_at ON rule_sends (sent_at DESC);
