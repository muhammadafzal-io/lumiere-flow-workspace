import { google } from "googleapis";
import { lookupClient } from "@/lib/integrations/airtable";
import { sendRetentionEmail } from "@/lib/integrations/email";
import { logEvent } from "@/lib/integrations/activity-log";
import { invalidateEventsRangeCache, parseDesc } from "@/lib/integrations/google-calendar";
import { getWidgetUrl, widgetLinkLine } from "@/lib/client-channels";
import { getClinicConfig } from "@/lib/clinic-config";
import {
  getClinicBusinessHours,
  describeClinicHours,
  hoursForWeekday,
  weekdayKeyForDateStr,
  fractionalHourToClock,
} from "@/lib/booking/clinic-hours";
import { dateInZone } from "@/lib/booking/dates";
import { resolveServiceId } from "@/lib/booking/recipe";
import { getSupabase } from "@/lib/supabase";
import { offerSlotToWaitlist } from "@/lib/waitlist/matching";
import {
  isAppointmentPast,
  PAST_APPOINTMENT_ERROR_CODE,
  PAST_APPOINTMENT_LOCK_MESSAGE,
} from "@/lib/appointment-lock";

/**
 * Cancelling and rescheduling a calendar appointment — the one implementation behind both the
 * staff calendar routes and the customer portal, so a client cancelling or moving their own visit
 * does exactly what staff doing it does: the event is changed on the calendar, the client is
 * emailed, the freed slot is offered to the waitlist, and a past appointment is locked.
 *
 * Extracted verbatim from /api/calendar/cancel and /api/calendar/reschedule. Both functions return
 * `{ status, body }` — the exact HTTP status and JSON those routes always returned — so the routes
 * stay thin and their responses are unchanged. Authorization is the CALLER's job: staff permission
 * for the calendar routes, session + "is this the client's own appointment" for the portal.
 */

export interface ManageResult {
  status: number;
  body: Record<string, unknown>;
}

function getCalendarClient() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_JSON");

  let credentials: object;
  try {
    credentials = JSON.parse(raw);
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON");
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/calendar"],
  });
  return google.calendar({ version: "v3", auth });
}

function calendarId() {
  return process.env.GOOGLE_CALENDAR_ID ?? "primary";
}

/** Extract a field value from the GCal event description (e.g. "Contact: +1234") */
function parseField(description: string, field: string): string {
  const line = description.split("\n").find((l) => l.startsWith(`${field}:`));
  return line?.slice(field.length + 1).trim() ?? "";
}

function errorResult(
  err: unknown,
  fallback: { message: string; code: string },
  notFoundMessage: string,
  label: string,
): ManageResult {
  console.error(`[${label}] Error:`, err);

  const error = err as { code?: number; status?: number; message?: string };
  let statusCode = 500;
  let message = fallback.message;
  let code = fallback.code;

  if (error?.code === 404 || error?.status === 404) {
    statusCode = 404;
    message = notFoundMessage;
    code = "NOT_FOUND";
  } else if (error?.message?.includes("not found")) {
    statusCode = 404;
    message = notFoundMessage;
    code = "NOT_FOUND";
  } else if (error?.message) {
    message = error.message;
  }

  return {
    status: statusCode,
    body: {
      error: message,
      code,
      details: process.env.NODE_ENV === "development" ? error?.message : undefined,
    },
  };
}

