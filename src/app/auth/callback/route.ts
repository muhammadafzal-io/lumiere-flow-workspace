import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-auth/server";
import { getSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * Where Google sends a member of staff back.
 *
 * Signing in with Google proves an email address — it says nothing about whether that person works
 * here. Anyone with a Google account can reach this point, so the session is only allowed to stand
 * when it maps to an Active row in Users; otherwise it is signed straight back out. Without that,
 * a stranger would hold a valid session against the admin app and sit on Access Denied screens
 * rather than being turned away at the door.
 */
export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const code = req.nextUrl.searchParams.get("code");
  if (!code) return NextResponse.redirect(`${origin}/login?error=sign_in_failed`);

  const supabase = await getSupabaseServer();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    console.error("[auth/callback] code exchange failed:", error?.message);
    return NextResponse.redirect(`${origin}/login?error=sign_in_failed`);
  }

  const { data: staff } = await getSupabase()
    .from("Users")
    .select("id, Status")
    .eq("id", data.user.id)
    .maybeSingle();

  if (!staff || staff.Status !== "Active") {
    await supabase.auth.signOut();
    // A customer landing here is a normal mistake, not an attack — point them at their own door.
    return NextResponse.redirect(`${origin}/login?error=not_staff`);
  }

  return NextResponse.redirect(`${origin}/dashboard`);
}
