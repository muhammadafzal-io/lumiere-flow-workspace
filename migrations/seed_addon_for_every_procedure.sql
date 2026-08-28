-- Dev/testing seed: ensures every bookable procedure (main Service — excluding the add-on-only
-- Services already created by migrate_service_addons_to_links.sql, which are never main services)
-- has at least one related Add-On Service, per the "every procedure has an add-on" requirement.
-- Dummy add-ons only — real ones should be added via direct DB inserts for now, since Add-On
-- Services are intentionally NOT editable from the Admin UI in this version.
--
-- Idempotent: reuses an existing same-named Service if one exists, and ServiceAddonLinks' UNIQUE
-- constraint no-ops a repeat link. New add-on Services are marked OnlineBookable = false, same
-- convention as the earlier auto-migration, so they never appear as standalone bookable
-- treatments in chat.
DO $$
DECLARE
  proc RECORD;
  addon_name text;
  addon_price numeric;
  addon_duration integer;
  new_service_id uuid;
BEGIN
  FOR proc IN
    SELECT s.id, s."Name"
    FROM "Services" s
    WHERE s."Name" NOT IN ('LED Therapy', 'Neck Treatment', 'Eye Treatment', 'Therapy', 'White Numbing Ugrade')
      AND NOT EXISTS (
        SELECT 1 FROM "ServiceAddonLinks" l WHERE l.main_service_id = s.id
      )
  LOOP
    CASE proc."Name"
      WHEN 'Microneedling' THEN
        addon_name := 'Serum Infusion Boost'; addon_price := 35; addon_duration := 15;
      WHEN 'Keratin' THEN
        addon_name := 'Deep Conditioning Treatment'; addon_price := 25; addon_duration := 15;
      WHEN 'laser' THEN
        addon_name := 'Soothing Aftercare Treatment'; addon_price := 20; addon_duration := 10;
      WHEN 'Pedicure' THEN
        addon_name := 'Paraffin Wax Treatment'; addon_price := 15; addon_duration := 10;
      WHEN 'medicure' THEN
        addon_name := 'Callus Removal Treatment'; addon_price := 15; addon_duration := 10;
      ELSE
        addon_name := proc."Name" || ' Add-On'; addon_price := 20; addon_duration := 10;
    END CASE;

    SELECT s.id INTO new_service_id
    FROM "Services" s
    WHERE lower(trim(s."Name")) = lower(trim(addon_name))
    LIMIT 1;

    IF new_service_id IS NULL THEN
      INSERT INTO "Services" ("Name", "Price", "DurationMinutes", "Status", "OnlineBookable")
      VALUES (addon_name, addon_price, addon_duration, 'Active', false)
      RETURNING id INTO new_service_id;
    END IF;

    INSERT INTO "ServiceAddonLinks" (main_service_id, addon_service_id, priority)
    VALUES (proc.id, new_service_id, 1)
    ON CONFLICT (main_service_id, addon_service_id) DO NOTHING;
  END LOOP;
END $$;
