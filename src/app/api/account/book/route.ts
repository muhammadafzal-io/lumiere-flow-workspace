import { NextRequest, NextResponse } from "next/server";
import { requireCustomer } from "@/lib/account/auth";
import { bookAppointment, BookingWarningsError } from "@/lib/services/booking-service";
import { sendBookingConfirmationEmail } from "@/lib/booking/confirmation-email";
import { upsertClient } from "@/lib/integrations/airtable";
import { logEvent } from "@/lib/integrations/activity-log";
import { getSupabase } from "@/lib/supabase";
import { syncClientDetailsToCalendar } from "@/lib/integrations/google-calendar";
import { checkAvailability } from "@/lib/services/booking-service";
import { getClinicConfig } from "@/lib/clinic-config";
import { dateInZone } from "@/lib/booking/dates";
import { normalizeBirthdayForStorage } from "@/lib/birthday";
import { normalizeEmail } from "@/lib/agent/booking-guards";
import { isFullName } from "@/lib/agent/client-name";

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

    // Every detail on the form is editable, as it is in the admin "New appointment" form. What the
    // client types is what this booking (and its confirmation email) uses; name, phone and
    // birthday are also saved back to their own profile so it stays the one source of truth. The
    // ACCOUNT email is never rewritten from here — it is the identity the session was matched on —
    // so a different email typed here only redirects this booking's confirmation.
    const typedName = typeof body.clientName === "string" ? body.clientName.trim() : "";
    const typedPhone = typeof body.clientPhone === "string" ? body.clientPhone.trim() : "";
    const typedEmail = typeof body.clientEmail === "string" ? body.clientEmail.trim() : "";
    const typedBirthday = typeof body.birthday === "string" ? body.birthday.trim() : "";

    if (typedName && !isFullName(typedName)) {
      return NextResponse.json({ error: "Please give your first and last name." }, { status: 400 });
    }
    if (typedPhone && typedPhone.replace(/\D/g, "").length < 7) {
      return NextResponse.json({ error: "That phone number looks incomplete." }, { status: 400 });
    }
    if (typedEmail && !normalizeEmail(typedEmail)) {
      return NextResponse.json(
        { error: "That email address doesn't look right." },
        { status: 400 },
      );
    }
    const birthdayForStorage = typedBirthday ? normalizeBirthdayForStorage(typedBirthday) : null;
    if (typedBirthday && !birthdayForStorage) {
      return NextResponse.json(
        { error: "Please give your birthday as YYYY-MM-DD." },
        { status: 400 },
      );
    }

    const clientName = typedName || customer.name;
    const clientPhone = typedPhone || customer.phone;
    const clientEmail = normalizeEmail(typedEmail) || customer.email || "";

    const profileUpdate: Record<string, unknown> = {};
    if (typedName && typedName !== customer.name) profileUpdate["Name"] = typedName;
    if (typedPhone && typedPhone !== customer.phone) profileUpdate["Phone"] = typedPhone;
    if (birthdayForStorage) profileUpdate["Birthday"] = birthdayForStorage;
    if (Object.keys(profileUpdate).length > 0) {
      await getSupabase()
        .from("Clients")
        .update(profileUpdate)
        .eq("id", customer.id)
        .then(({ error }) => {
          if (error) console.error("[account/book] profile update failed:", error.message);
        });
      // Carry the change onto their existing calendar bookings too.
      await syncClientDetailsToCalendar({
        clientId: customer.id,
        previous: { name: customer.name, phone: customer.phone },
        next: {
          name: profileUpdate["Name"] ? String(profileUpdate["Name"]) : undefined,
          phone: profileUpdate["Phone"] ? String(profileUpdate["Phone"]) : undefined,
        },
      }).catch((err) => console.error("[account/book] calendar sync failed:", err));
    }

    if (!clientPhone) {
      return NextResponse.json(
        {
          error: "Add your phone number to your profile before booking.",
          code: "PROFILE_INCOMPLETE",
        },
        { status: 400 },
      );
    }

    // The engine needs a practitioner AND a room for every booking. A client never picks a room, so
    // both are resolved here from the real availability for exactly this time — the same check that
    // produced the slot list. That also re-verifies the slot is still free (someone may have taken
    // it since the list loaded) and stops a client booking a time the engine never offered.
    const { timezone } = await getClinicConfig();
    const requestedPractitioner =
      typeof body.practitionerName === "string" ? body.practitionerName.trim() : "";
    const availability = await checkAvailability({
      date: dateInZone(new Date(startTime), timezone),
      treatment,
      ...(requestedPractitioner ? { practitionerName: requestedPractitioner } : {}),
    });
    const wanted = new Date(startTime).getTime();
    const slot = availability.slots.find((s) => new Date(s.startTime).getTime() === wanted);
    const room = slot?.availableRooms?.[0];
    const practitionerName = requestedPractitioner || slot?.availablePractitioners?.[0];
    if (!slot || !room || !practitionerName) {
      return NextResponse.json(
        { error: "That time is no longer available — please pick another." },
        { status: 409 },
      );
    }

    const appointment = await bookAppointment({
      clientName,
      clientContact: clientPhone,
      clientEmail: clientEmail || undefined,
      clientId: customer.id,
      treatment,
      startTime,
      endTime,
      practitionerName,
      room,
      notes: typeof body.notes === "string" ? body.notes.slice(0, 500) : undefined,
      source: "bot",
    });

    await upsertClient({
      name: clientName,
      phone: clientPhone,
      email: clientEmail || undefined,
      lastTreatment: treatment,
    }).catch((err) => console.error("[account/book] client upsert failed:", err));

    await logEvent("booking", clientName, `Booked ${treatment} from the customer portal`, {
      clientId: customer.id,
      phone: clientPhone,
      email: clientEmail,
      platform: "portal",
    }).catch(() => undefined);

    if (clientEmail) {
      void sendBookingConfirmationEmail({
        to: clientEmail,
        clientName,
        treatment,
        startTime: appointment.startTime,
        practitionerName: appointment.practitionerName,
        clientId: customer.id,
        phone: clientPhone,
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
      emailedTo: clientEmail || null,
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
