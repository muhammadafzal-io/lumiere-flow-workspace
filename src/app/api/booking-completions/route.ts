import { NextResponse } from "next/server";
import { listPendingCompletions } from "@/lib/booking/completion-followups";
import { getCalendarBookingDetails } from "@/lib/integrations/google-calendar";
import { requireApiPermission } from "@/lib/rbac/guard";

export const dynamic = "force-dynamic";

// Each row needs its own Calendar lookup (the table doesn't store the appointment time) — kept in
// small batches so a long worklist doesn't fire dozens of Google requests at once.
const LOOKUP_BATCH_SIZE = 8;

export async function GET() {
  const check = await requireApiPermission("pending_bookings", "View");
  if (!check.ok) return check.response;

  try {
    const completions = await listPendingCompletions();

    const items: Array<
      (typeof completions)[number] & {
        appointmentStart: string | null;
        practitionerName: string | null;
        onCalendar: boolean;
      }
    > = [];
    for (let i = 0; i < completions.length; i += LOOKUP_BATCH_SIZE) {
      const batch = completions.slice(i, i + LOOKUP_BATCH_SIZE);
      const bookings = await Promise.all(
        batch.map((c) => getCalendarBookingDetails(c.eventId).catch(() => null)),
      );
      batch.forEach((c, j) => {
        const booking = bookings[j];
        const onCalendar = !!booking && !booking.cancelled;
        items.push({
          ...c,
          appointmentStart: onCalendar ? booking.startTime || null : null,
          practitionerName: onCalendar ? booking.practitionerName || null : null,
          onCalendar,
        });
      });
    }

    return NextResponse.json({ items });
  } catch (err) {
    console.error("GET /api/booking-completions error:", err);
    return NextResponse.json({ error: "Failed to load pending bookings" }, { status: 500 });
  }
}
