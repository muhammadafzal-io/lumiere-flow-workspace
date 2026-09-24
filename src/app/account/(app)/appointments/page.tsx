"use client";

import { useState } from "react";
import { CalendarDays } from "lucide-react";
import type { CustomerAppointment } from "@/lib/account/visible";
import { useAccountData } from "@/lib/account/use-account-data";
import { AppointmentCard } from "@/components/account/AppointmentCard";
import {
  PageHeader,
  AccountEmpty,
  AccountError,
  AccountLoading,
  SecondaryButton,
  Tabs,
} from "@/components/account/AccountUI";

interface AppointmentsResponse {
  upcoming: CustomerAppointment[];
  past: CustomerAppointment[];
}

// A visit history can run to dozens of rows for a long-standing client — load a first page and
// let them ask for more rather than dumping every visit into one unbroken scroll.
const PAGE_SIZE = 8;

export default function AccountAppointmentsPage() {
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [visible, setVisible] = useState(PAGE_SIZE);
  const { data, loading, error, reload } = useAccountData<AppointmentsResponse>(
    "/api/account/appointments",
  );

  const full = data ? (tab === "upcoming" ? data.upcoming : data.past) : [];
  const list = full.slice(0, visible);

  return (
    <div>
      <PageHeader
        eyebrow="Visits"
        title="Appointments"
        subtitle="What's coming up, and where you've been."
      />

      <div className="mb-4">
        <Tabs
          value={tab}
          onChange={(key) => {
            setTab(key);
            setVisible(PAGE_SIZE);
          }}
          options={[
            { value: "upcoming", label: "Upcoming" },
            { value: "past", label: "Past" },
          ]}
        />
      </div>

      {loading ? (
        <AccountLoading rows={3} />
      ) : error ? (
        <AccountError message={error} onRetry={reload} />
      ) : list.length === 0 ? (
        <AccountEmpty
          icon={CalendarDays}
          title={tab === "upcoming" ? "Nothing coming up" : "No past visits yet"}
          body={
            tab === "upcoming"
              ? "Book your next treatment whenever you're ready."
              : "Your visits will appear here after your first appointment."
          }
          action={
            tab === "upcoming" ? { label: "Book an appointment", href: "/account/book" } : undefined
          }
        />
      ) : (
        <>
          <div className="flex flex-wrap gap-4">
            {list.map((appointment) => (
              <AppointmentCard key={appointment.id} appointment={appointment} onChanged={reload} />
            ))}
          </div>
          {full.length > visible && (
            <div className="mt-4 flex justify-center">
              <SecondaryButton onClick={() => setVisible((v) => v + PAGE_SIZE)}>
                Show more
              </SecondaryButton>
            </div>
          )}
        </>
      )}
    </div>
  );
}