export async function cancelCalendarEvent(eventId: string): Promise<ManageResult> {
  try {
    const calendar = getCalendarClient();
    const calId = calendarId();

    const getRes = await calendar.events.get({ calendarId: calId, eventId });
    const event = getRes.data;

    if (event.end?.dateTime && isAppointmentPast(event.end.dateTime)) {
      return {
        status: 409,
        body: { error: PAST_APPOINTMENT_LOCK_MESSAGE, code: PAST_APPOINTMENT_ERROR_CODE },
      };
    }

    await calendar.events.delete({ calendarId: calId, eventId });

    invalidateEventsRangeCache();

    (async () => {
      try {
        const { timezone } = await getClinicConfig();
        const description = event.description ?? "";
        const contact = parseField(description, "Contact");
        const clientName =
          parseField(description, "Client") || event.summary?.split(" — ")[1] || "Valued Client";
        const treatment =
          parseField(description, "Treatment") ||
          event.summary?.split(" — ")[0] ||
          "your appointment";
        const startTime = event.start?.dateTime;
        // Email may be in a dedicated "Email:" line or buried anywhere in description
        const emailInDesc =
          parseField(description, "Email") ||
          description.match(/Email:\s*([^\s\n]+@[^\s\n]+)/i)?.[1];

        const client = contact ? await lookupClient({ phone: contact }).catch(() => null) : null;
        const email = client?.email || emailInDesc;
        if (!email) return;

        const displayTime = startTime
          ? new Date(startTime).toLocaleString("en-US", {
              timeZone: timezone,
              weekday: "long",
              month: "long",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
              hour12: true,
              timeZoneName: "short",
            })
          : "your scheduled time";
        const businessHoursLabel = describeClinicHours(await getClinicBusinessHours());

        await sendRetentionEmail({
          to: email,
          subject: `Your ${treatment} appointment has been cancelled`,
          flowType: "cancellation",
          logMeta: {
            category: "cancellation",
            triggerType: "system",
            clientId: client?.id,
            clientName,
          },
          text: [
            `Hi ${clientName}, your appointment at Lumière has been cancelled.`,
            ``,
            `Treatment: ${treatment}`,
            `Original Date: ${displayTime}`,
            ``,
            `We'd love to rebook you at a time that works better. Reply to this email or visit us ${businessHoursLabel}.`,
            widgetLinkLine(),
            ``,
            `— The Lumière Team`,
          ].join("\n"),
          cta: {
            label: "Book a New Appointment",
            url: getWidgetUrl(),
          },
        });

        await logEvent(
          "cancellation",
          clientName,
          `Cancellation email sent to ${email} for ${treatment}`,
          {
            phone: contact,
            email,
          },
        );
      } catch (err) {
        console.error(`[cancel] cancellation email failed:`, err);
      }
    })();

    // Best-effort, independent of the cancellation email above — a failure here must never
    // affect the cancel response, which has already succeeded by this point.
    (async () => {
      try {
        if (!event.start?.dateTime || !event.end?.dateTime) return;
        const description = event.description ?? "";
        const parsed = parseDesc(description);
        const treatment =
          parseField(description, "Treatment") || event.summary?.split(" — ")[0] || "";
        if (!treatment) return;

        const sb = getSupabase();
        const serviceId = await resolveServiceId(sb, treatment).catch(() => null);

        await offerSlotToWaitlist({
          treatment,
          serviceId,
          startTime: event.start.dateTime,
          endTime: event.end.dateTime,
          practitionerName: parsed.practitioner,
          room: parsed.room,
          equipment: parsed.equipment,
          sourceEventId: eventId,
        });
      } catch (err) {
        console.error("[cancel] waitlist offer failed:", err);
      }
    })();

    return {
      status: 200,
      body: { ok: true, eventId, message: `Cancelled: ${event.summary}` },
    };
  } catch (err) {
    return errorResult(
      err,
      { message: "Failed to cancel appointment", code: "CANCEL_ERROR" },
      "Appointment not found (may have been deleted already)",
      "/api/calendar/cancel",
    );
  }
}

