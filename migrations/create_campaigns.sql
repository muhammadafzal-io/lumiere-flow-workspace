-- Campaign & Rewards Management
-- Run the ENTIRE file in Supabase SQL Editor (do not paste partial sections).

-- 1. campaigns
CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  trigger_type TEXT NOT NULL DEFAULT 'visit_count',
  visit_count INTEGER NOT NULL CHECK (visit_count > 0),
  reward_type TEXT NOT NULL CHECK (reward_type IN ('credit', 'discount')),
  reward_amount NUMERIC(10, 2) NOT NULL CHECK (reward_amount > 0),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'paused', 'expired')),
  processing_status TEXT NOT NULL DEFAULT 'idle'
    CHECK (processing_status IN ('idle', 'processing', 'completed', 'failed')),
  last_processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns (status);
CREATE INDEX IF NOT EXISTS idx_campaigns_visit_count ON campaigns (visit_count);

-- 2. campaign_recipients
CREATE TABLE IF NOT EXISTS campaign_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns (id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL,
  customer_name TEXT NOT NULL DEFAULT '',
  customer_email TEXT NOT NULL DEFAULT '',
  visit_count INTEGER NOT NULL DEFAULT 0,
  reward_amount NUMERIC(10, 2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'redeemed', 'failed')),
  sent_at TIMESTAMPTZ,
  redeemed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_id, customer_id)
);

CREATE INDEX IF NOT EXISTS idx_campaign_recipients_campaign ON campaign_recipients (campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_status ON campaign_recipients (campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_customer ON campaign_recipients (customer_id);

-- 3. customer_rewards
CREATE TABLE IF NOT EXISTS customer_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id TEXT NOT NULL,
  campaign_id UUID NOT NULL REFERENCES campaigns (id) ON DELETE RESTRICT,
  reward_type TEXT NOT NULL CHECK (reward_type IN ('credit', 'discount')),
  reward_amount NUMERIC(10, 2) NOT NULL,
  reward_code TEXT NOT NULL UNIQUE,
  is_redeemed BOOLEAN NOT NULL DEFAULT FALSE,
  redeemed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (customer_id, campaign_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_rewards_customer ON customer_rewards (customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_rewards_campaign ON customer_rewards (campaign_id);
CREATE INDEX IF NOT EXISTS idx_customer_rewards_redeemed ON customer_rewards (is_redeemed);

-- 4. updated_at trigger
CREATE OR REPLACE FUNCTION campaigns_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_campaigns_updated_at ON campaigns;
CREATE TRIGGER trg_campaigns_updated_at
  BEFORE UPDATE ON campaigns
  FOR EACH ROW
  EXECUTE PROCEDURE campaigns_set_updated_at();
