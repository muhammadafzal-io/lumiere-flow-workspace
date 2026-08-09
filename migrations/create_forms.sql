-- Migration: create Forms table
-- Each row is one in-house structured form (e.g. a pre-treatment consent form), generated via AI
-- or built manually, and rendered by this app — unlike ServiceFormLinks, which only stores label+
-- url pairs pointing to externally-hosted forms (see create_service_form_links.sql). `fields` holds
-- the entire ordered field list as one jsonb blob: [{id, type, label, required, options?, helpText}].
-- This mirrors the established idiom for an ordered array-of-similar-objects owned by one parent
-- and always read/written as a whole unit (see Practitioners.WorkingHours/TimeOff, Rooms.ClosedTimes).
-- NOTE: identifiers are double-quoted to preserve exact case — see create_services.sql for why.
CREATE TABLE IF NOT EXISTS "Forms" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'Active', -- Active | Inactive
  source_prompt text, -- original AI prompt used to generate this form; null for manually-built forms
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
