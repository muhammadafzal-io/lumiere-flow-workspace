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

export {
  findUpcomingEventByClientName,
  findUpcomingEventForContact,
  findUpcomingEventInList,
} from "@/lib/booking/upcoming-event-match";

const UPCOMING_LOOKAHEAD_DAYS = 120;

function todayChicago(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
}

function upcomingRange(): { from: string; to: string } {
  const from = todayChicago();
  const toDate = new Date();
  toDate.setDate(toDate.getDate() + UPCOMING_LOOKAHEAD_DAYS);
  return { from, to: toDate.toISOString().slice(0, 10) };
}

/** Future calendar events (single API fetch, cached via getEventsByRange). */
export async function loadUpcomingCalendarEvents(): Promise<CalendarEvent[]> {
  logFlowStep("fetch:loadUpcomingCalendarEvents:start");
  const { from, to } = upcomingRange();
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
    });
  } else {
    await sendBookingConfirmationEmail({
      to,
      clientName: booking.clientName,
      treatment: booking.treatment,
      startTime: booking.startTime,
      practitionerName: booking.practitionerName || "Your practitioner",
      notes: booking.notes || undefined,
    });
  }

  return {
    confirmation_email_sent: true,
    confirmation_sent_to: to,
    event_id: opts.eventId,
  };
}
