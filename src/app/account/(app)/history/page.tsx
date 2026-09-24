"use client";

import { useState } from "react";
import { Clock, Sparkles } from "lucide-react";
import type { CustomerAppointment } from "@/lib/account/visible";
import { useAccountData } from "@/lib/account/use-account-data";
import { AppointmentCard } from "@/components/account/AppointmentCard";
import { PersonalNotes } from "@/components/account/PersonalNotes";
import {
  PageHeader,
  AccountCard,
  AccountEmpty,
  AccountError,
  AccountLoading,
  SectionLabel,
  SecondaryButton,
} from "@/components/account/AccountUI";

// Keeps a long-standing client's lists from turning into one big unbroken scroll — matches the
// "Show more" pattern used on the Appointments page.
const PAGE_SIZE = 6;

interface PractitionerDetails {
  id: string;
  role: string | null;
  specialty: string | null;
  bio: string | null;
}

interface History {
  treatments: { name: string; visitCount: number; lastDate: string | null }[];
  practitioners: {
    name: string;
    visitCount: number;
    lastDate: string | null;
    details: PractitionerDetails | null;
  }[];
  totalVisits: number;
  firstVisit: string | null;
}

interface AppointmentsResponse {
  upcoming: CustomerAppointment[];
  past: CustomerAppointment[];
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/**
 * Everything the client has done with the clinic, in one place: the numbers, every past visit with
 * the notes on it, each treatment and each practitioner they've seen (with who that person is), and
 * a private notebook of their own.
 */
export default function AccountHistoryPage() {
  const { data: history, loading, error, reload } = useAccountData<History>("/api/account/history");
  const visits = useAccountData<AppointmentsResponse>("/api/account/appointments");
  const [visitsVisible, setVisitsVisible] = useState(PAGE_SIZE);
  const [treatmentsVisible, setTreatmentsVisible] = useState(PAGE_SIZE);
  const [practitionersVisible, setPractitionersVisible] = useState(PAGE_SIZE);

  if (loading) return <AccountLoading rows={2} />;
  if (error) return <AccountError message={error} onRetry={reload} />;

  const pastVisits = visits.data?.past ?? [];
  const hasHistory = !!history && history.treatments.length > 0;

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="History & notes"
        title="Your history"
        subtitle={
          hasHistory && history.firstVisit
            ? `${history.totalVisits} visit${history.totalVisits === 1 ? "" : "s"} · with us since ${fmtDate(history.firstVisit)}`
            : "Your visits, the people you've seen and your own notes."
        }
      />

      {!hasHistory ? (
        <AccountEmpty
          icon={Clock}
          title="Nothing here yet"
          body="Once you've visited us, your treatments and practitioners will be listed here."
          action={{ label: "Book an appointment", href: "/account/book" }}
        />
      ) : (
        <>
          <div className="flex flex-wrap gap-3">
            {[
              {
                label: history.totalVisits === 1 ? "Visit" : "Visits",
                value: history.totalVisits,
              },
              { label: "Treatments", value: history.treatments.length },
              { label: "Practitioners", value: history.practitioners.length },
            ].map((stat) => (
              <AccountCard
                key={stat.label}
                className="min-w-[6rem] flex-[1_1_6rem] bg-primary/[0.07] px-2 py-5 text-center ring-1 ring-primary/20 sm:px-4 sm:py-6"
              >
                <div className="font-serif text-4xl font-medium tracking-[-0.02em] text-foreground sm:text-5xl">
                  {stat.value}
                </div>
                <div className="mt-1 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                  {stat.label}
                </div>
              </AccountCard>
            ))}
          </div>

          <section>
            <SectionLabel>Past visits</SectionLabel>
            {visits.loading ? (
              <AccountLoading rows={2} />
            ) : visits.error ? (
              <AccountError message={visits.error} onRetry={visits.reload} />
            ) : pastVisits.length === 0 ? (
              <p className="px-1 text-sm text-muted-foreground">No past visits yet.</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-4">
                  {pastVisits.slice(0, visitsVisible).map((appointment) => (
                    <AppointmentCard key={appointment.id} appointment={appointment} />
                  ))}
                </div>
                {pastVisits.length > visitsVisible && (
                  <div className="mt-4 flex justify-center">
                    <SecondaryButton onClick={() => setVisitsVisible((v) => v + PAGE_SIZE)}>
                      Show more
                    </SecondaryButton>
                  </div>
                )}
              </>
            )}
          </section>

          <section>
            <SectionLabel>Treatments</SectionLabel>
            <div className="flex flex-wrap gap-x-4 gap-y-5">
              {history.treatments.slice(0, treatmentsVisible).map((t) => {
                return (
                  <div
                    key={t.name}
                    className="flex min-w-[10rem] flex-[1_1_12rem] sm:max-w-[calc(33.333%-0.7rem)]"
                  >
                    <div
                      className="door-card"
                      style={
                        {
                          "--door-glow": "color-mix(in oklch, var(--color-primary) 40%, white)",
                          "--door-bar": "var(--color-primary)",
                        } as React.CSSProperties
                      }
                    >
                      <span className="door-pop">
                        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/15 text-primary shadow-sm ring-4 ring-white">
                          <Sparkles className="h-7 w-7" />
                        </span>
                      </span>
                      <span className="door-content">
                        <span className="font-serif text-lg font-medium leading-tight tracking-[-0.01em] text-foreground">
                          {t.name}
                        </span>
                        <span className="door-desc">
                          <span className="block text-sm text-foreground/70">
                            {t.visitCount} time{t.visitCount === 1 ? "" : "s"}
                          </span>
                          <span className="mt-1 block text-[11px] uppercase tracking-[0.14em] text-foreground/60">
                            Last on {fmtDate(t.lastDate)}
                          </span>
                        </span>
                      </span>
                      <span aria-hidden className="door-bar" />
                    </div>
                  </div>
                );
              })}
            </div>
            {history.treatments.length > treatmentsVisible && (
              <div className="mt-4 flex justify-center">
                <SecondaryButton onClick={() => setTreatmentsVisible((v) => v + PAGE_SIZE)}>
                  Show more
                </SecondaryButton>
              </div>
            )}
          </section>

          {history.practitioners.length > 0 && (
            <section>
              <SectionLabel>Who you&apos;ve seen</SectionLabel>
              <div className="flex flex-wrap gap-4">
                {history.practitioners.slice(0, practitionersVisible).map((p) => {
                  const specialties = (p.details?.specialty ?? "")
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean)
                    .slice(0, 4);
                  return (
                    <AccountCard
                      key={p.name}
                      className="flex min-w-[16rem] flex-[1_1_20rem] flex-col overflow-hidden p-0 ring-1 ring-primary/20"
                    >
                      <div className="flex items-center gap-4 bg-primary/[0.07] px-5 py-4">
                        <span className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-white font-serif text-xl text-primary shadow-sm">
                          {p.name.replace(/^Dr\.?\s*/i, "")[0]?.toUpperCase() ?? "?"}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-serif text-lg font-medium text-foreground">
                            {p.name}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {p.details?.role ? `${p.details.role} · ` : ""}
                            {p.visitCount} visit{p.visitCount === 1 ? "" : "s"} · last{" "}
                            {fmtDate(p.lastDate)}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-1 flex-col gap-3 p-5">
                        {p.details?.bio && (
                          <p className="line-clamp-4 text-sm leading-relaxed text-muted-foreground">
                            {p.details.bio.trim()}
                          </p>
                        )}
                        {specialties.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {specialties.map((s) => (
                              <span
                                key={s}
                                className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] uppercase tracking-[0.1em] text-muted-foreground"
                              >
                                {s}
                              </span>
                            ))}
                          </div>
                        )}
                        {p.details && (
                          <a
                            href={`/team/${encodeURIComponent(p.details.id)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-auto inline-block pt-1 text-xs font-medium text-primary hover:underline"
                          >
                            Full profile →
                          </a>
                        )}
                      </div>
                    </AccountCard>
                  );
                })}
              </div>
              {history.practitioners.length > practitionersVisible && (
                <div className="mt-4 flex justify-center">
                  <SecondaryButton onClick={() => setPractitionersVisible((v) => v + PAGE_SIZE)}>
                    Show more
                  </SecondaryButton>
                </div>
              )}
            </section>
          )}
        </>
      )}

      <section>
        <SectionLabel>My notes</SectionLabel>
        <PersonalNotes />
      </section>
    </div>
  );
}
