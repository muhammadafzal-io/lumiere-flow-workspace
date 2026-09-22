"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase-auth/client";
import { AccountCard } from "@/components/account/AccountUI";

export default function AccountSignInPage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <div className="min-h-screen bg-lumiere-cream flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <AccountCard className="p-8 text-center space-y-5">
          <div className="space-y-1.5">
            <h1 className="font-serif text-2xl text-lumiere-navy">Lumière</h1>
            <p className="text-sm text-lumiere-muted">
              Sign in to see your appointments, offers and details.
            </p>
          </div>

          <button
            onClick={signIn}
            disabled={busy}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-lumiere-ivory bg-white px-4 py-3 text-sm font-medium text-lumiere-navy shadow-sm transition-colors hover:bg-lumiere-cream disabled:opacity-50"
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

          <p className="text-[11px] text-lumiere-muted">
            Booked with us before? Use the email address the clinic has on file.
          </p>
        </AccountCard>
      </div>
    </div>
  );
}
