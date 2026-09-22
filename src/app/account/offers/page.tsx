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
      <PageHeader title="Offers" subtitle="What's available to you right now." />
      {offers.length === 0 ? (
        <AccountEmpty
          title="No offers right now"
          body="We'll show anything available to you here — it's worth checking back."
          action={{ label: "Book an appointment", href: "/account/book" }}
        />
      ) : (
        <div className="space-y-3">
          {offers.map((offer) => (
            <AccountCard key={offer.id} className="p-4">
              <div className="flex items-start gap-3">
                <div className="h-9 w-9 rounded-full bg-lumiere-blush flex items-center justify-center flex-shrink-0">
                  <Gift className="h-4 w-4 text-lumiere-navy" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-lumiere-navy break-words">
                    {offer.name}
                  </div>
                  <div className="text-xs text-lumiere-muted mt-0.5">{offer.detail}</div>
                  {offer.code && (
                    <button
                      onClick={() => copy(offer.code!)}
                      className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-lumiere-ivory bg-lumiere-cream px-2.5 py-1 text-xs font-mono text-lumiere-navy"
                    >
                      {offer.code}
                      {copied === offer.code ? (
                        <Check className="h-3 w-3" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </button>
                  )}
                </div>
              </div>
            </AccountCard>
          ))}
        </div>
      )}
    </div>
  );
}
