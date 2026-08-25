-- Migration: add a clinic-configurable Google Review URL
-- Lets staff set the link customers are sent after a positive follow-up response (see
-- src/lib/retention/review-request.ts). Same single-row Settings table as Clinic Name/Address/
-- Timezone/Business Hours — read via getClinicConfig(), edited via the Clinic Info Settings tab.
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "Google Review URL" text;
