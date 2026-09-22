"use client";

import { useState } from "react";
import type { CustomerAppointment } from "@/lib/account/visible";
import { useAccountData } from "@/lib/account/use-account-data";
import { AppointmentCard } from "@/components/account/AppointmentCard";
import {
  PageHeader,
  AccountEmpty,
  AccountError,
  AccountLoading,
} from "@/components/account/AccountUI";

interface AppointmentsResponse {
  upcoming: CustomerAppointment[];
  past: CustomerAppointment[];
}

export default function AccountAppointmentsPage() {
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const { data, loading, error, reload } = useAccountData<AppointmentsResponse>(
    "/api/account/appointments",
  );

  const list = data ? (tab === "upcoming" ? data.upcoming : data.past) : [];

  return (
    <div>
      <PageHeader title="Appointments" />

      <div className="flex gap-1.5 mb-4">
        {(["upcoming", "past"] as const).map((key) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`rounded-lg px-3 py-1.5 text-sm capitalize transition-colors ${
              tab === key
                ? "bg-lumiere-navy text-white"
                : "bg-white border border-lumiere-ivory text-lumiere-navy"
            }`}
          >
            {key}
          </button>
        ))}
      </div>

      {loading ? (
        <AccountLoading rows={3} />
      ) : error ? (
        <AccountError message={error} onRetry={reload} />
      ) : list.length === 0 ? (
        <AccountEmpty
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
        <div className="space-y-3">
          {list.map((appointment) => (
            <AppointmentCard key={appointment.id} appointment={appointment} />
          ))}
        </div>
      )}
    </div>
  );
}
