"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/lib/current-user-context";

/** Redirects a signed-in user with a still-pending temp password to /change-password. */
export function MustChangePasswordGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useCurrentUser();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user?.mustChangePassword) {
      router.replace("/change-password");
    }
  }, [loading, user, router]);

  return <>{children}</>;
}
