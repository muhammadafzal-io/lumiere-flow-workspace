-- Unified audit log for every email send attempt (cron, manual, system).
-- Run in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS email_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  category TEXT NOT NULL
    CHECK (category IN (
      'rule', 'campaign', 'reminder', 'birthday', 'noshow', 'reactivation',
      'booking', 'cancellation', 'reschedule', 'general'
    )),
  trigger_type TEXT NOT NULL
    CHECK (trigger_type IN ('cron', 'manual', 'system')),
  source_id TEXT,
  source_name TEXT,
  client_id TEXT,
  client_name TEXT,
  to_email TEXT NOT NULL DEFAULT '',
  subject TEXT,
  status TEXT NOT NULL
    CHECK (status IN ('sent', 'failed', 'skipped')),
  fail_reason TEXT,
  provider TEXT,
  simulated BOOLEAN NOT NULL DEFAULT FALSE,
  message_preview TEXT
);

CREATE INDEX IF NOT EXISTS idx_email_sends_created ON email_sends (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_sends_category ON email_sends (category);
CREATE INDEX IF NOT EXISTS idx_email_sends_status ON email_sends (status);
CREATE INDEX IF NOT EXISTS idx_email_sends_trigger ON email_sends (trigger_type);
CREATE INDEX IF NOT EXISTS idx_email_sends_to_email ON email_sends (to_email);
