-- Rule-based promo codes (Rules."Incentive Code", e.g. "SAVE40") are a single shared code sent
-- to every client the rule's trigger matches — unlike birthday codes (unique per client, tracked
-- on the client's own "Credit Codes" field) they had no redemption tracking at all:
-- validateRuleOfferCode only checked the parent rule was active, so the same code could be
-- validated and applied by an unlimited number of different clients, unlimited times each.
--
-- This tracks one redemption per (rule, client) pair — each client who receives a rule's offer
-- can redeem it once; a different client can still redeem the same shared code once for
-- themselves. The UNIQUE constraint makes double-redemption for the same client impossible to
-- race past, the same pattern as booking_claims.
--
-- Run in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS rule_code_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (rule_id, client_id)
);

CREATE INDEX IF NOT EXISTS idx_rule_code_redemptions_rule_id ON rule_code_redemptions (rule_id);
