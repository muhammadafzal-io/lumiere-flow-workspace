"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Loader2 } from "lucide-react";
import {
  PageHeader,
  AccountCard,
  AccountEmpty,
  AccountError,
  AccountLoading,
  PrimaryButton,
  SecondaryButton,
  SectionLabel,
} from "@/components/account/AccountUI";

interface Service {
  id: string;
  name: string;
  durationMinutes: number;
  price: number | null;
  requiresConsultation: boolean;
}

interface Slot {
  startTime: string;
  endTime: string;
  practitioner: string | null;
}

/** The next 14 days as pickable dates — the engine still decides which of them have any slots. */
function nextDays(count: number): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    out.push({
      value: d.toLocaleDateString("en-CA"),
      label: d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }),
    });
  }
  return out;
}

/**
 * Booking, one decision per screen: treatment → day → time → confirm.
 *
 * Every rule stays in the engine: the slots shown come from the same availability check the chat
 * agent uses, and the booking goes through the same endpoint, so clinic hours, practitioner
 * qualifications, rooms, equipment, consultation requirements and notice windows all behave
 * identically to a chat booking.
 */
export default function AccountBookPage() {
  const router = useRouter();
  const [services, setServices] = useState<Service[]>([]);
  const [loadingServices, setLoadingServices] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [service, setService] = useState<Service | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [booking, setBooking] = useState(false);
  const [booked, setBooked] = useState<{
    treatment: string;
    startTime: string;
    requiresApproval: boolean;
  } | null>(null);

  useEffect(() => {
    fetch("/api/account/services")
      .then((r) => r.json())
      .then((json) => setServices(json.services ?? []))
      .catch(() => setError("We couldn't load our treatments."))
      .finally(() => setLoadingServices(false));
  }, []);

  const loadSlots = useCallback(async (chosen: Service, day: string) => {
    setLoadingSlots(true);
    setSlots(null);
    setSlot(null);
    try {
      const res = await fetch(
        `/api/account/slots?date=${day}&treatment=${encodeURIComponent(chosen.name)}`,
      );
      const json = await res.json();
      setSlots(json.slots ?? []);
    } catch {
      setSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  }, []);

  const confirm = async () => {
    if (!service || !slot) return;
    setBooking(true);
    setError(null);
    try {
      const res = await fetch("/api/account/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          treatment: service.name,
          startTime: slot.startTime,
          endTime: slot.endTime,
          practitionerName: slot.practitioner ?? undefined,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "We couldn't book that time.");
      setBooked({
        treatment: json.appointment.treatment,
        startTime: json.appointment.startTime,
        requiresApproval: json.appointment.requiresApproval,
      });
    } catch (err) {
      // Usually "that slot just went" — send them back to a fresh list rather than a dead end.
      setError(err instanceof Error ? err.message : "We couldn't book that time.");
      if (service && date) void loadSlots(service, date);
    } finally {
      setBooking(false);
    }
  };

  if (booked) {
    return (
      <div>
        <PageHeader title="You're booked" />
        <AccountCard className="p-6 text-center space-y-3">
          <div className="mx-auto h-11 w-11 rounded-full bg-success/10 flex items-center justify-center">
            <Check className="h-5 w-5 text-success" />
          </div>
          <div>
            <div className="font-semibold text-lumiere-navy">{booked.treatment}</div>
            <div className="text-sm text-lumiere-muted mt-0.5">
              {new Date(booked.startTime).toLocaleString(undefined, {
                weekday: "long",
                month: "long",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </div>
          </div>
          <p className="text-sm text-lumiere-muted">
            {booked.requiresApproval
              ? "Our head practitioner will review this booking, and we'll be in touch. Check your email for anything we need from you beforehand."
              : "Check your email for your confirmation, and anything we need from you beforehand."}
          </p>
          <div className="flex justify-center gap-2 pt-1">
            <PrimaryButton onClick={() => router.push("/account/appointments")}>
              My appointments
            </PrimaryButton>
          </div>
        </AccountCard>
      </div>
    );
  }

  if (loadingServices) return <AccountLoading rows={3} />;
  if (services.length === 0) {
    return (
      <div>
        <PageHeader title="Book" />
        <AccountEmpty
          title="Nothing bookable online yet"
          body="Please contact the clinic and we'll find you a time."
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Book an appointment"
        subtitle={service ? `${service.name}${date ? ` · ${date}` : ""}` : "Choose a treatment"}
      />

      {error && (
        <div className="mb-4">
          <AccountError message={error} />
        </div>
      )}

      {!service && (
        <div className="space-y-2">
          {services.map((s) => (
            <button key={s.id} onClick={() => setService(s)} className="w-full text-left">
              <AccountCard className="px-4 py-3 flex items-center justify-between gap-3 hover:border-lumiere-rose transition-colors">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-lumiere-navy break-words">{s.name}</div>
                  <div className="text-xs text-lumiere-muted mt-0.5">
                    {s.durationMinutes} min
                    {s.price != null ? ` · $${s.price}` : ""}
                    {s.requiresConsultation ? " · consultation first" : ""}
                  </div>
                </div>
              </AccountCard>
            </button>
          ))}
        </div>
      )}

      {service && (
        <div className="space-y-5">
          <SecondaryButton
            onClick={() => {
              setService(null);
              setDate(null);
              setSlots(null);
              setSlot(null);
            }}
          >
            <ArrowLeft className="h-3.5 w-3.5 mr-1.5" /> Change treatment
          </SecondaryButton>

          <section>
            <SectionLabel>Pick a day</SectionLabel>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {nextDays(14).map((day) => (
                <button
                  key={day.value}
                  onClick={() => {
                    setDate(day.value);
                    void loadSlots(service, day.value);
                  }}
                  className={`rounded-lg border px-3 py-2 text-xs whitespace-nowrap transition-colors ${
                    date === day.value
                      ? "bg-lumiere-navy text-white border-lumiere-navy"
                      : "bg-white border-lumiere-ivory text-lumiere-navy"
                  }`}
                >
                  {day.label}
                </button>
              ))}
            </div>
          </section>

          {date && (
            <section>
              <SectionLabel>Pick a time</SectionLabel>
              {loadingSlots ? (
                <AccountLoading rows={1} />
              ) : slots && slots.length > 0 ? (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {slots.map((s) => (
                    <button
                      key={s.startTime}
                      onClick={() => setSlot(s)}
                      className={`rounded-lg border px-2 py-2.5 text-sm transition-colors ${
                        slot?.startTime === s.startTime
                          ? "bg-lumiere-navy text-white border-lumiere-navy"
                          : "bg-white border-lumiere-ivory text-lumiere-navy hover:border-lumiere-rose"
                      }`}
                    >
                      {new Date(s.startTime).toLocaleTimeString(undefined, {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </button>
                  ))}
                </div>
              ) : (
                <AccountCard className="px-4 py-6 text-center text-sm text-lumiere-muted">
                  No times left that day — try another.
                </AccountCard>
              )}
            </section>
          )}

          {slot && (
            <AccountCard className="p-4 space-y-3">
              <div className="text-sm text-lumiere-navy">
                <span className="font-semibold">{service.name}</span> on{" "}
                {new Date(slot.startTime).toLocaleString(undefined, {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
                {slot.practitioner ? ` with ${slot.practitioner}` : ""}
              </div>
              <PrimaryButton onClick={confirm} disabled={booking} className="w-full">
                {booking && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                Confirm booking
              </PrimaryButton>
            </AccountCard>
          )}
        </div>
      )}
    </div>
  );
}
