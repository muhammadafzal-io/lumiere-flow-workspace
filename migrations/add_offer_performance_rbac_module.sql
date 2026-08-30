-- Migration: add "offer_performance" RBAC module + grant it to Super Admin
-- Additive only. Same pattern as add_waitlist_rbac_module.sql — runs AFTER create_rbac_tables.sql's
-- initial seed, so it must ALSO explicitly grant the new permissions to Super Admin.
INSERT INTO "Permissions" ("Module", "Action")
SELECT 'offer_performance', a FROM unnest(ARRAY['View','Create','Update','Delete','Manage']) AS a
ON CONFLICT ("Module", "Action") DO NOTHING;

INSERT INTO "Role_Permissions" (role_id, permission_id)
SELECT r.id, p.id
FROM "Roles" r
CROSS JOIN "Permissions" p
WHERE r."Name" = 'Super Admin' AND p."Module" = 'offer_performance'
ON CONFLICT DO NOTHING;
