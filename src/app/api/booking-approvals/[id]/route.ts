import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/rbac/guard";
import { getSupabase } from "@/lib/supabase";
import { getCalendarBookingDetails } from "@/lib/integrations/google-calendar";
import { logEvent } from "@/lib/integrations/activity-log";
import { getClinicTimezone } from "@/lib/clinic-config";
import { formatActivityTime } from "@/lib/activity/merge-timeline";
import { validateSignature } from "@/lib/booking/signature";
import {
  BookingApprovalsUnavailableError,
  decideBookingApproval,
  getBookingApproval,
} from "@/lib/booking/approvals";

export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

const MAX_REASON_LENGTH = 1000;

export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  // Approving is a change to a booking's standing, so it needs Update — View alone (the queue) is
  // not enough. Enforced here, not in the page, so calling this route directly is refused too.
  const check = await requireApiPermission("booking_approvals", "Update");
  if (!check.ok) return check.response;

  try {
    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const action =
      body.action === "approve" ? "APPROVED" : body.action === "reject" ? "REJECTED" : null;
    if (!action) {
      return NextResponse.json({ error: "action must be approve or reject" }, { status: 400 });
    }

    // Approving is a clinical sign-off, so it carries the head practitioner's handwritten
    // signature — checked here, not only in the page, so the API cannot be used to approve without
    // one.
    let signature: string | undefined;
    if (action === "APPROVED") {
      const signatureCheck = validateSignature(body.signature);
      if (!signatureCheck.ok) {
        return NextResponse.json({ error: signatureCheck.error }, { status: 400 });
      }
      signature = signatureCheck.signature;
    }

    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (action === "REJECTED" && !reason) {
      // A rejection is acted on by other staff, who need to know why before they call the client.
      return NextResponse.json({ error: "A reason is required to reject." }, { status: 400 });
    }
    if (reason.length > MAX_REASON_LENGTH) {
      return NextResponse.json({ error: "That reason is too long." }, { status: 400 });
    }

    const existing = await getBookingApproval(id);
    if (!existing) return NextResponse.json({ error: "Approval not found" }, { status: 404 });

    const sb = getSupabase();
    const { data: userRow } = await sb
      .from("Users")
      .select("Name")
      .eq("id", check.userId)
      .maybeSingle();
    const staffName = userRow?.Name ?? "Staff";

    const outcome = await decideBookingApproval(
      id,
      action,
      { userId: check.userId, name: staffName },
      reason,
      signature,
    );
    if (!outcome.ok) {
      // Someone else decided first — 409 so the page can refresh and show what actually happened.
      return NextResponse.json({ error: outcome.error }, { status: 409 });
    }

    const booking = await getCalendarBookingDetails(existing.eventId).catch(() => null);
    const tz = await getClinicTimezone();
    await logEvent(
      "approval",
      booking?.clientName || "—",
      `${action === "APPROVED" ? "Approved" : "Rejected"} ${existing.serviceName}${
        booking ? ` on ${formatActivityTime(booking.startTime, tz)}` : ""
      } — by ${staffName}${action === "REJECTED" && reason ? ` (${reason})` : ""}`,
      { phone: booking?.clientContact, platform: "admin" },
    ).catch((e) => console.error("[approvals] ops log failed:", e));

    return NextResponse.json({ approval: outcome.approval });
  } catch (err) {
    if (err instanceof BookingApprovalsUnavailableError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    console.error("PATCH /api/booking-approvals/[id] error:", err);
    return NextResponse.json({ error: "Failed to record the decision" }, { status: 500 });
  }
}
