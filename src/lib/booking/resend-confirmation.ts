import { sendBookingConfirmationEmail } from "@/lib/booking/confirmation-email";
import { normalizeEmail } from "@/lib/agent/booking-guards";
import {
  getCalendarBookingDetails,
  getEventsByRange,
  updateCalendarBookingEmail,
} from "@/lib/integrations/google-calendar";
import { upsertClient, lookupClient } from "@/lib/integrations/airtable";
import { phonesMatchAny } from "@/lib/phone";

function todayChicago(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
}

/** Next future calendar event for this phone/contact, if any. */
export async function findUpcomingAppointmentEventId(contact: string): Promise<string | null> {
  const from = todayChicago();
  const toDate = new Date();
  toDate.setDate(toDate.getDate() + 120);
  const to = toDate.toISOString().slice(0, 10);
  const now = Date.now();

  const events = await getEventsByRange(from, to);
  const upcoming = events
    .filter((e) => new Date(e.startTime).getTime() >= now)
    .filter((e) => phonesMatchAny(e.clientContact, contact))
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

  return upcoming[0]?.id ?? null;
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
