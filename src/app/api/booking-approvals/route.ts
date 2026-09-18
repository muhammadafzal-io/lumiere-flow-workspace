import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/rbac/guard";
import { getCalendarBookingDetails } from "@/lib/integrations/google-calendar";
import {
  BookingApprovalsUnavailableError,
  closeBookingApprovalForEvent,
  listBookingApprovals,
  type ApprovalStatus,
} from "@/lib/booking/approvals";

export const dynamic = "force-dynamic";

// Each row needs its own Calendar lookup (the table holds no appointment details) — same batching
// as /api/booking-completions so a long queue doesn't fire dozens of Google requests at once.
const LOOKUP_BATCH_SIZE = 8;

const STATUSES: ApprovalStatus[] = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"];

export async function GET(req: NextRequest) {
  const check = await requireApiPermission("booking_approvals", "View");
  if (!check.ok) return check.response;

  try {
    const statusParam = req.nextUrl.searchParams.get("status");
    const status = STATUSES.find((s) => s === statusParam?.toUpperCase());
    const approvals = await listBookingApprovals(status ? { status } : {});

    const items = [];
    for (let i = 0; i < approvals.length; i += LOOKUP_BATCH_SIZE) {
      const batch = approvals.slice(i, i + LOOKUP_BATCH_SIZE);
      const bookings = await Promise.all(
        batch.map((a) => getCalendarBookingDetails(a.eventId).catch(() => null)),
      );
      for (const [j, approval] of batch.entries()) {
        const booking = bookings[j];
        const onCalendar = !!booking && !booking.cancelled;
        // A booking that has left the calendar can't be acted on any more; close it out so a
        // cancelled appointment stops sitting in the queue looking actionable.
        if (!onCalendar && approval.status === "PENDING") {
          await closeBookingApprovalForEvent(approval.eventId);
          approval.status = "CANCELLED";
        }
        items.push({
          ...approval,
          onCalendar,
          clientName: onCalendar ? booking.clientName : null,
          treatment: onCalendar ? booking.treatment : approval.serviceName,
          appointmentStart: onCalendar ? booking.startTime : null,
          appointmentEnd: onCalendar ? booking.endTime : null,
          practitionerName: onCalendar ? booking.practitionerName || null : null,
          room: onCalendar ? booking.room || null : null,
          notes: onCalendar ? booking.notes || null : null,
          clientId: null,
        });
      }
    }

    return NextResponse.json({ items });
  } catch (err) {
    if (err instanceof BookingApprovalsUnavailableError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    console.error("GET /api/booking-approvals error:", err);
    return NextResponse.json({ error: "Failed to load approvals" }, { status: 500 });
  }
}
