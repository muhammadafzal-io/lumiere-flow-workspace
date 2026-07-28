"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useCurrentUser } from "@/lib/current-user-context";
import { NAV_ITEMS } from "@/lib/nav-items";

/**
 * Wraps the entire admin shell (sidebar, header, page content) — not just the page content —
 * so a signed-out visitor never sees any of it, not even the nav chrome. Also redirects a
 * signed-in user still on a temp password to /change-password before showing anything else.
 *
 * "/" (Dashboard) is the fixed post-login landing route, not something the user typed — so a
 * user without dashboard:View would otherwise land straight on an Access Denied screen with no
 * way to reach anything they actually have permission for (the sidebar correctly hides
 * Dashboard, but nothing was moving them off of it). Redirect to their first permitted nav item
 * instead. Direct navigation to any *other* restricted URL still shows Access Denied as before —
 * this only special-cases the implicit default landing page.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading, unauthenticated, can } = useCurrentUser();
  const router = useRouter();
  const pathname = usePathname();
  const firstAccessible = NAV_ITEMS.find((item) => item.module !== "dashboard" && can(item.module));
  // Only "block and redirect" when there's somewhere to send them — a user with truly zero
  // permissions falls through to the Dashboard page's own Access Denied screen instead of
  // spinning forever waiting for a redirect that will never happen.
  const redirectingFromDashboard = pathname === "/" && !can("dashboard") && !!firstAccessible;

  useEffect(() => {
    if (loading) return;
    if (unauthenticated) {
      router.replace("/login");
      return;
    }
    if (user?.mustChangePassword) {
      router.replace("/change-password");
      return;
    }
    if (redirectingFromDashboard && firstAccessible) {
      router.replace(firstAccessible.url);
    }
  }, [loading, unauthenticated, user, redirectingFromDashboard, firstAccessible, router]);

  if (loading || unauthenticated || user?.mustChangePassword || redirectingFromDashboard) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <>{children}</>;
}
