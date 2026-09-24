"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { CalendarDays, ChevronDown, Clock, Gift, Home, Loader2, LogOut, User } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase-auth/client";
import {
  AccountCard,
  AccountError,
  AccountStage,
  PrimaryButton,
} from "@/components/account/AccountUI";
import { AccountContext, type AccountIdentity } from "@/lib/account/use-account-context";
import { ClientAvatar } from "@/components/account/ClientAvatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * The customer shell: top bar on desktop, thumb-reachable tabs on mobile — built on the same
 * tokens and nav/menu conventions as the admin AppSidebar/TopBar so the portal reads as the same
 * product, not a different app the client happens to be routed through.
 *
 * It also owns the account gate — a visitor with no session is sent to sign in, and one whose
 * Google account isn't attached to a client record yet is walked through claiming it. Doing that
 * here keeps every page inside the shell able to assume "there is a customer".
 */

const NAV = [
  { href: "/account", label: "Home", icon: Home },
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
  avatarVersion?: number | null;
}

export function AccountShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [avatarVersion, setAvatarVersion] = useState<number | null>(null);

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
      setAvatarVersion(data.avatarVersion ?? null);
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
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-background px-4 py-10 flex justify-center">
        <div className="w-full max-w-md">
          <AccountError message={loadError} onRetry={load} />
        </div>
      </div>
    );
  }

  if (me && me.status !== "linked") {
    return (
      <AccountStage>
        {me.status === "needs_verification" ? (
          <ClaimProfile
            clientId={me.clientId!}
            hint={me.hint!}
            onLinked={() => location.reload()}
          />
        ) : (
          <AccountCard className="space-y-2 p-8 text-center text-card-foreground">
            <h1 className="text-lg font-semibold text-foreground">We need a hand here</h1>
            <p className="text-sm text-muted-foreground">
              More than one profile uses this email, so we can&apos;t tell which one is yours.
              Please contact the clinic and we&apos;ll sort it out.
            </p>
          </AccountCard>
        )}
      </AccountStage>
    );
  }

  // The client's own CRM record name is the identity used everywhere else in their account
  // (bookings, appointments) — preferred over the Google account's own profile name, which can
  // differ or be blank. "there" is only reached if somehow neither exists.
  const fullName = me?.profile?.name?.trim() || me?.session?.name?.trim() || "";
  const identity: AccountIdentity = {
    name: fullName,
    firstName: fullName.split(/\s+/)[0] || "there",
    email: me?.session?.email ?? null,
    avatarVersion,
    setAvatarVersion,
  };

  return (
    <AccountContext.Provider value={identity}>
      <div className="min-h-screen overflow-x-clip bg-muted/30">
        <header className="sticky top-0 z-30 border-b border-white/10 bg-panel/90 text-panel-foreground backdrop-blur-md">
          <div className="mx-auto flex h-14 max-w-5xl items-center gap-4 px-4 sm:px-6">
            <Link href="/" className="flex items-center gap-2 flex-shrink-0">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white text-sm font-semibold text-primary shadow-sm">
                L
              </div>
              <span className="hidden font-serif text-lg tracking-tight text-panel-foreground sm:inline">
                Lumière
              </span>
            </Link>
            <nav className="hidden items-center gap-1 sm:flex">
              {NAV.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
                      active
                        ? "bg-white/12 text-white"
                        : "text-white/65 hover:bg-white/8 hover:text-white"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <div className="flex-1" />
            <AccountMenu identity={identity} />
          </div>
        </header>

        <main className="mx-auto max-w-5xl px-4 py-8 pb-28 sm:px-6 sm:py-12 sm:pb-16">
          {children}
        </main>

        {/* Bottom tabs on phones — where a thumb actually reaches. */}
        <nav className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur-md sm:hidden">
          <div className="grid grid-cols-5">
            {NAV.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`relative flex flex-col items-center gap-0.5 py-2.5 text-[10px] transition-colors ${
                    active ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  {active && (
                    <span
                      aria-hidden
                      className="absolute inset-x-5 top-0 h-0.5 rounded-full bg-primary"
                    />
                  )}
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </AccountContext.Provider>
  );
}

function initialFor(name: string, email: string | null): string {
  const source = name.trim() || email || "";
  return source ? source[0]!.toUpperCase() : "?";
}

/** Mirrors the admin TopBar's account menu exactly, so signing out looks and behaves the same
 * whether you're staff or a client. */
function AccountMenu({ identity }: { identity: AccountIdentity }) {
  const router = useRouter();

  const signOut = async () => {
    await getSupabaseBrowser().auth.signOut();
    // Same rule as an anonymous visit: once signed out there is no session, so land back on the
    // public page rather than a bare sign-in form.
    router.replace("/");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 rounded-full border border-white/20 bg-white/5 py-1 pl-1 pr-1 text-panel-foreground transition-colors hover:bg-white/10 sm:pr-3">
          <ClientAvatar
            name={identity.name || identity.email || ""}
            version={identity.avatarVersion}
            className="h-7 w-7 text-xs"
          />
          <span className="hidden sm:inline text-sm font-medium max-w-[140px] truncate">
            {identity.firstName}
          </span>
          <ChevronDown className="hidden h-4 w-4 text-white/60 sm:inline" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs text-muted-foreground truncate">
          {identity.email ?? identity.name}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/account/profile" className="cursor-pointer">
            <User className="h-4 w-4 mr-2" />
            My details
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={signOut} className="text-destructive focus:text-destructive">
          <LogOut className="h-4 w-4 mr-2" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
        <h1 className="text-lg font-semibold text-foreground">Is this you?</h1>
        <p className="text-sm text-muted-foreground">
          We found a profile with your email. Confirm one detail and we&apos;ll connect it to your
          account.
        </p>
      </div>

      {hint.phoneLast4 && (
        <div className="space-y-1.5">
          <Label htmlFor="phoneLast4">Last 4 digits of your phone</Label>
          <Input
            id="phoneLast4"
            inputMode="numeric"
            maxLength={4}
            value={phoneLast4}
            onChange={(e) => setPhoneLast4(e.target.value)}
          />
        </div>
      )}

      {hint.birthday && (
        <div className="space-y-1.5">
          <Label htmlFor="birthday">{hint.phoneLast4 ? "Or your birthday" : "Your birthday"}</Label>
          <Input
            id="birthday"
            type="date"
            value={birthday}
            onChange={(e) => setBirthday(e.target.value)}
          />
        </div>
      )}

      {!hint.phoneLast4 && !hint.birthday && (
        <p className="text-sm text-muted-foreground">
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
