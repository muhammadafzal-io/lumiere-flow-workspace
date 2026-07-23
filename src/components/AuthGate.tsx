"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useCurrentUser } from "@/lib/current-user-context";

/**
 * Wraps the entire admin shell (sidebar, header, page content) — not just the page content —
 * so a signed-out visitor never sees any of it, not even the nav chrome. Also redirects a
 * signed-in user still on a temp password to /change-password before showing anything else.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading, unauthenticated } = useCurrentUser();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (unauthenticated) {
      router.replace("/login");
      return;
    }
    if (user?.mustChangePassword) {
      router.replace("/change-password");
    }
  }, [loading, unauthenticated, user, router]);

  if (loading || unauthenticated || user?.mustChangePassword) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <>{children}</>;
}
