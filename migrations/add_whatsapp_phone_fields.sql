-- Migration: capture a phone number for staff (Users) and Practitioners, so WhatsApp
-- notifications (team invites, practitioner welcome messages) have somewhere to send to.
-- Neither table had a phone field before this — WhatsApp send logic treats it as optional
-- and simply skips the WhatsApp channel when absent, same as the existing email-optional pattern.
ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "Phone" text;
ALTER TABLE "Practitioners" ADD COLUMN IF NOT EXISTS "Phone" text;
