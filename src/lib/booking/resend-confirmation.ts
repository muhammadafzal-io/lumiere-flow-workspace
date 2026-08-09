import { sendBookingConfirmationEmail } from "@/lib/booking/confirmation-email";
import { normalizeEmail } from "@/lib/email";
import {
  findUpcomingEventForContact,
  findUpcomingEventInList,
} from "@/lib/booking/upcoming-event-match";
import {
  getCalendarBookingDetails,
  getEventsByRange,
  updateCalendarBookingEmail,
} from "@/lib/integrations/google-calendar";
import { upsertClient, lookupClient } from "@/lib/integrations/airtable";
import type { CalendarEvent } from "@/types";

import { logFlowStep } from "@/lib/voice/flow-context";
import { getClinicConfig } from "@/lib/clinic-config";

export {
  findUpcomingEventByClientName,
  findUpcomingEventForContact,
  findUpcomingEventInList,
} from "@/lib/booking/upcoming-event-match";

const UPCOMING_LOOKAHEAD_DAYS = 120;
const PAST_LOOKBACK_DAYS = 30;

async function todayLocal(): Promise<string> {
  const { timezone } = await getClinicConfig();
  return new Date().toLocaleDateString("en-CA", { timeZone: timezone });
}

async function upcomingRange(): Promise<{ from: string; to: string }> {
  const from = await todayLocal();
  const toDate = new Date();
  toDate.setDate(toDate.getDate() + UPCOMING_LOOKAHEAD_DAYS);
  return { from, to: toDate.toISOString().slice(0, 10) };
}

async function pastRange(): Promise<{ from: string; to: string }> {
  const to = await todayLocal();
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - PAST_LOOKBACK_DAYS);
  return { from: fromDate.toISOString().slice(0, 10), to };
}

/** Future calendar events (single API fetch, cached via getEventsByRange). */
export async function loadUpcomingCalendarEvents(): Promise<CalendarEvent[]> {
  logFlowStep("fetch:loadUpcomingCalendarEvents:start");
  const { from, to } = await upcomingRange();
  const events = await getEventsByRange(from, to);
  const now = Date.now();
  const upcoming = events
    .filter((e) => new Date(e.startTime).getTime() >= now)
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  logFlowStep("fetch:loadUpcomingCalendarEvents:end", {
    from,
    to,
    total: events.length,
    upcoming: upcoming.length,
  });
  return upcoming;
}

/**
 * Recently-ended calendar events (last PAST_LOOKBACK_DAYS days), most recent first. Used only to
 * give an accurate "that appointment already happened" message when no upcoming appointment
 * matches — never to allow acting on the appointment itself.
 */
export async function loadRecentPastCalendarEvents(): Promise<CalendarEvent[]> {
  logFlowStep("fetch:loadRecentPastCalendarEvents:start");
  const { from, to } = await pastRange();
  const events = await getEventsByRange(from, to);
  const now = Date.now();
  const past = events
    .filter((e) => new Date(e.endTime).getTime() < now)
    .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
  logFlowStep("fetch:loadRecentPastCalendarEvents:end", {
    from,
    to,
    total: events.length,
    past: past.length,
  });
  return past;
}

/** Match any phone variant against one pre-loaded event list (avoids N calendar API calls). */
export async function findUpcomingAppointmentEventForPhones(
  ...phones: string[]
): Promise<CalendarEvent | null> {
  const events = await loadUpcomingCalendarEvents();
  return findUpcomingEventInList(events, ...phones) ?? null;
}

/** Next future calendar event for this phone/contact, if any. */
export async function findUpcomingAppointmentEventId(contact: string): Promise<string | null> {
  const events = await loadUpcomingCalendarEvents();
  const match = findUpcomingEventForContact(events, contact);
  return match?.id ?? null;
}

export async function resendBookingConfirmation(opts: { eventId: string; to: string }): Promise<{
  confirmation_email_sent: true;
  confirmation_sent_to: string;
  event_id: string;
}> {
  const to = normalizeEmail(opts.to);
  if (!to) {
    throw new Error("A valid client_email is required to resend the booking confirmation.");
  }

  const booking = await getCalendarBookingDetails(opts.eventId);
  await updateCalendarBookingEmail(opts.eventId, to);

  if (booking.clientContact) {
    const existing = await lookupClient({ phone: booking.clientContact }).catch(() => null);
    await upsertClient({
      name: booking.clientName,
      phone: booking.clientContact,
      email: to,
    }).catch(() => undefined);
    await sendBookingConfirmationEmail({
      to,
      clientName: booking.clientName,
      treatment: booking.treatment,
      startTime: booking.startTime,
      practitionerName: booking.practitionerName || "Your practitioner",
      notes: booking.notes || undefined,
      clientId: existing?.id,
      phone: booking.clientContact,
      eventId: opts.eventId,
    });
  } else {
    await sendBookingConfirmationEmail({
      to,
      clientName: booking.clientName,
      treatment: booking.treatment,
      startTime: booking.startTime,
      practitionerName: booking.practitionerName || "Your practitioner",
      notes: booking.notes || undefined,
      eventId: opts.eventId,
    });
  }

  return {
    confirmation_email_sent: true,
    confirmation_sent_to: to,
    event_id: opts.eventId,
  };
}
