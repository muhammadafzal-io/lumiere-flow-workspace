import { NextRequest, NextResponse } from "next/server";
import { requireCustomer } from "@/lib/account/auth";
import { checkAvailability } from "@/lib/services/booking-service";

export const dynamic = "force-dynamic";

/**
 * Open slots for one day. The same checkAvailability the chat and voice agents call, so clinic
 * hours, practitioner qualifications, rooms, equipment and cleanup buffers are all applied once,
 * in the engine — this route adds no availability logic of its own.
 */
export async function GET(req: NextRequest) {
  const check = await requireCustomer();
  if (!check.ok) return check.response;

  const date = req.nextUrl.searchParams.get("date");
  const treatment = req.nextUrl.searchParams.get("treatment");
  if (!date || !treatment) {
    return NextResponse.json({ error: "date and treatment are required" }, { status: 400 });
  }

  try {
    const availability = await checkAvailability({ date, treatment });
    return NextResponse.json({
      date: availability.date,
      slots: availability.slots.slice(0, 12).map((s) => ({
        startTime: s.startTime,
        endTime: s.endTime,
        practitioner: s.availablePractitioners?.[0] ?? null,
      })),
    });
  } catch (err) {
    console.error("GET /api/account/slots error:", err);
    return NextResponse.json({ error: "We couldn't load times for that day" }, { status: 500 });
  }
}
