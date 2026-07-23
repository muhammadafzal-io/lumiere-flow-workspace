import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { lookupClient } from "@/lib/integrations/airtable";
import { sendRetentionEmail } from "@/lib/integrations/email";
import { logEvent } from "@/lib/integrations/activity-log";
import { widgetLinkLine } from "@/lib/client-channels";
import { getClinicConfig } from "@/lib/clinic-config";
import {
  getClinicBusinessHours,
  describeClinicHours,
  hoursForWeekday,
  weekdayKeyForDateStr,
  fractionalHourToClock,
} from "@/lib/booking/clinic-hours";
import { dateInZone } from "@/lib/booking/dates";
import { requireApiPermission } from "@/lib/rbac/guard";

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

/** Extract a field value from the GCal event description */
function parseField(description: string, field: string): string {
  const line = description.split("\n").find((l) => l.startsWith(`${field}:`));
  return line?.slice(field.length + 1).trim() ?? "";
}

export async function PATCH(req: NextRequest) {
  const check = await requireApiPermission("calendar", "Update");
  if (!check.ok) return check.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { eventId, newStartTime, newEndTime } = body as Record<string, unknown>;

  if (!eventId || typeof eventId !== "string") {
    return NextResponse.json(
      { error: "eventId is required", code: "MISSING_EVENT_ID" },
      { status: 400 },
    );
  }

  if (!newStartTime || typeof newStartTime !== "string") {
    return NextResponse.json(
      { error: "newStartTime is required (ISO 8601 format)", code: "MISSING_START_TIME" },
      { status: 400 },
    );
  }

  if (!newEndTime || typeof newEndTime !== "string") {
    return NextResponse.json(
      { error: "newEndTime is required (ISO 8601 format)", code: "MISSING_END_TIME" },
      { status: 400 },
    );
  }

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
    return NextResponse.json(
      { error: "Cannot reschedule to this day — clinic is closed", code: "INVALID_DAY" },
      { status: 400 },
    );
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
    return NextResponse.json(
      {
        error: `Can only reschedule between ${fractionalHourToClock(hoursToday.startHour)} and ${fractionalHourToClock(hoursToday.endHour)}`,
        code: "INVALID_TIME",
      },
      { status: 400 },
    );
  }

  try {
    const calendar = getCalendarClient();
    const calId = calendarId();

    const getRes = await calendar.events.get({ calendarId: calId, eventId });
    const event = getRes.data;
    const oldStartTime = event.start?.dateTime;

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

    return NextResponse.json({
      ok: true,
      eventId,
      oldStartTime: event.start?.dateTime,
      newStartTime: updatedEvent.data.start?.dateTime,
      message: `Rescheduled: ${updatedEvent.data.summary}`,
    });
  } catch (err) {
    console.error("[/api/calendar/reschedule] Error:", err);

    const error = err as { code?: number; status?: number; message?: string };
    let statusCode = 500;
    let message = "Failed to reschedule appointment";
    let code = "RESCHEDULE_ERROR";

    if (error?.code === 404 || error?.status === 404) {
      statusCode = 404;
      message = "Appointment not found (may have been deleted)";
      code = "NOT_FOUND";
    } else if (error?.message?.includes("not found")) {
      statusCode = 404;
      message = "Appointment not found (may have been deleted)";
      code = "NOT_FOUND";
    } else if (error?.message) {
      message = error.message;
    }

    return NextResponse.json(
      {
        error: message,
        code,
        details: process.env.NODE_ENV === "development" ? error?.message : undefined,
      },
      { status: statusCode },
    );
  }
}
