-- Migration: Add rooms column to clinics table
-- This allows storing room names as a simple array

ALTER TABLE clinics ADD COLUMN rooms TEXT[] DEFAULT ARRAY['Room 1', 'Room 2'];

-- Update any existing clinics without rooms
UPDATE clinics SET rooms = ARRAY['Room 1', 'Room 2'] WHERE rooms IS NULL;

-- Add a comment for documentation
COMMENT ON COLUMN clinics.rooms IS 'Array of available room names for appointment booking';
