-- Migration: let a client sign in to the customer portal.
-- One column. A null means "no account yet", which is every existing client, so nothing about
-- today's booking, chat, voice or admin behaviour changes.
-- NOTE: identifiers are double-quoted to preserve exact case — see create_services.sql for why.
-- Run in Supabase SQL Editor.
--
-- GOOGLE SIGN-IN must also be enabled once, by hand:
--   1. Google Cloud → APIs & Services → Credentials → OAuth client ID (Web application),
--      with https://<project-ref>.supabase.co/auth/v1/callback as an authorised redirect URI.
--   2. Supabase → Authentication → Providers → Google → paste the client ID and secret.
--   3. Supabase → Authentication → URL Configuration → add the site URLs (localhost and the
--      production domain) to the redirect allow-list.

-- The auth account this client signs in with. UNIQUE so one Google account can never be attached
-- to two client records, which is what would let someone see another person's history.
ALTER TABLE "Clients" ADD COLUMN IF NOT EXISTS auth_user_id uuid UNIQUE;

-- Lookup on every portal request: session → this client's row.
CREATE INDEX IF NOT EXISTS clients_auth_user_id_idx ON "Clients" (auth_user_id);

-- Matching a signed-in Google account to an existing record is by email, so that lookup needs to
-- be fast and case-insensitive.
CREATE INDEX IF NOT EXISTS clients_email_lower_idx ON "Clients" (lower("Email"));
