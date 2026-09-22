"use client";

import { ArrowUpRight } from "lucide-react";
import type { CustomerAppointment } from "@/lib/account/visible";
import { AccountCard, StatusBadge } from "@/components/account/AccountUI";

export function formatWhen(iso: string, opts: Intl.DateTimeFormatOptions = {}): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    ...opts,
  });
}

/** One appointment, at whatever prominence the page needs. Actions come from the API, so the card
 * never decides what's outstanding — it only shows it. */
export function AppointmentCard({
  appointment,
  featured = false,
}: {
  appointment: CustomerAppointment;
  featured?: boolean;
}) {
  return (
    <AccountCard className={featured ? "p-5" : "p-4"}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div
            className={`font-semibold text-lumiere-navy break-words ${featured ? "text-lg" : "text-sm"}`}
          >
            {appointment.treatment}
          </div>
          <div className={`text-lumiere-muted mt-0.5 ${featured ? "text-sm" : "text-xs"}`}>
            {formatWhen(appointment.startTime)}
          </div>
          <div className={`text-lumiere-muted mt-0.5 ${featured ? "text-sm" : "text-xs"}`}>
            with {appointment.practitioner || "our team"}
            {appointment.room ? ` · ${appointment.room}` : ""}
          </div>
        </div>
        <StatusBadge status={appointment.status} />
      </div>

      {appointment.notes && (
        <div className="mt-3 pt-3 border-t border-lumiere-ivory">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-lumiere-muted/80">
            Notes
          </div>
          <p className="mt-1 text-xs text-lumiere-muted whitespace-pre-wrap break-words">
            {appointment.notes}
          </p>
        </div>
      )}

      {appointment.actions.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {appointment.actions.map((action) => (
            <a
              key={`${action.kind}-${action.url}`}
              href={action.url}
              className="flex items-center justify-between gap-2 rounded-lg bg-lumiere-blush px-3 py-2 text-sm text-lumiere-navy hover:bg-lumiere-rose/25 transition-colors"
            >
              {action.label}
              <ArrowUpRight className="h-3.5 w-3.5 flex-shrink-0" />
            </a>
          ))}
        </div>
      )}
    </AccountCard>
  );
}
