import { NextRequest, NextResponse } from "next/server";
import { requireCustomer } from "@/lib/account/auth";
import { getCustomerAppointments } from "@/lib/account/data";
import { checkAvailability } from "@/lib/services/booking-service";
import { getClinicConfig } from "@/lib/clinic-config";
import { dateInZone } from "@/lib/booking/dates";
import {
  cancelCalendarEvent,
  readCalendarEvent,
  rescheduleCalendarEvent,
} from "@/lib/booking/manage-event";
import { logEvent } from "@/lib/integrations/activity-log";

export const dynamic = "force-dynamic";

/**
 * A client cancelling or moving their OWN upcoming appointment.
 *
 * The id in the URL is never trusted: it must be one of the appointments the session's own
 * customer record resolves to (the same list the portal shows), so a client cannot touch anyone
 * else's booking by guessing an id. Past appointments are locked by the shared implementation, the
 * same as for staff. Everything after that — the calendar change, the client email, freeing the
 * slot for the waitlist — is the exact code the staff calendar runs (see manage-event.ts).
 */
async function ownAppointment(id: string) {
  const check = await requireCustomer();
  if (!check.ok) return { response: check.response } as const;
  const { upcoming } = await getCustomerAppointments(check.customer);
  const appointment = upcoming.find((a) => a.id === id);
  if (!appointment) {
    return {
      response: NextResponse.json({ error: "We couldn't find that appointment." }, { status: 404 }),
    } as const;
  }
  return { customer: check.customer, appointment } as const;
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const own = await ownAppointment(id);
  if ("response" in own) return own.response;

  const result = await cancelCalendarEvent(id);
  if (result.status === 200) {
    await logEvent(
      "cancellation",
      own.customer.name,
      `Cancelled ${own.appointment.treatment} from the customer portal`,
      { clientId: own.customer.id, platform: "portal" },
    ).catch(() => undefined);
  }
  return NextResponse.json(result.body, { status: result.status });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const own = await ownAppointment(id);
  if ("response" in own) return own.response;

  const body = await req.json().catch(() => ({}));
  const startTime = typeof body.startTime === "string" ? body.startTime : "";
  const endTime = typeof body.endTime === "string" ? body.endTime : "";
  if (!startTime || !endTime) {
    return NextResponse.json({ error: "Please pick a new time." }, { status: 400 });
  }

  // A client may only move to a time that is genuinely free for this treatment and practitioner —
  // the same availability check a new booking uses. (Staff can override; clients cannot.)
  try {
    const event = await readCalendarEvent(id);
    const { timezone } = await getClinicConfig();
    const availability = await checkAvailability({
      date: dateInZone(new Date(startTime), timezone),
      treatment: event.treatment || own.appointment.treatment,
      ...(event.practitioner ? { practitionerName: event.practitioner } : {}),
    });
    const wanted = new Date(startTime).getTime();
    if (!availability.slots.some((s) => new Date(s.startTime).getTime() === wanted)) {
      return NextResponse.json(
        { error: "That time is no longer available — please pick another." },
        { status: 409 },
      );
    }
  } catch (err) {
    console.error("PATCH /api/account/appointments availability check failed:", err);
    return NextResponse.json({ error: "We couldn't check that time." }, { status: 500 });
  }

  const result = await rescheduleCalendarEvent({
    eventId: id,
    newStartTime: startTime,
    newEndTime: endTime,
  });
  if (result.status === 200) {
    await logEvent(
      "reschedule",
      own.customer.name,
      `Rescheduled ${own.appointment.treatment} from the customer portal`,
      { clientId: own.customer.id, platform: "portal" },
    ).catch(() => undefined);
  }
  return NextResponse.json(result.body, { status: result.status });
}
