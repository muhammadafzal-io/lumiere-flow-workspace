"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { CalendarDays, Clock, Gift, Home, Loader2, LogOut, Plus, User } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase-auth/client";
import { AccountCard, AccountError, PrimaryButton } from "@/components/account/AccountUI";

/**
 * The customer shell: top bar on desktop, thumb-reachable tabs on mobile.
 *
 * It also owns the account gate — a visitor with no session is sent to sign in, and one whose
 * Google account isn't attached to a client record yet is walked through claiming it. Doing that
 * here keeps every page inside the shell able to assume "there is a customer".
 */

const NAV = [
  { href: "/account", label: "Home", icon: Home },
  { href: "/account/book", label: "Book", icon: Plus },
  { href: "/account/appointments", label: "Visits", icon: CalendarDays },
  { href: "/account/history", label: "History", icon: Clock },
  { href: "/account/offers", label: "Offers", icon: Gift },
  { href: "/account/profile", label: "Profile", icon: User },
];

interface MeResponse {
  status: "linked" | "needs_verification" | "ambiguous";
  profile?: { id: string; name: string };
  clientId?: string;
  hint?: { phoneLast4: boolean; birthday: boolean };
  session?: { name: string | null; email: string | null };
}

export function AccountShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/account/me", { cache: "no-store" });
      if (res.status === 401) {
        // No session at all — send them straight to the sign-in page, the same way the staff
        // AuthGate sends a signed-out visitor to /login. (Sign-in itself now lives outside this
        // shell — see account/(app)/layout.tsx — so this can never bounce someone who is already
        // on their way to sign in back out again.)
        router.replace("/account/sign-in");
        return;
      }
      const data = await res.json().catch(() => null);
      // A failed request must never be read as one of the account states below — an error once
      // rendered as "more than one profile uses this email", which sent people to the clinic over
      // what was actually a server problem.
      if (!res.ok || !data?.status) {
        throw new Error(data?.error || "We couldn't load your account.");
      }
      setMe(data);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "We couldn't load your account.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="min-h-screen bg-lumiere-cream flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-lumiere-muted" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-lumiere-cream px-4 py-10 flex justify-center">
        <div className="w-full max-w-md">
          <AccountError message={loadError} onRetry={load} />
        </div>
      </div>
    );
  }

  if (me && me.status !== "linked") {
    return (
      <div className="min-h-screen bg-lumiere-cream px-4 py-10 flex justify-center">
        <div className="w-full max-w-md">
          {me.status === "needs_verification" ? (
            <ClaimProfile
              clientId={me.clientId!}
              hint={me.hint!}
              onLinked={() => location.reload()}
            />
          ) : (
            <AccountCard className="p-8 text-center space-y-2">
              <h1 className="text-lg font-semibold text-lumiere-navy">We need a hand here</h1>
              <p className="text-sm text-lumiere-muted">
                More than one profile uses this email, so we can&apos;t tell which one is yours.
                Please contact the clinic and we&apos;ll sort it out.
              </p>
            </AccountCard>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-lumiere-cream">
      <header className="sticky top-0 z-30 border-b border-lumiere-navy/10 bg-lumiere-cream/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link
            href="/"
            className="font-serif text-lg font-medium tracking-tight text-lumiere-navy transition-opacity hover:opacity-70"
          >
            Lumière
          </Link>
          <nav className="hidden items-center gap-1 sm:flex">
            {NAV.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-1.5 text-[11px] uppercase tracking-[0.16em] transition-colors ${
                    active ? "text-lumiere-navy" : "text-lumiere-navy/55 hover:text-lumiere-navy"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <SignOutButton />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-10 pb-28 sm:px-6 sm:pb-14">{children}</main>

      {/* Bottom tabs on phones — where a thumb actually reaches. */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-lumiere-navy/10 bg-lumiere-cream/95 backdrop-blur sm:hidden">
        <div className="grid grid-cols-6">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center gap-0.5 py-2 text-[10px] ${
                  active ? "text-lumiere-navy" : "text-lumiere-muted"
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

function SignOutButton() {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        await getSupabaseBrowser().auth.signOut();
        // Same rule as an anonymous visit: once signed out there is no session, so land back on
        // the public page rather than a bare sign-in form.
        router.replace("/");
      }}
      className="text-lumiere-navy/55 transition-colors hover:text-lumiere-navy"
      aria-label="Sign out"
    >
      <LogOut className="h-4 w-4" />
    </button>
  );
}

/**
 * Claiming a record that already holds visit history. The question asked is whichever detail the
 * record actually has on file — the answer is checked on the server, and the value on file is
 * never sent to the browser.
 */
function ClaimProfile({
  clientId,
  hint,
  onLinked,
}: {
  clientId: string;
  hint: { phoneLast4: boolean; birthday: boolean };
  onLinked: () => void;
}) {
  const [phoneLast4, setPhoneLast4] = useState("");
  const [birthday, setBirthday] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/account/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, phoneLast4, birthday }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "That didn't match what we have on file.");
      onLinked();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AccountCard className="p-8 space-y-4">
      <div className="space-y-1">
        <h1 className="text-lg font-semibold text-lumiere-navy">Is this you?</h1>
        <p className="text-sm text-lumiere-muted">
          We found a profile with your email. Confirm one detail and we&apos;ll connect it to your
          account.
        </p>
      </div>

      {hint.phoneLast4 && (
        <label className="block">
          <span className="text-sm text-lumiere-navy">Last 4 digits of your phone</span>
          <input
            inputMode="numeric"
            maxLength={4}
            value={phoneLast4}
            onChange={(e) => setPhoneLast4(e.target.value)}
            className="mt-1 w-full rounded-lg border border-lumiere-ivory bg-lumiere-cream px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-lumiere-rose"
          />
        </label>
      )}

      {hint.birthday && (
        <label className="block">
          <span className="text-sm text-lumiere-navy">
            {hint.phoneLast4 ? "Or your birthday" : "Your birthday"}
          </span>
          <input
            type="date"
            value={birthday}
            onChange={(e) => setBirthday(e.target.value)}
            className="mt-1 w-full rounded-lg border border-lumiere-ivory bg-lumiere-cream px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-lumiere-rose"
          />
        </label>
      )}

      {!hint.phoneLast4 && !hint.birthday && (
        <p className="text-sm text-lumiere-muted">
          We don&apos;t have enough on file to confirm it&apos;s you. Please contact the clinic.
        </p>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <PrimaryButton
        onClick={submit}
        disabled={saving || (!phoneLast4.trim() && !birthday.trim())}
        className="w-full"
      >
        {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
        Connect my profile
      </PrimaryButton>
    </AccountCard>
  );
}
