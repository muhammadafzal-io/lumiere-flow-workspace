import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/rbac/guard";
import { cancelCalendarEvent } from "@/lib/booking/manage-event";

export async function DELETE(req: NextRequest) {
  const check = await requireApiPermission("calendar", "Delete");
  if (!check.ok) return check.response;

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

  // The cancellation itself — calendar delete, client email, waitlist offer — is shared with the
  // customer portal (see manage-event.ts).
  const result = await cancelCalendarEvent(eventId);
  return NextResponse.json(result.body, { status: result.status });
}
