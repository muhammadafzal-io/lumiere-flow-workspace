-- Tracks post-treatment follow-up emails (one per calendar appointment).
-- Run in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS followup_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id TEXT NOT NULL UNIQUE,
  client_id TEXT,
  client_name TEXT NOT NULL DEFAULT '',
  client_email TEXT NOT NULL DEFAULT '',
  treatment TEXT NOT NULL DEFAULT '',
  appointment_end TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent'
    CHECK (status IN ('sent', 'failed', 'skipped')),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_followup_sends_appointment ON followup_sends (appointment_id);
CREATE INDEX IF NOT EXISTS idx_followup_sends_client ON followup_sends (client_id);
CREATE INDEX IF NOT EXISTS idx_followup_sends_sent_at ON followup_sends (sent_at DESC);