export async function rescheduleCalendarEvent(input: {
  eventId: string;
  newStartTime: string;
  newEndTime: string;
}): Promise<ManageResult> {
  const { eventId, newStartTime, newEndTime } = input;

  // Validated against the CLINIC's configured timezone and business-hours schedule, not the
  // server process's own local timezone — `Date.getDay()`/`getHours()` would silently use
  // whichever timezone Node happens to run in, which is not necessarily the clinic's.
  const { timezone, address } = await getClinicConfig();
  const schedule = await getClinicBusinessHours();
  const newStartDate = new Date(newStartTime);
  const localDateStr = dateInZone(newStartDate, timezone);
  const weekday = weekdayKeyForDateStr(localDateStr);
  const hoursToday = hoursForWeekday(schedule, weekday);

  if (!hoursToday) {
    return {
      status: 400,
      body: { error: "Cannot reschedule to this day — clinic is closed", code: "INVALID_DAY" },
    };
  }

  const hourPart =
    parseInt(
      new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        hour: "2-digit",
        hour12: false,
      }).format(newStartDate),
      10,
    ) % 24;
  const minutePart = parseInt(
    new Intl.DateTimeFormat("en-US", { timeZone: timezone, minute: "2-digit" }).format(
      newStartDate,
    ),
    10,
  );
  const fractionalHour = hourPart + minutePart / 60;

  if (fractionalHour < hoursToday.startHour || fractionalHour >= hoursToday.endHour) {
    return {
      status: 400,
      body: {
        error: `Can only reschedule between ${fractionalHourToClock(hoursToday.startHour)} and ${fractionalHourToClock(hoursToday.endHour)}`,
        code: "INVALID_TIME",
      },
    };
  }

  try {
    const calendar = getCalendarClient();
    const calId = calendarId();

    const getRes = await calendar.events.get({ calendarId: calId, eventId });
    const event = getRes.data;
    const oldStartTime = event.start?.dateTime;

    if (event.end?.dateTime && isAppointmentPast(event.end.dateTime)) {
      return {
        status: 409,
        body: { error: PAST_APPOINTMENT_LOCK_MESSAGE, code: PAST_APPOINTMENT_ERROR_CODE },
      };
    }

    const updatedEvent = await calendar.events.update({
      calendarId: calId,
      eventId,
      requestBody: {
        ...event,
        start: { dateTime: newStartTime, timeZone: timezone },
        end: { dateTime: newEndTime, timeZone: timezone },
      },
    });

    (async () => {
      try {
        const description = event.description ?? "";
        const contact = parseField(description, "Contact");
        const clientName =
          parseField(description, "Client") || event.summary?.split(" — ")[1] || "Valued Client";
        const treatment =
          parseField(description, "Treatment") ||
          event.summary?.split(" — ")[0] ||
          "your appointment";

        // Email may be in a dedicated "Email:" line or buried anywhere in description
        const emailInDesc =
          parseField(description, "Email") ||
          description.match(/Email:\s*([^\s\n]+@[^\s\n]+)/i)?.[1];
        const client = contact ? await lookupClient({ phone: contact }).catch(() => null) : null;
        const email = client?.email || emailInDesc;
        if (!email) return;

        const fmtTime = (iso: string) =>
          new Date(iso).toLocaleString("en-US", {
            timeZone: timezone,
            weekday: "long",
            month: "long",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
            timeZoneName: "short",
          });
        const businessHoursLabel = describeClinicHours(schedule);

        await sendRetentionEmail({
          to: email,
          subject: `Your ${treatment} appointment has been rescheduled`,
          flowType: "reschedule",
          logMeta: {
            category: "reschedule",
            triggerType: "system",
            clientId: client?.id,
            clientName,
          },
          text: [
            `Hi ${clientName}, your Lumière appointment has been rescheduled.`,
            ``,
            `Treatment: ${treatment}`,
            oldStartTime ? `Old Date: ${fmtTime(oldStartTime)}` : "",
            `New Date: ${fmtTime(newStartTime)}`,
            `Location: ${address}`,
            ``,
            `Need to make further changes? Reply to this email or contact us ${businessHoursLabel}.`,
            widgetLinkLine(),
            ``,
            `See you soon!`,
            `— The Lumière Team`,
          ]
            .filter(Boolean)
            .join("\n"),
          cta: {
            label: "View Location",
            url: `https://maps.google.com/?q=${encodeURIComponent(address)}`,
          },
        });

        await logEvent(
          "reschedule",
          clientName,
          `Reschedule email sent to ${email} for ${treatment}`,
          {
            phone: contact,
            email,
          },
        );
      } catch (err) {
        console.error(`[reschedule] reschedule email failed:`, err);
      }
    })();

    // Best-effort, independent of the reschedule email above — the OLD (room, practitioner,
    // equipment, time) combo this event vacated is now available, same as a cancellation freeing
    // one. Never allowed to affect the reschedule response, which has already succeeded.
    (async () => {
      try {
        const oldEndTime = event.end?.dateTime;
        if (!oldStartTime || !oldEndTime) return;
        const description = event.description ?? "";
        const parsed = parseDesc(description);
        const treatmentName =
          parseField(description, "Treatment") || event.summary?.split(" — ")[0] || "";
        if (!treatmentName) return;

        const sb = getSupabase();
        const serviceId = await resolveServiceId(sb, treatmentName).catch(() => null);

        await offerSlotToWaitlist({
          treatment: treatmentName,
          serviceId,
          startTime: oldStartTime,
          endTime: oldEndTime,
          practitionerName: parsed.practitioner,
          room: parsed.room,
          equipment: parsed.equipment,
          sourceEventId: eventId,
        });
      } catch (err) {
        console.error("[reschedule] waitlist offer failed:", err);
      }
    })();

    return {
      status: 200,
      body: {
        ok: true,
        eventId,
        oldStartTime: event.start?.dateTime,
        newStartTime: updatedEvent.data.start?.dateTime,
        message: `Rescheduled: ${updatedEvent.data.summary}`,
      },
    };
  } catch (err) {
    return errorResult(
      err,
      { message: "Failed to reschedule appointment", code: "RESCHEDULE_ERROR" },
      "Appointment not found (may have been deleted)",
      "/api/calendar/reschedule",
    );
  }
}

/** The pieces of a calendar event the portal needs to check ownership and re-validate a new slot. */
export async function readCalendarEvent(eventId: string) {
  const calendar = getCalendarClient();
  const { data } = await calendar.events.get({ calendarId: calendarId(), eventId });
  const description = data.description ?? "";
  const parsed = parseDesc(description);
  return {
    start: data.start?.dateTime ?? null,
    end: data.end?.dateTime ?? null,
    treatment: parseField(description, "Treatment") || data.summary?.split(" — ")[0] || "",
    practitioner: parsed.practitioner,
  };
}
