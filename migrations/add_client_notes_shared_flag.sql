-- Migration: let staff choose which practitioner notes the client can see in their portal.
-- ClientNotes are internal by default and stay that way — this flag is FALSE unless a staff member
-- ticks "Share with client" on a note. The portal reads only rows where shared_with_client is TRUE.
-- Additive only. Run in Supabase SQL Editor.
ALTER TABLE "ClientNotes"
  ADD COLUMN IF NOT EXISTS shared_with_client boolean NOT NULL DEFAULT false;
