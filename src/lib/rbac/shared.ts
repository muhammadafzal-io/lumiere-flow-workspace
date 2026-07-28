/**
 * Pure "Module:Action" permission-key predicate — no Supabase/server imports, so it's
 * safe to import from client components. Shared by the server guard
 * (`rbac/permissions.ts`'s `userHasPermission`) and the client permission check
 * (`current-user-context.tsx`'s `can()`) so navigation filtering and route protection
 * are always evaluating the exact same predicate against the same DB-sourced data.
 */
export type PermissionAction = "View" | "Create" | "Update" | "Delete" | "Manage";

export function permissionKey(module: string, action: string): string {
  return `${module}:${action}`;
}

export function hasPermissionKey(
  permissions: Set<string>,
  module: string,
  action: PermissionAction,
): boolean {
  return permissions.has(permissionKey(module, action));
}
