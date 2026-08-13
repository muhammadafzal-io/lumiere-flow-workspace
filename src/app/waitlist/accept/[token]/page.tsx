import type { Metadata } from "next";
import { getOfferByToken } from "@/lib/waitlist/offers";
import { AcceptOfferForm } from "@/components/waitlist/AcceptOfferForm";
import { getClinicConfig, getClinicTimezone } from "@/lib/clinic-config";

export async function generateMetadata(): Promise<Metadata> {
  const clinic = await getClinicConfig();
  return { title: `Your slot is available — ${clinic.clinicName}` };
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

export default async function WaitlistAcceptPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const offer = await getOfferByToken(token);

  if (!offer) {
    return (
      <Shell>
        <MessageCard
          title="Link not found"
          body="This link is invalid. If you're trying to claim a waitlist slot, please contact the clinic directly."
        />
      </Shell>
    );
  }

  if (offer.status === "expired") {
    return (
      <Shell>
        <MessageCard
          title="This offer has expired"
          body="This slot has been offered to the next person on the waitlist. Please contact the clinic directly, or keep an eye out for the next match."
        />
      </Shell>
    );
  }

  if (offer.status !== "pending") {
    return (
      <Shell>
        <MessageCard
          title="This offer is no longer available"
          body="This slot has already been claimed or is no longer open. Please contact the clinic directly if you still need an appointment."
        />
      </Shell>
    );
  }

  // Formatted server-side, in the clinic's own timezone, and passed down as a plain string — a
  // client component computing this itself with toLocaleString() during its own SSR pass would
  // mismatch whenever the server and the customer's browser sit in different timezones, breaking
  // hydration (the exact bug the forms dashboard hit and fixed the same way).
  const timezone = await getClinicTimezone();
  const displayTime = new Date(offer.slotStart).toLocaleString("en-US", {
    timeZone: timezone,
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  const expiresLabel = new Date(offer.expiresAt).toLocaleString("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  return (
    <Shell>
      <div className="rounded-2xl border bg-card shadow-sm p-8 space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-lg font-semibold">A slot just opened up</h1>
          <p className="text-sm text-muted-foreground">
            {offer.treatment}
            {` · ${displayTime}`}
            {offer.practitionerName ? ` · with ${offer.practitionerName}` : ""}
          </p>
          <p className="text-xs text-muted-foreground">
            This offer expires at {expiresLabel} — first to claim it gets it.
          </p>
        </div>
        <AcceptOfferForm token={token} />
      </div>
    </Shell>
  );
}
