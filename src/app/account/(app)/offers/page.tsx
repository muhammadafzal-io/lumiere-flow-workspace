"use client";

import { useState } from "react";
import { Check, Copy, Gift } from "lucide-react";
import { useAccountData } from "@/lib/account/use-account-data";
import {
  PageHeader,
  AccountCard,
  AccountEmpty,
  AccountError,
  AccountLoading,
} from "@/components/account/AccountUI";

interface Offer {
  id: string;
  name: string;
  detail: string;
  code: string | null;
  serviceName: string | null;
}

export default function AccountOffersPage() {
  const { data, loading, error, reload } = useAccountData<{ offers: Offer[] }>(
    "/api/account/offers",
  );
  const offers = data?.offers ?? [];
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(code);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard blocked — the code is on screen to type instead.
    }
  };

  if (loading) return <AccountLoading rows={2} />;
  if (error) return <AccountError message={error} onRetry={reload} />;

  return (
    <div>
      <PageHeader eyebrow="Offers" title="Offers" subtitle="What's available to you right now." />
      {offers.length === 0 ? (
        <AccountEmpty
          icon={Gift}
          title="No offers right now"
          body="We'll show anything available to you here — it's worth checking back."
          action={{ label: "Book an appointment", href: "/account/book" }}
        />
      ) : (
        <div className="flex flex-wrap gap-4">
          {offers.map((offer) => {
            return (
              <AccountCard
                key={offer.id}
                className="relative min-w-[16rem] flex-[1_1_20rem] overflow-hidden bg-primary/[0.07] p-5 ring-1 ring-primary/20 sm:p-6"
              >
                <div
                  aria-hidden
                  className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-white/50"
                />
                <div className="relative flex h-full flex-col gap-5">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                    <Gift className="h-5 w-5" />
                  </span>
                  <div>
                    <div className="font-serif text-xl font-medium tracking-[-0.01em] text-foreground break-words">
                      {offer.name}
                    </div>
                    <div className="mt-1.5 text-sm text-foreground/70">{offer.detail}</div>
                    {offer.serviceName && (
                      <div className="mt-2 text-[11px] uppercase tracking-[0.14em] text-foreground/60">
                        {offer.serviceName}
                      </div>
                    )}
                  </div>
                  {offer.code && (
                    <button
                      onClick={() => copy(offer.code!)}
                      aria-label={`Copy code ${offer.code}`}
                      className="mt-auto inline-flex w-fit items-center gap-2 rounded-full border border-dashed border-foreground/30 bg-white/70 px-4 py-2 font-mono text-xs tracking-wider text-foreground transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {offer.code}
                      {copied === offer.code ? (
                        <Check className="h-3.5 w-3.5 text-success" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                  )}
                </div>
              </AccountCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
