import { NextRequest, NextResponse } from "next/server";
import { markCalendarEventCompleted } from "@/lib/integrations/google-calendar";
import { requireApiPermission } from "@/lib/rbac/guard";

export const dynamic = "force-dynamic";

/**
 * POST /api/calendar/complete
 * Body: { "eventId": "..." }
 *
 * Persists "completed" on the calendar event itself so the status sticks across reload/reopen.
 */
export async function POST(req: NextRequest) {
  const check = await requireApiPermission("calendar", "Update");
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

  try {
    await markCalendarEventCompleted(eventId);
    return NextResponse.json({ ok: true, eventId });
  } catch (err) {
    console.error("[/api/calendar/complete] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to mark appointment complete" },
      { status: 500 },
    );
  }
}
