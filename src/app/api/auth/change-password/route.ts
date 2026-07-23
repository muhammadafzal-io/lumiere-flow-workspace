import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/rbac/guard";
import { getSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * Called right after the client updates its own Supabase Auth password
 * (`supabase.auth.updateUser({ password })`, done client-side with the user's own session).
 * This just clears the `MustChangePassword` flag on their Users row.
 */
export async function POST() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const sb = getSupabase();
  const { error } = await sb.from("Users").update({ MustChangePassword: false }).eq("id", userId);

  if (error) {
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
