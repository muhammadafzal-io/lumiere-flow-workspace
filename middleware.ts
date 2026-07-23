import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Phase 1 of the RBAC rollout (see RBAC_IMPLEMENTATION_PLAN.md): this only keeps
 * the Supabase Auth session cookie fresh on every request. It does NOT redirect
 * unauthenticated users or check permissions yet — that's Phase 4, enabled only
 * after explicit confirmation, since it's the point where existing access could be
 * affected by a misconfigured role/permission.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Touching getUser() is what actually refreshes an expiring session token.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    /*
     * Run on everything except static assets and Next internals — narrowed to
     * actual pages/API routes once Phase 4 adds real enforcement here.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
