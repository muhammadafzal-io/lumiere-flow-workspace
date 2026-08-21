import type { Metadata } from "next";
import { getOfferEventByToken } from "@/lib/booking/offer-response";
import { RespondOfferForm } from "@/components/booking/RespondOfferForm";
import { getClinicConfig } from "@/lib/clinic-config";

export async function generateMetadata(): Promise<Metadata> {
  const clinic = await getClinicConfig();
  return { title: `Your appointment offer — ${clinic.clinicName}` };
}

export const dynamic = "force-dynamic";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-muted/30 px-4 py-10">
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}

function MessageCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border bg-card shadow-sm p-8 text-center space-y-2">
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

export default async function OfferRespondPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const offer = await getOfferEventByToken(token);

  if (!offer) {
    return (
      <Shell>
        <MessageCard
          title="Link not found"
          body="This link is invalid. If you're trying to respond to an offer from your appointment confirmation, please contact the clinic directly."
        />
      </Shell>
    );
  }

  if (offer.status === "NO_RESPONSE") {
    return (
      <Shell>
        <MessageCard
          title="This offer has expired"
          body="This offer is no longer available. Please contact the clinic directly if you'd still like to add it to your appointment."
        />
      </Shell>
    );
  }

  if (offer.status !== "PRESENTED") {
    return (
      <Shell>
        <MessageCard
          title="Already responded"
          body="You've already responded to this offer. Please contact the clinic directly if anything needs to change."
        />
      </Shell>
    );
  }

  const isAddOn = offer.offerType === "CROSS_SELL";
  const priceLabel =
    isAddOn && offer.offeredPrice != null
      ? `$${offer.offeredPrice}`
      : !isAddOn && offer.basePrice != null && offer.offeredPrice != null
        ? `$${offer.offeredPrice} (normally $${offer.basePrice})`
        : undefined;

  return (
    <Shell>
      <div className="rounded-2xl border bg-card shadow-sm p-8 space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-lg font-semibold">
            {isAddOn ? "Add this to your appointment?" : "A special offer for your appointment"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {offer.offerName}
            {priceLabel ? ` · ${priceLabel}` : ""}
          </p>
        </div>
        <RespondOfferForm token={token} />
      </div>
    </Shell>
  );
}
