import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { requireApiPermission } from "@/lib/rbac/guard";
import { logEvent } from "@/lib/integrations/activity-log";
import { getCalendarBookingDetails } from "@/lib/integrations/google-calendar";
import {
  TABLE,
  closeCompletionLink,
  completeBookingLink,
  mapCompletionRow,
} from "@/lib/booking/completion-link";

export const dynamic = "force-dynamic";

/**
 * Staff follow-up actions on a Pending Bookings row:
 * - complete:       staff enter the name/email/birthday collected over the phone
 * - dismiss:        take a stale row off the worklist, leaving the appointment untouched
 * - mark_cancelled: close the row after the appointment itself was cancelled through
 *                   DELETE /api/calendar/cancel (which owns the cancellation email and waitlist
 *                   offer); refused while the calendar event still exists
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const check = await requireApiPermission("pending_bookings", "Update");
  if (!check.ok) return check.response;

  const { token } = await params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const sb = getSupabase();
    // Loaded directly rather than via getCompletionLink, which returns nothing once the calendar
    // event is gone — exactly the rows staff most need to be able to dismiss.
    const { data: row } = await sb.from(TABLE).select("*").eq("token", token).maybeSingle();
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const link = mapCompletionRow(row);
    const booking = await getCalendarBookingDetails(link.eventId).catch(() => null);
    const eventGone = !booking || booking.cancelled;
    const treatment = booking?.treatment || link.treatment || "appointment";

    const { data: userRow } = await sb
      .from("Users")
      .select("Name")
      .eq("id", check.userId)
      .maybeSingle();
    const staffName = userRow?.Name ?? "Staff";

    switch (body.action) {
      case "complete": {
        if (eventGone) {
          return NextResponse.json(
            { error: "This appointment is no longer on the calendar." },
            { status: 409 },
          );
        }
        const result = await completeBookingLink(
          token,
          {
            fullName: typeof body.fullName === "string" ? body.fullName : undefined,
            email: typeof body.email === "string" ? body.email : undefined,
            birthday: typeof body.birthday === "string" ? body.birthday : undefined,
          },
          { byStaff: true },
        );
        if (!result.ok) {
          return NextResponse.json(
            { error: result.error, errors: result.errors },
            { status: result.errors ? 422 : 409 },
          );
        }
        await logEvent(
          "booking",
          String(body.fullName).trim(),
          `${staffName} completed pending ${treatment} booking details by phone`,
          { phone: link.phone, email: String(body.email).trim().toLowerCase() },
        ).catch(() => undefined);
        return NextResponse.json({ ok: true });
      }

      case "dismiss": {
        if (!(await closeCompletionLink(token, "dismissed"))) {
          return NextResponse.json(
            { error: "This booking is no longer pending." },
            { status: 409 },
          );
        }
        await logEvent(
          "booking",
          link.clientName ?? "Unknown client",
          `${staffName} dismissed pending ${treatment} booking from the follow-up list`,
          { phone: link.phone },
        ).catch(() => undefined);
        return NextResponse.json({ ok: true });
      }

      case "mark_cancelled": {
        if (!eventGone) {
          return NextResponse.json(
            { error: "Cancel the appointment first — it's still on the calendar." },
            { status: 409 },
          );
        }
        if (!(await closeCompletionLink(token, "cancelled"))) {
          return NextResponse.json(
            { error: "This booking is no longer pending." },
            { status: 409 },
          );
        }
        return NextResponse.json({ ok: true });
      }

      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (err) {
    console.error("PATCH /api/booking-completions/[token] error:", err);
    return NextResponse.json({ error: "Failed to update pending booking" }, { status: 500 });
  }
}
