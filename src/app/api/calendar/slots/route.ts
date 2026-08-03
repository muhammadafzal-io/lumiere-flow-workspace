import { NextRequest, NextResponse } from "next/server";
import { getAvailableSlots } from "@/lib/integrations/google-calendar";
import { checkAvailability } from "@/lib/services/booking-service";
import { SLOT_BUFFER_MINUTES } from "@/lib/booking/constants";
import { requireApiPermission } from "@/lib/rbac/guard";

export async function GET(req: NextRequest) {
  const check = await requireApiPermission("calendar", "View");
  if (!check.ok) return check.response;

  const { searchParams } = req.nextUrl;
  const date = searchParams.get("date");
  const duration = Number(searchParams.get("duration") ?? "60");
  const treatment = searchParams.get("treatment");
  // Optional comma-separated lists: ?rooms=Room+One,Room+Two&practitioners=Dr.+Sofia,Maya+Patel
  const roomsParam = searchParams.get("rooms");
  const practitionersParam = searchParams.get("practitioners");
  const equipmentsParam = searchParams.get("equipments");

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
  const equipments = equipmentsParam
    ? equipmentsParam
        .split(",")
        .map((e) => e.trim())
        .filter(Boolean)
    : undefined;

  try {
    // When a treatment is given, resolve it through the same Service-recipe engine the AI
    // booking flow already uses (@/lib/services/booking-service) — real qualified practitioners,
    // real allowed rooms, real equipment requirements, real per-resource cleanup buffers. Without
    // this, the admin "New appointment" modal was falling back to a hardcoded room list that
    // didn't correspond to any real room, silently breaking every booking that hit it.
    if (treatment) {
      const result = await checkAvailability({
        date,
        durationMinutes: duration,
        treatment,
        practitionerName: practitioners?.[0],
        room: rooms?.[0],
        equipment: equipments,
      });
      return NextResponse.json({
        slots: result.slots,
        bufferMinutes: SLOT_BUFFER_MINUTES,
        bookingWindowNote: result.bookingWindowNote,
      });
    }

    const slots = await getAvailableSlots(date, duration, rooms, practitioners, equipments);
    return NextResponse.json({ slots, bufferMinutes: SLOT_BUFFER_MINUTES });
  } catch (err) {
    console.error("[/api/calendar/slots]", err);
    return NextResponse.json(
      { error: "Failed to fetch availability", code: "CALENDAR_ERROR" },
      { status: 500 },
    );
  }
}
