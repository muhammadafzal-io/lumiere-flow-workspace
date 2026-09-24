-- Migration: create ClientPersonalNotes — notes a CLIENT writes for themselves in the customer portal.
-- Deliberately separate from "ClientNotes" (staff-written, internal, may hold clinical detail and is
-- never shown to the client): a client sees and edits only their own rows here, and a staff note can
-- never leak into the portal because the two live in different tables.
-- Additive only. Run in Supabase SQL Editor.
CREATE TABLE IF NOT EXISTS "ClientPersonalNotes" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES "Clients"(id) ON DELETE CASCADE,
  event_id text,                           -- optional: the appointment the note is about
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);

CREATE INDEX IF NOT EXISTS client_personal_notes_client_created_idx
  ON "ClientPersonalNotes" (client_id, created_at DESC);
