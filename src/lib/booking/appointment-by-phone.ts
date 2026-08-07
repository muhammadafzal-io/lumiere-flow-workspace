import { logFlowStep } from "@/lib/voice/flow-context";
import { normalizeEmail } from "@/lib/email";
import { lookupClientByPhone } from "@/lib/integrations/airtable";
import { extractPhoneForLookup, phoneSearchVariants } from "@/lib/phone";
import {
  findUpcomingEventByClientName,
  findUpcomingEventInList,
} from "@/lib/booking/upcoming-event-match";
import {
  loadUpcomingCalendarEvents,
  loadRecentPastCalendarEvents,
} from "@/lib/booking/resend-confirmation";

export type UpcomingAppointment = {
  eventId: string;
  clientName: string;
  treatment: string;
  startTime: string;
  endTime: string;
  clientPhone: string;
  clientEmail?: string;
  practitionerName?: string;
  room?: string;
};

/** Next upcoming calendar appointment for a phone number, with CRM email when on file. */
export async function findUpcomingAppointmentByPhone(
  phone: string,
): Promise<UpcomingAppointment | null> {
  const normalized = extractPhoneForLookup(phone);
  if (!normalized) {
    logFlowStep("fetch:appointment invalid phone", { phone });
    return null;
  }

  logFlowStep("fetch:appointment by phone", { phone: normalized });

  const events = await loadUpcomingCalendarEvents();
  logFlowStep("fetch:calendar events loaded", { count: events.length });

  let matched = findUpcomingEventInList(events, phone, normalized);

  if (!matched) {
    logFlowStep("fetch:direct phone match miss — trying CRM", { phone: normalized });
    for (const variant of phoneSearchVariants(normalized, phone)) {
      const client = await lookupClientByPhone(variant).catch(() => null);
      if (!client) continue;

      logFlowStep("fetch:crm fallback client", {
        clientId: client.id,
        name: client.name,
        phone: client.phone,
      });

      if (client.phone) {
        matched = findUpcomingEventInList(events, client.phone, phone, normalized);
      }
      if (!matched && client.name) {
        matched = findUpcomingEventByClientName(events, client.name);
        if (matched) {
          logFlowStep("fetch:matched by client name", { name: client.name, eventId: matched.id });
        }
      }
      if (matched) break;
    }
  } else {
    logFlowStep("fetch:direct phone match", { eventId: matched.id });
  }

  if (!matched) {
    logFlowStep("fetch:appointment not found", { phone: normalized });
    return null;
  }

  let clientEmail = normalizeEmail(matched.clientEmail);
  for (const variant of phoneSearchVariants(normalized, matched.clientContact)) {
    const client = await lookupClientByPhone(variant).catch(() => null);
    if (client?.email) {
      clientEmail = normalizeEmail(client.email) ?? clientEmail;
      logFlowStep("fetch:email from CRM", { email: clientEmail });
      break;
    }
  }

  const appt: UpcomingAppointment = {
    eventId: matched.id,
    clientName: matched.clientName,
    treatment: matched.treatment,
    startTime: matched.startTime,
    endTime: matched.endTime,
    clientPhone: matched.clientContact || normalized,
    clientEmail,
    practitionerName: matched.practitioner || undefined,
    room: matched.room || undefined,
  };

  logFlowStep("fetch:appointment found", {
    event_id: appt.eventId,
    client_name: appt.clientName,
    treatment: appt.treatment,
    start_time: appt.startTime,
    end_time: appt.endTime,
    client_email: appt.clientEmail,
    practitioner_name: appt.practitionerName,
    room: appt.room,
  });

  return appt;
}

/**
 * Most recent already-ended appointment for a phone number, if any. Used only to give an
 * accurate "that appointment already happened" message when no upcoming appointment matches —
 * never to allow cancelling/rescheduling it.
 */
export async function findRecentPastAppointmentByPhone(
  phone: string,
): Promise<UpcomingAppointment | null> {
  const normalized = extractPhoneForLookup(phone);
  if (!normalized) return null;

  const events = await loadRecentPastCalendarEvents();
  let matched = findUpcomingEventInList(events, phone, normalized);

  if (!matched) {
    for (const variant of phoneSearchVariants(normalized, phone)) {
      const client = await lookupClientByPhone(variant).catch(() => null);
      if (!client) continue;

      if (client.phone) {
        matched = findUpcomingEventInList(events, client.phone, phone, normalized);
      }
      if (!matched && client.name) {
        matched = findUpcomingEventByClientName(events, client.name);
      }
      if (matched) break;
    }
  }

  if (!matched) return null;

  let clientEmail = normalizeEmail(matched.clientEmail);
  for (const variant of phoneSearchVariants(normalized, matched.clientContact)) {
    const client = await lookupClientByPhone(variant).catch(() => null);
    if (client?.email) {
      clientEmail = normalizeEmail(client.email) ?? clientEmail;
      break;
    }
  }

  return {
    eventId: matched.id,
    clientName: matched.clientName,
    treatment: matched.treatment,
    startTime: matched.startTime,
    endTime: matched.endTime,
    clientPhone: matched.clientContact || normalized,
    clientEmail,
    practitionerName: matched.practitioner || undefined,
    room: matched.room || undefined,
  };
}

/** Best email for cancel/reschedule notifications — CRM, calendar, or hint. */
export async function resolveAppointmentNotificationEmail(opts: {
  phone?: string;
  eventId?: string;
  hintEmail?: string;
  calendarEmail?: string;
}): Promise<string | undefined> {
  const hinted = normalizeEmail(opts.hintEmail);
  if (hinted) return hinted;

  const fromArg = normalizeEmail(opts.calendarEmail);
  if (fromArg) return fromArg;

  if (opts.eventId) {
    const { getCalendarBookingDetails } = await import("@/lib/integrations/google-calendar");
    const booking = await getCalendarBookingDetails(opts.eventId).catch(() => null);
    const fromEvent = normalizeEmail(booking?.clientEmail);
    if (fromEvent) return fromEvent;
  }

  if (opts.phone) {
    const normalized = extractPhoneForLookup(opts.phone);
    for (const variant of phoneSearchVariants(normalized, opts.phone)) {
      const byPhone = await lookupClientByPhone(variant).catch(() => null);
      const email = normalizeEmail(byPhone?.email);
      if (email) return email;

      const { lookupClient } = await import("@/lib/integrations/airtable");
      const byLookup = await lookupClient({ phone: variant }).catch(() => null);
      const email2 = normalizeEmail(byLookup?.email);
      if (email2) return email2;
    }
  }

  return undefined;
}
