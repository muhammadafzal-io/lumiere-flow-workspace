import { NextRequest, NextResponse } from "next/server";
import { getEventsByRange } from "@/lib/integrations/google-calendar";
import { requireApiPermission } from "@/lib/rbac/guard";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  const check = await requireApiPermission("calendar", "View");
  if (!check.ok) return check.response;

  const { searchParams } = req.nextUrl;
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  if (!from || !DATE_RE.test(from)) {
    return NextResponse.json(
      { error: "from is required in YYYY-MM-DD format", code: "INVALID_FROM" },
      { status: 400 },
    );
  }
  if (!to || !DATE_RE.test(to)) {
    return NextResponse.json(
      { error: "to is required in YYYY-MM-DD format", code: "INVALID_TO" },
      { status: 400 },
    );
  }
  if (to < from) {
    return NextResponse.json(
      { error: "to must be on or after from", code: "INVALID_RANGE" },
      { status: 400 },
    );
  }

  try {
    const events = await getEventsByRange(from, to);
    return NextResponse.json({ events });
  } catch (err) {
    console.error("[/api/calendar/events]", err);
    return NextResponse.json(
      { error: "Failed to fetch calendar events", code: "CALENDAR_ERROR" },
      { status: 500 },
    );
  }
}
