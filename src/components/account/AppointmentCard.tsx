"use client";

import { ArrowUpRight, Clock, MapPin, StickyNote, UserRound } from "lucide-react";
import type { CustomerAppointment } from "@/lib/account/visible";
import { AccountCard, StatusBadge } from "@/components/account/AccountUI";
import { AppointmentActions } from "@/components/account/AppointmentActions";
import { cn } from "@/lib/utils";

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

/**
 * One appointment as a card: a tinted header carrying the date and status, then who, when and where,
 * any notes, and the actions. Each treatment keeps its own tint (derived from its name, so "Botox"
 * is the same colour everywhere), which makes a page of visits scannable at a glance. Cards sit in
 * a wrapping flex row (see the `flex-[1_1_20rem]` default) so they line up side by side on wide
 * screens and stack on phones. Actions come from the API, so the card never decides what's
 * outstanding — it only shows it.
 */
export function AppointmentCard({
  appointment,
  featured = false,
  onChanged,
  className,
}: {
  appointment: CustomerAppointment;
  featured?: boolean;
  /** Called after the client reschedules or cancels, so the page can refresh its list. */
  onChanged?: () => void;
  className?: string;
}) {
  const when = new Date(appointment.startTime);
  const valid = !Number.isNaN(when.getTime());

  return (
    <AccountCard
      className={cn(
        "flex flex-col overflow-hidden p-0 ring-1 ring-primary/20",
        "min-w-[16rem] flex-[1_1_20rem]",
        className,
      )}
    >
      <div
        className={cn(
          "flex items-start justify-between gap-3 bg-primary/[0.07] px-5 pb-4 pt-5 sm:px-6",
        )}
      >
        {valid && (
          <div
            aria-hidden
            className={cn(
              "flex flex-col items-center justify-center rounded-2xl bg-white text-primary shadow-sm",
              featured ? "h-[4.5rem] w-[4.5rem]" : "h-16 w-16",
            )}
          >
            <span className="text-[10px] uppercase tracking-[0.16em]">
              {when.toLocaleDateString(undefined, { month: "short" })}
            </span>
            <span className={cn("font-semibold leading-none", featured ? "text-3xl" : "text-2xl")}>
              {when.getDate()}
            </span>
          </div>
        )}
        <StatusBadge status={appointment.status} />
      </div>

      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <h3
          className={cn(
            "break-words font-serif font-medium leading-tight tracking-[-0.02em] text-foreground",
            featured ? "text-2xl" : "text-xl",
          )}
        >
          {appointment.treatment}
        </h3>

        <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
          <li className="flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 flex-shrink-0" />
            {formatWhen(appointment.startTime)}
          </li>
          <li className="flex items-center gap-2">
            <UserRound className="h-3.5 w-3.5 flex-shrink-0" />
            {appointment.practitioner || "Our team"}
          </li>
          {appointment.room && (
            <li className="flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
              {appointment.room}
            </li>
          )}
        </ul>

        {appointment.notes && (
          <div className="mt-4 rounded-xl bg-muted/60 p-3">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80">
              <StickyNote className="h-3 w-3" />
              Notes
            </div>
            <p className="mt-1 whitespace-pre-wrap break-words text-xs text-muted-foreground">
              {appointment.notes}
            </p>
          </div>
        )}

        {appointment.actions.length > 0 && (
          <div className="mt-4 space-y-1.5">
            {appointment.actions.map((action) => (
              <a
                key={`${action.kind}-${action.url}`}
                href={action.url}
                className="flex items-center justify-between gap-2 rounded-xl bg-primary/10 px-4 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-primary/15"
              >
                {action.label}
                <ArrowUpRight className="h-3.5 w-3.5 flex-shrink-0" />
              </a>
            ))}
          </div>
        )}

        <div className="mt-auto">
          <AppointmentActions appointment={appointment} onChanged={onChanged} />
        </div>
      </div>
    </AccountCard>
  );
}
