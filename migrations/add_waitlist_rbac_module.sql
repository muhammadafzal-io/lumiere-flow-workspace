-- Migration: add "waitlist" RBAC module + grant it to Super Admin
-- Additive only. Like add_forms_rbac_module.sql, this runs AFTER create_rbac_tables.sql's initial
-- seed, so it must ALSO explicitly grant the new permissions to Super Admin — the original
-- "Super Admin gets every permission" INSERT only ran once, against the permissions that existed
-- at that time; it does not retroactively apply to rows inserted later.
INSERT INTO "Permissions" ("Module", "Action")
SELECT 'waitlist', a FROM unnest(ARRAY['View','Create','Update','Delete','Manage']) AS a
ON CONFLICT ("Module", "Action") DO NOTHING;

INSERT INTO "Role_Permissions" (role_id, permission_id)
SELECT r.id, p.id
FROM "Roles" r
CROSS JOIN "Permissions" p
WHERE r."Name" = 'Super Admin' AND p."Module" = 'waitlist'
ON CONFLICT DO NOTHING;
