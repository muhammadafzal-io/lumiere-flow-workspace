-- ============================================================================
-- RUN ME: all currently-pending migrations, combined into one paste-and-run
-- script for the Supabase SQL editor. Safe to run more than once — every step
-- is guarded, so re-running is a no-op rather than an error.
--
-- Status when this file was generated (verified against the live database):
--   1. add_clients_phone_index.sql          — unverifiable via the REST API; re-runnable either way
--   2. add_offer_performance_rbac_module.sql — ALREADY APPLIED (included anyway; it no-ops)
--   3. add_client_id_foreign_keys.sql        — NOT APPLIED (all four client_id columns still text)
--
-- The originals remain in migrations/ as the historical record. This file only
-- exists to make applying them in one pass straightforward.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Clients.Phone index
-- Looked up on nearly every chat/voice/Discord turn (booking, cancel,
-- reschedule, waitlist, promo-code validation) with no index behind it.
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_clients_phone ON "Clients" ("Phone");


-- ----------------------------------------------------------------------------
-- 2. offer_performance RBAC module (+ grant to Super Admin)
-- Already applied — ON CONFLICT makes re-running harmless.
-- ----------------------------------------------------------------------------
INSERT INTO "Permissions" ("Module", "Action")
SELECT 'offer_performance', a FROM unnest(ARRAY['View','Create','Update','Delete','Manage']) AS a
ON CONFLICT ("Module", "Action") DO NOTHING;

INSERT INTO "Role_Permissions" (role_id, permission_id)
SELECT r.id, p.id
FROM "Roles" r
CROSS JOIN "Permissions" p
WHERE r."Name" = 'Super Admin' AND p."Module" = 'offer_performance'
ON CONFLICT DO NOTHING;


-- ----------------------------------------------------------------------------
-- 3. Real Clients foreign keys on the client_id columns that were plain TEXT
--
-- Each block converts text -> uuid ONLY if the column hasn't been converted
-- already (re-running the raw ALTER would fail, since NULLIF(uuid,'') is not a
-- valid comparison). Orphaned references — a client deleted after the row was
-- written, which these columns never prevented — are nulled first, because a
-- foreign key cannot be added on top of data that already violates it. No rows
-- are deleted; only the now-meaningless id link is cleared, and each table
-- keeps whatever denormalized name/email snapshot it already carried.
--
-- ON DELETE SET NULL throughout: a send/redemption history record should
-- survive its client being deleted, not disappear with it. Same choice
-- add_client_id_to_forms.sql already made for FormResponses/RequiredFormTracking.
-- ----------------------------------------------------------------------------

-- 3a. email_sends (client_id already nullable)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'email_sends'
      AND column_name = 'client_id' AND data_type <> 'uuid'
  ) THEN
    UPDATE email_sends SET client_id = NULL
    WHERE client_id IS NOT NULL
      AND client_id NOT IN (SELECT id::text FROM "Clients");

    ALTER TABLE email_sends
      ALTER COLUMN client_id TYPE uuid USING NULLIF(client_id, '')::uuid;
  END IF;
END $$;

ALTER TABLE email_sends DROP CONSTRAINT IF EXISTS email_sends_client_id_fkey;
ALTER TABLE email_sends
  ADD CONSTRAINT email_sends_client_id_fkey
  FOREIGN KEY (client_id) REFERENCES "Clients"(id) ON DELETE SET NULL;


-- 3b. rule_sends (client_id is NOT NULL today — must be dropped before nulling)
ALTER TABLE rule_sends ALTER COLUMN client_id DROP NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'rule_sends'
      AND column_name = 'client_id' AND data_type <> 'uuid'
  ) THEN
    UPDATE rule_sends SET client_id = NULL
    WHERE client_id IS NOT NULL
      AND client_id NOT IN (SELECT id::text FROM "Clients");

    ALTER TABLE rule_sends
      ALTER COLUMN client_id TYPE uuid USING NULLIF(client_id, '')::uuid;
  END IF;
END $$;

ALTER TABLE rule_sends DROP CONSTRAINT IF EXISTS rule_sends_client_id_fkey;
ALTER TABLE rule_sends
  ADD CONSTRAINT rule_sends_client_id_fkey
  FOREIGN KEY (client_id) REFERENCES "Clients"(id) ON DELETE SET NULL;


-- 3c. rule_code_redemptions (same NOT NULL situation).
-- UNIQUE (rule_id, client_id) is unaffected by nulling client_id — Postgres
-- treats each NULL as distinct for uniqueness purposes.
ALTER TABLE rule_code_redemptions ALTER COLUMN client_id DROP NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'rule_code_redemptions'
      AND column_name = 'client_id' AND data_type <> 'uuid'
  ) THEN
    UPDATE rule_code_redemptions SET client_id = NULL
    WHERE client_id IS NOT NULL
      AND client_id NOT IN (SELECT id::text FROM "Clients");

    ALTER TABLE rule_code_redemptions
      ALTER COLUMN client_id TYPE uuid USING NULLIF(client_id, '')::uuid;
  END IF;
END $$;

ALTER TABLE rule_code_redemptions DROP CONSTRAINT IF EXISTS rule_code_redemptions_client_id_fkey;
ALTER TABLE rule_code_redemptions
  ADD CONSTRAINT rule_code_redemptions_client_id_fkey
  FOREIGN KEY (client_id) REFERENCES "Clients"(id) ON DELETE SET NULL;


-- 3d. "ReviewRequests" (already nullable, currently empty)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ReviewRequests'
      AND column_name = 'client_id' AND data_type <> 'uuid'
  ) THEN
    UPDATE "ReviewRequests" SET client_id = NULL
    WHERE client_id IS NOT NULL
      AND client_id NOT IN (SELECT id::text FROM "Clients");

    ALTER TABLE "ReviewRequests"
      ALTER COLUMN client_id TYPE uuid USING NULLIF(client_id, '')::uuid;
  END IF;
END $$;

ALTER TABLE "ReviewRequests" DROP CONSTRAINT IF EXISTS "ReviewRequests_client_id_fkey";
ALTER TABLE "ReviewRequests"
  ADD CONSTRAINT "ReviewRequests_client_id_fkey"
  FOREIGN KEY (client_id) REFERENCES "Clients"(id) ON DELETE SET NULL;


-- ----------------------------------------------------------------------------
-- Verification — run this after the script above. Every client_id should read
-- "uuid", and four foreign keys should be listed.
-- ----------------------------------------------------------------------------
-- SELECT table_name, column_name, data_type
-- FROM information_schema.columns
-- WHERE column_name = 'client_id'
--   AND table_name IN ('email_sends','rule_sends','rule_code_redemptions','ReviewRequests')
-- ORDER BY table_name;
--
-- SELECT conname, conrelid::regclass AS table_name
-- FROM pg_constraint
-- WHERE contype = 'f' AND conname LIKE '%client_id_fkey%'
-- ORDER BY conname;
