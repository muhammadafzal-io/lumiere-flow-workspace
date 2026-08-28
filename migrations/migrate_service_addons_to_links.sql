-- One-time data migration: carry existing free-text ServiceAddons rows over to the new
-- ServiceAddonLinks model. For each existing add-on that doesn't already match a real Service by
-- name, creates a new Service row (marked OnlineBookable = false, so it never appears as a
-- standalone bookable treatment in chat — it only ever shows up as an add-on, exactly like
-- before), then links it to its original main service with the same priority.
--
-- Idempotent: safe to re-run — reuses an existing same-named Service if one already exists (either
-- a real pre-existing service, or one created by an earlier run of this script), and the
-- ServiceAddonLinks unique constraint no-ops a repeat link.
--
-- Old "ServiceAddons" rows are left in place afterward (not deleted) — the app no longer reads
-- them, but nothing here destroys the historical data.
DO $$
DECLARE
  r RECORD;
  new_service_id uuid;
BEGIN
  FOR r IN SELECT * FROM "ServiceAddons" LOOP
    SELECT s.id INTO new_service_id
    FROM "Services" s
    WHERE lower(trim(s."Name")) = lower(trim(r.name))
    LIMIT 1;

    IF new_service_id IS NULL THEN
      INSERT INTO "Services" ("Name", "Price", "DurationMinutes", "Status", "OnlineBookable")
      VALUES (r.name, r.price, COALESCE(r.duration_minutes, 0), COALESCE(r.status, 'Active'), false)
      RETURNING id INTO new_service_id;
    END IF;

    INSERT INTO "ServiceAddonLinks" (main_service_id, addon_service_id, priority)
    VALUES (r.service_id, new_service_id, r.priority)
    ON CONFLICT (main_service_id, addon_service_id) DO NOTHING;
  END LOOP;
END $$;
