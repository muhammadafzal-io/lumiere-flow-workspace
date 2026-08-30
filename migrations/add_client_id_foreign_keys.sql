-- Migration: add real Clients FK to the client_id/customer_id columns that were always plain
-- TEXT with no referential integrity. Same gap add_client_id_to_forms.sql already fixed for
-- FormResponses/RequiredFormTracking, applied here to the remaining tables that never got it:
-- email_sends, rule_sends, rule_code_redemptions, ReviewRequests. (campaign_recipients and
-- customer_rewards are NOT included here — those tables don't exist in this database yet; their
-- migration, create_campaigns.sql, has never been run. Add the same FK there once that's applied.)
--
-- Every existing row's client_id is UUID-shaped (verified against live data before writing this),
-- but a meaningful fraction don't match any current Clients.id — a client deleted after the row
-- was written (e.g. test-data cleanup) leaves a stale reference behind, since these columns were
-- never enforced. A FK constraint can't be added on top of data that already violates it, so each
-- table nulls out only those orphaned references first — the row itself (and any denormalized
-- name/email snapshot it already carries) is untouched, only the now-meaningless id link is
-- cleared. ON DELETE SET NULL going forward, same choice add_client_id_to_forms.sql made: a
-- send/redemption history record should survive its client being deleted, not disappear with it.

-- email_sends: client_id already nullable, no NOT NULL to drop.
UPDATE email_sends
SET client_id = NULL
WHERE client_id IS NOT NULL
  AND client_id NOT IN (SELECT id::text FROM "Clients");

ALTER TABLE email_sends
  ALTER COLUMN client_id TYPE uuid USING NULLIF(client_id, '')::uuid;

ALTER TABLE email_sends
  ADD CONSTRAINT email_sends_client_id_fkey
  FOREIGN KEY (client_id) REFERENCES "Clients"(id) ON DELETE SET NULL;

-- rule_sends: client_id is currently NOT NULL — must be dropped before any row can be nulled.
ALTER TABLE rule_sends ALTER COLUMN client_id DROP NOT NULL;

UPDATE rule_sends
SET client_id = NULL
WHERE client_id IS NOT NULL
  AND client_id NOT IN (SELECT id::text FROM "Clients");

ALTER TABLE rule_sends
  ALTER COLUMN client_id TYPE uuid USING NULLIF(client_id, '')::uuid;

ALTER TABLE rule_sends
  ADD CONSTRAINT rule_sends_client_id_fkey
  FOREIGN KEY (client_id) REFERENCES "Clients"(id) ON DELETE SET NULL;

-- rule_code_redemptions: same NOT NULL issue. UNIQUE (rule_id, client_id) is unaffected by
-- nulling client_id — Postgres treats each NULL as distinct for uniqueness purposes.
ALTER TABLE rule_code_redemptions ALTER COLUMN client_id DROP NOT NULL;

UPDATE rule_code_redemptions
SET client_id = NULL
WHERE client_id IS NOT NULL
  AND client_id NOT IN (SELECT id::text FROM "Clients");

ALTER TABLE rule_code_redemptions
  ALTER COLUMN client_id TYPE uuid USING NULLIF(client_id, '')::uuid;

ALTER TABLE rule_code_redemptions
  ADD CONSTRAINT rule_code_redemptions_client_id_fkey
  FOREIGN KEY (client_id) REFERENCES "Clients"(id) ON DELETE SET NULL;

-- "ReviewRequests": already nullable, currently empty — safe either way.
UPDATE "ReviewRequests"
SET client_id = NULL
WHERE client_id IS NOT NULL
  AND client_id NOT IN (SELECT id::text FROM "Clients");

ALTER TABLE "ReviewRequests"
  ALTER COLUMN client_id TYPE uuid USING NULLIF(client_id, '')::uuid;

ALTER TABLE "ReviewRequests"
  ADD CONSTRAINT "ReviewRequests_client_id_fkey"
  FOREIGN KEY (client_id) REFERENCES "Clients"(id) ON DELETE SET NULL;
