import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";

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

export async function PATCH(req: NextRequest) {
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

  // Validate business hours and day
  const newStartDate = new Date(newStartTime);
  const dayOfWeek = newStartDate.getDay();
  const hours = newStartDate.getHours();

  if (dayOfWeek === 0) {
    return NextResponse.json(
      { error: "Cannot reschedule on Sundays — clinic is closed", code: "INVALID_DAY" },
      { status: 400 },
    );
  }

  if (hours < 9 || hours >= 19) {
    return NextResponse.json(
      { error: "Can only reschedule between 9:00 AM and 7:00 PM", code: "INVALID_TIME" },
      { status: 400 },
    );
  }

  try {
    const calendar = getCalendarClient();
    const calId = calendarId();

    console.log(`[/api/calendar/reschedule] Rescheduling event ${eventId}`);

    // Get the event first
    const getRes = await calendar.events.get({
      calendarId: calId,
      eventId,
    });

    const event = getRes.data;

    // Update the event with new times
    const timezone = "America/Chicago";
    const updatedEvent = await calendar.events.update({
      calendarId: calId,
      eventId,
      requestBody: {
        ...event,
        start: { dateTime: newStartTime, timeZone: timezone },
        end: { dateTime: newEndTime, timeZone: timezone },
      },
    });

    console.log(`[/api/calendar/reschedule] Successfully rescheduled event ${eventId}`);

    return NextResponse.json({
      ok: true,
      eventId,
      oldStartTime: event.start?.dateTime,
      newStartTime: updatedEvent.data.start?.dateTime,
      message: `Rescheduled: ${updatedEvent.data.summary}`,
    });
  } catch (err) {
    console.error("[/api/calendar/reschedule] Error:", err);

    const error = err as any;
    let statusCode = 500;
    let message = "Failed to reschedule appointment";
    let code = "RESCHEDULE_ERROR";

    // Handle Google Calendar API errors
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
