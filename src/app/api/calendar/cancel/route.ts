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

export async function DELETE(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { eventId } = body as Record<string, unknown>;

  if (!eventId || typeof eventId !== "string") {
    return NextResponse.json(
      { error: "eventId is required", code: "MISSING_EVENT_ID" },
      { status: 400 },
    );
  }

  try {
    const calendar = getCalendarClient();
    const calId = calendarId();

    // Get the event first to return its details
    const getRes = await calendar.events.get({
      calendarId: calId,
      eventId,
    });

    const event = getRes.data;

    // Delete the event
    await calendar.events.delete({
      calendarId: calId,
      eventId,
    });

    return NextResponse.json({
      ok: true,
      eventId,
      message: `Cancelled: ${event.summary}`,
    });
  } catch (err) {
    console.error("[/api/calendar/cancel] Error:", err);

    const error = err as any;
    let statusCode = 500;
    let message = "Failed to cancel appointment";
    let code = "CANCEL_ERROR";

    // Handle Google Calendar API errors
    if (error?.code === 404 || error?.status === 404) {
      statusCode = 404;
      message = "Appointment not found (may have been deleted already)";
      code = "NOT_FOUND";
    } else if (error?.message?.includes("not found")) {
      statusCode = 404;
      message = "Appointment not found (may have been deleted already)";
      code = "NOT_FOUND";
    } else if (error?.message) {
      message = error.message;
    }

    return NextResponse.json(
      {
        error: message,
        code,
        details: process.env.NODE_ENV === "development" ? error?.message : undefined
      },
      { status: statusCode },
    );
  }
}