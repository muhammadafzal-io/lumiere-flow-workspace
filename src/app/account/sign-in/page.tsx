"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase-auth/client";
import { AccountCard, AccountStage } from "@/components/account/AccountUI";

const CALLBACK_ERRORS: Record<string, string> = {
  missing_code: "That sign-in link was incomplete. Please try again.",
  sign_in_failed: "That sign-in didn't complete. Please try again.",
};

export default function AccountSignInPage() {
  const params = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Surfaces why /account/auth/callback sent someone back here instead of into their account.
  useEffect(() => {
    const reason = params.get("error");
    if (reason && CALLBACK_ERRORS[reason]) setError(CALLBACK_ERRORS[reason]);
  }, [params]);

  const signIn = async () => {
    setBusy(true);
    setError(null);
    const { error: authError } = await getSupabaseBrowser().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/account/auth/callback` },
    });
    if (authError) {
      setError("We couldn't start sign-in. Please try again.");
      setBusy(false);
    }
  };

  return (
    <AccountStage>
      <AccountCard className="space-y-6 rounded-3xl p-9 text-center shadow-[0_30px_60px_-30px_rgba(27,42,74,0.35)]">
        <div className="space-y-1.5">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-base font-semibold text-primary-foreground shadow-sm">
            L
          </div>
          <h1 className="font-serif text-3xl font-medium tracking-[-0.03em] text-foreground">
            Lumière
          </h1>
          <p className="text-sm text-muted-foreground">
            Sign in to see your appointments, offers and details.
          </p>
        </div>

        <button
          onClick={signIn}
          disabled={busy}
          className="w-full inline-flex items-center justify-center gap-2 rounded-full border bg-background px-4 py-3 text-sm font-medium text-foreground shadow-sm transition-all hover:bg-muted/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden>
              <path
                fill="#4285F4"
                d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.4a5.5 5.5 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.6-5.2 3.6-8.8z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.2 0 6-1.1 8-3l-3.9-3a7.2 7.2 0 0 1-10.7-3.8h-4v3.1A12 12 0 0 0 12 24z"
              />
              <path
                fill="#FBBC05"
                d="M5.4 14.2a7.2 7.2 0 0 1 0-4.6V6.5h-4a12 12 0 0 0 0 11l4-3.3z"
              />
              <path
                fill="#EA4335"
                d="M12 4.8c1.8 0 3.4.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.5l4 3.1A7.2 7.2 0 0 1 12 4.8z"
              />
            </svg>
          )}
          Continue with Google
        </button>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <p className="text-[11px] text-muted-foreground">
          Booked with us before? Use the email address the clinic has on file.
        </p>
      </AccountCard>
    </AccountStage>
  );
}
