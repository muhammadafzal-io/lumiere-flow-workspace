import { NextRequest, NextResponse } from "next/server";
import { requireCustomer } from "@/lib/account/auth";
import { bookAppointment, BookingWarningsError } from "@/lib/services/booking-service";
import { sendBookingConfirmationEmail } from "@/lib/booking/confirmation-email";
import { upsertClient } from "@/lib/integrations/airtable";
import { logEvent } from "@/lib/integrations/activity-log";

export const dynamic = "force-dynamic";

/**
 * A client booking for themselves.
 *
 * Thin on purpose: it resolves who is asking, then hands straight to the same bookAppointment the
 * chat and voice agents use, with source "bot" so every rule that applies to a client-made booking
 * — online-bookable, prior consultation, notice window, room/practitioner/equipment — applies here
 * too. Required forms, treatment-area photos and head-practitioner sign-off all follow from that
 * call, exactly as they do for a chat booking.
 */
export async function POST(req: NextRequest) {
  const check = await requireCustomer();
  if (!check.ok) return check.response;
  const { customer } = check;

  try {
    const body = await req.json().catch(() => ({}));
    const treatment = typeof body.treatment === "string" ? body.treatment.trim() : "";
    const startTime = typeof body.startTime === "string" ? body.startTime : "";
    const endTime = typeof body.endTime === "string" ? body.endTime : "";
    if (!treatment || !startTime || !endTime) {
      return NextResponse.json({ error: "Please pick a treatment and a time." }, { status: 400 });
    }

    if (!customer.phone) {
      return NextResponse.json(
        {
          error: "Add your phone number to your profile before booking.",
          code: "PROFILE_INCOMPLETE",
        },
        { status: 400 },
      );
    }

    const appointment = await bookAppointment({
      clientName: customer.name,
      clientContact: customer.phone,
      clientEmail: customer.email || undefined,
      clientId: customer.id,
      treatment,
      startTime,
      endTime,
      practitionerName: typeof body.practitionerName === "string" ? body.practitionerName : "",
      room: "",
      notes: typeof body.notes === "string" ? body.notes.slice(0, 500) : undefined,
      source: "bot",
    });

    await upsertClient({
      name: customer.name,
      phone: customer.phone,
      email: customer.email || undefined,
      lastTreatment: treatment,
    }).catch((err) => console.error("[account/book] client upsert failed:", err));

    await logEvent("booking", customer.name, `Booked ${treatment} from the customer portal`, {
      clientId: customer.id,
      phone: customer.phone,
      email: customer.email,
      platform: "portal",
    }).catch(() => undefined);

    if (customer.email) {
      void sendBookingConfirmationEmail({
        to: customer.email,
        clientName: customer.name,
        treatment,
        startTime: appointment.startTime,
        practitionerName: appointment.practitionerName,
        clientId: customer.id,
        phone: customer.phone,
        eventId: appointment.id,
        platform: "portal",
      }).catch((err) => console.error("[account/book] confirmation email failed:", err));
    }

    return NextResponse.json({
      appointment: {
        id: appointment.id,
        treatment: appointment.treatment,
        startTime: appointment.startTime,
        endTime: appointment.endTime,
        practitioner: appointment.practitionerName,
        requiresApproval: appointment.requiresApproval ?? false,
      },
    });
  } catch (err) {
    // The engine's own refusals are the clinic's rules talking — pass the wording through rather
    // than inventing a portal-specific message.
    if (err instanceof BookingWarningsError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    const message = err instanceof Error ? err.message : "We couldn't book that";
    console.error("POST /api/account/book error:", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
