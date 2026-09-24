"use client";

import Link from "next/link";
import { CalendarDays, Gift } from "lucide-react";
import type { CustomerAppointment } from "@/lib/account/visible";
import { useAccountData } from "@/lib/account/use-account-data";
import { useAccountIdentity } from "@/lib/account/use-account-context";
import { AppointmentCard } from "@/components/account/AppointmentCard";
import {
  AccountCard,
  PageHeader,
  AccountEmpty,
  AccountError,
  AccountLoading,
  SectionLabel,
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
  const identity = useAccountIdentity();
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
    <>
      <PageHeader
        eyebrow="Your account"
        title={identity?.firstName ? `Welcome back, ${identity.firstName}` : "Welcome back"}
        subtitle={
          next
            ? "Here's what's coming up, and anything waiting on you."
            : "Nothing on the calendar yet — pick a time whenever you're ready."
        }
      >
        <Link
          href="/account/book"
          className="rounded-full bg-white px-6 py-3 text-sm font-medium text-primary transition-all hover:shadow-[0_10px_40px_-10px_rgba(255,255,255,0.5)] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-panel"
        >
          Book an appointment
        </Link>
        <Link
          href="/account/appointments"
          className="rounded-full border border-white/30 px-6 py-3 text-sm font-medium text-panel-foreground transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-panel"
        >
          All appointments
        </Link>
      </PageHeader>

      <div className="space-y-10">
        <section>
          <SectionLabel>Next appointment</SectionLabel>
          {next ? (
            <AppointmentCard appointment={next} featured onChanged={reload} />
          ) : (
            <AccountEmpty
              icon={CalendarDays}
              title="Nothing booked yet"
              body="Pick a treatment and a time that suits you."
              action={{ label: "Book an appointment", href: "/account/book" }}
            />
          )}
        </section>

        {actionable.length > 0 && (
          <section>
            <SectionLabel>Needs you</SectionLabel>
            <div className="flex flex-wrap gap-4">
              {actionable.slice(0, 3).map((appointment) => (
                <AppointmentCard
                  key={appointment.id}
                  appointment={appointment}
                  onChanged={reload}
                />
              ))}
            </div>
          </section>
        )}

        {offers.length > 0 && (
          <section>
            <SectionLabel>Your offers</SectionLabel>
            <div className="flex flex-wrap gap-4">
              {offers.slice(0, 2).map((offer) => (
                <Link
                  key={offer.id}
                  href="/account/offers"
                  className="flex min-w-[16rem] flex-[1_1_20rem]"
                >
                  <AccountCard
                    interactive
                    className="flex h-full w-full items-start gap-3 bg-primary/[0.07] px-5 py-4"
                  >
                    <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                      <Gift className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground">{offer.name}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">{offer.detail}</div>
                    </div>
                  </AccountCard>
                </Link>
              ))}
            </div>
            {offers.length > 2 && (
              <Link
                href="/account/offers"
                className="mt-3 inline-block text-xs text-primary hover:underline"
              >
                See all {offers.length}
              </Link>
            )}
          </section>
        )}

        {past.length > 0 && (
          <section>
            <SectionLabel>Recently</SectionLabel>
            <div className="flex flex-wrap gap-4">
              {past.slice(0, 2).map((appointment) => (
                <AppointmentCard
                  key={appointment.id}
                  appointment={appointment}
                  onChanged={reload}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
