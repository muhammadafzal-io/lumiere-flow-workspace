"use client";

import Link from "next/link";
import type { CustomerAppointment } from "@/lib/account/visible";
import { useAccountData } from "@/lib/account/use-account-data";
import { AppointmentCard } from "@/components/account/AppointmentCard";
import {
  PageHeader,
  AccountEmpty,
  AccountError,
  AccountLoading,
  SectionLabel,
  SecondaryButton,
} from "@/components/account/AccountUI";

interface Offer {
  id: string;
  name: string;
  detail: string;
}

/**
 * Home. Ordered by what the client needs to know, in this order: when am I next in, is anything
 * waiting on me, how do I book again. Anything with nothing to say is hidden rather than shown
 * empty.
 */
interface AppointmentsResponse {
  upcoming: CustomerAppointment[];
  past: CustomerAppointment[];
}

export default function AccountHome() {
  const appts = useAccountData<AppointmentsResponse>("/api/account/appointments");
  const offersResult = useAccountData<{ offers: Offer[] }>("/api/account/offers");

  const loading = appts.loading || offersResult.loading;
  const error = appts.error || offersResult.error;
  const reload = () => {
    appts.reload();
    offersResult.reload();
  };

  if (loading) return <AccountLoading rows={3} />;
  if (error) return <AccountError message={error} onRetry={reload} />;

  const upcoming = appts.data?.upcoming ?? [];
  const past = appts.data?.past ?? [];
  const offers = offersResult.data?.offers ?? [];
  const next = upcoming[0];
  const actionable = [...upcoming, ...past].filter((a) => a.actions.length > 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Your account" />

      <section>
        <SectionLabel>Next appointment</SectionLabel>
        {next ? (
          <AppointmentCard appointment={next} featured />
        ) : (
          <AccountEmpty
            title="Nothing booked yet"
            body="Pick a treatment and a time that suits you."
            action={{ label: "Book an appointment", href: "/account/book" }}
          />
        )}
      </section>

      {actionable.length > 0 && (
        <section>
          <SectionLabel>Needs you</SectionLabel>
          <div className="space-y-3">
            {actionable.slice(0, 3).map((appointment) => (
              <AppointmentCard key={appointment.id} appointment={appointment} />
            ))}
          </div>
        </section>
      )}

      <section className="flex flex-wrap gap-2">
        <SecondaryButton href="/account/book">Book again</SecondaryButton>
        <SecondaryButton href="/account/appointments">All appointments</SecondaryButton>
      </section>

      {offers.length > 0 && (
        <section>
          <SectionLabel>Your offers</SectionLabel>
          <div className="space-y-2">
            {offers.slice(0, 2).map((offer) => (
              <div
                key={offer.id}
                className="rounded-2xl border border-lumiere-ivory bg-white px-4 py-3"
              >
                <div className="text-sm font-medium text-lumiere-navy">{offer.name}</div>
                <div className="text-xs text-lumiere-muted mt-0.5">{offer.detail}</div>
              </div>
            ))}
          </div>
          {offers.length > 2 && (
            <Link
              href="/account/offers"
              className="text-xs text-lumiere-navy underline mt-2 inline-block"
            >
              See all {offers.length}
            </Link>
          )}
        </section>
      )}

      {past.length > 0 && (
        <section>
          <SectionLabel>Recently</SectionLabel>
          <div className="space-y-3">
            {past.slice(0, 2).map((appointment) => (
              <AppointmentCard key={appointment.id} appointment={appointment} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
