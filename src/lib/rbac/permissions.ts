/**
 * RBAC permission engine (RBAC_IMPLEMENTATION_PLAN.md Phase 3).
 *
 * Everything is DB-driven — this file never hardcodes which roles have which
 * permissions. A permission is always an exact "Module:Action" pair; "Manage" is
 * NOT treated as implying View/Create/Update/Delete — if a role should have full
 * control of a module, every action for it must be explicitly granted in
 * Role_Permissions. This keeps what a role can do fully visible in the DB, with no
 * hidden hierarchy to reason about.
 */
import { getSupabase } from "@/lib/supabase";

export type PermissionAction = "View" | "Create" | "Update" | "Delete" | "Manage";

const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { value: Set<string>; expiresAt: number }>();

function permissionKey(module: string, action: string): string {
  return `${module}:${action}`;
}

/** All "Module:Action" permissions a user holds, across every role assigned to them. */
export async function getUserPermissions(userId: string): Promise<Set<string>> {
  const cached = cache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const sb = getSupabase();

  // A Disabled account (or one with no Users row at all) gets zero permissions,
  // regardless of what roles are still assigned — this is what makes "Disable"
  // in the RBAC admin UI actually take effect everywhere at once.
  const { data: userRow } = await sb.from("Users").select("Status").eq("id", userId).maybeSingle();
  if (!userRow || userRow.Status !== "Active") {
    const empty = new Set<string>();
    cache.set(userId, { value: empty, expiresAt: Date.now() + CACHE_TTL_MS });
    return empty;
  }

  const { data, error } = await sb
    .from("User_Roles")
    .select("Roles(Role_Permissions(Permissions(Module,Action)))")
    .eq("user_id", userId);

  if (error) throw new Error(`getUserPermissions: ${error.message}`);

  const perms = new Set<string>();
  for (const row of data ?? []) {
    const role = row as unknown as {
      Roles: { Role_Permissions: { Permissions: { Module: string; Action: string } }[] } | null;
    };
    for (const rp of role.Roles?.Role_Permissions ?? []) {
      perms.add(permissionKey(rp.Permissions.Module, rp.Permissions.Action));
    }
  }

  cache.set(userId, { value: perms, expiresAt: Date.now() + CACHE_TTL_MS });
  return perms;
}

/** Call after changing a user's roles, a role's permissions, or a permission set — anything that could make a cached result stale before its TTL. */
export function invalidateUserPermissionsCache(userId?: string): void {
  if (userId) cache.delete(userId);
  else cache.clear();
}

export async function userHasPermission(
  userId: string,
  module: string,
  action: PermissionAction,
): Promise<boolean> {
  const perms = await getUserPermissions(userId);
  return perms.has(permissionKey(module, action));
}
