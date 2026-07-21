-- Migration: create ServiceRequirements table
-- Each row maps a service -> requirement type (room/practitioner/equipment) and rule
-- NOTE: identifiers are double-quoted to preserve exact case — see create_equipment.sql/
-- create_services.sql for why (unquoted identifiers get lowercased by Postgres).
CREATE TABLE IF NOT EXISTS "ServiceRequirements" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid NOT NULL REFERENCES "Services"(id) ON DELETE CASCADE,
  kind text NOT NULL, -- 'room' | 'practitioner' | 'equipment'
  rule jsonb NOT NULL, -- rule object, e.g. {type: 'any_room', roomType: 'Treatment'} or {type: 'specific_room', rooms: ['Room 3']}
  created_at timestamptz DEFAULT now()
);
