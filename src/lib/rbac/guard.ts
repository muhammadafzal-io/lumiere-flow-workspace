/**
 * Server-side permission guard for API routes (RBAC_IMPLEMENTATION_PLAN.md Phase 4).
 * This is the actual authority — the frontend hiding a button is only a convenience,
 * never the real check.
 */
import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-auth/server";
import { userHasPermission, type PermissionAction } from "@/lib/rbac/permissions";

/** The logged-in user's id from the Supabase Auth session, or null if not signed in. */
export async function getCurrentUserId(): Promise<string | null> {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export type PermissionCheck = { ok: true; userId: string } | { ok: false; response: NextResponse };

/**
 * Use at the top of an API route handler:
 *   const check = await requireApiPermission("activity", "View");
 *   if (!check.ok) return check.response;
 * 401 when there's no session at all, 403 when signed in but lacking the permission —
 * distinct statuses so a client can tell "log in" apart from "not allowed".
 */
export async function requireApiPermission(
  module: string,
  action: PermissionAction,
): Promise<PermissionCheck> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Not signed in." }, { status: 401 }),
    };
  }

  const allowed = await userHasPermission(userId, module, action);
  if (!allowed) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Access denied.", module, action }, { status: 403 }),
    };
  }

  return { ok: true, userId };
}
