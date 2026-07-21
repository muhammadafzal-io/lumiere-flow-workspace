-- Migration: track delivery channel/failures + reminder state on BookingCompletions
-- Supports the reminder + expiry-enforcement cron and the "Pending Bookings" staff view.
ALTER TABLE "BookingCompletions" ADD COLUMN IF NOT EXISTS "DeliveryChannel" text; -- 'email' | 'sms' | 'chat_reply' | 'none', set at creation time
ALTER TABLE "BookingCompletions" ADD COLUMN IF NOT EXISTS "RemindedAt" timestamptz; -- set once a midpoint reminder has fired, prevents double-sends
ALTER TABLE "BookingCompletions" ADD COLUMN IF NOT EXISTS "DeliveryError" text; -- set if the fire-and-forget send fails in the background
