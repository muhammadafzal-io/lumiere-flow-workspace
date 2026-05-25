import { NextRequest, NextResponse } from "next/server";
import { getAvailableSlots } from "@/lib/integrations/google-calendar";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const date = searchParams.get("date");
  const duration = Number(searchParams.get("duration") ?? "60");
  // Optional comma-separated lists: ?rooms=Room+1,Room+2&practitioners=Dr.+Sofia,Maya+Patel
  const roomsParam = searchParams.get("rooms");
  const practitionersParam = searchParams.get("practitioners");

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: "date is required in YYYY-MM-DD format", code: "INVALID_DATE" },
      { status: 400 },
    );
  }

  if (isNaN(duration) || duration < 15 || duration > 480) {
    return NextResponse.json(
      { error: "duration must be between 15 and 480 minutes", code: "INVALID_DURATION" },
      { status: 400 },
    );
  }

  const rooms = roomsParam
    ? roomsParam
        .split(",")
        .map((r) => r.trim())
        .filter(Boolean)
    : undefined;
  const practitioners = practitionersParam
    ? practitionersParam
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean)
    : undefined;

  try {
    const slots = await getAvailableSlots(date, duration, rooms, practitioners);
    return NextResponse.json({ slots });
  } catch (err) {
    console.error("[/api/calendar/slots]", err);
    return NextResponse.json(
      { error: "Failed to fetch availability", code: "CALENDAR_ERROR" },
      { status: 500 },
    );
  }
}
