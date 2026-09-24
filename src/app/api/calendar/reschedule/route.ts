import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/rbac/guard";
import { rescheduleCalendarEvent } from "@/lib/booking/manage-event";

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

  // Business-hours validation, the calendar update, the client email and the waitlist offer are
  // shared with the customer portal (see manage-event.ts).
  const result = await rescheduleCalendarEvent({ eventId, newStartTime, newEndTime });
  return NextResponse.json(result.body, { status: result.status });
}
