import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-auth/server";

export const dynamic = "force-dynamic";

/**
 * Where Google sends the client back. Exchanges the one-time code for a session cookie, then hands
 * over to the portal, which does the account linking on its first request.
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const origin = req.nextUrl.origin;

  if (!code) return NextResponse.redirect(`${origin}/account/sign-in?error=missing_code`);

  const supabase = await getSupabaseServer();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.error("[account/auth] code exchange failed:", error.message);
    return NextResponse.redirect(`${origin}/account/sign-in?error=sign_in_failed`);
  }

  return NextResponse.redirect(`${origin}/account`);
}
