import { NextRequest, NextResponse } from "next/server";
import { bookAppointment, BookingWarningsError } from "@/lib/services/booking-service";
import { lookupClient, upsertClient } from "@/lib/integrations/airtable";
import { sendBookingConfirmationEmail } from "@/lib/booking/confirmation-email";
import { normalizeBirthdayForStorage } from "@/lib/birthday";
import { validatePortalBooking, normalizeEmail } from "@/lib/agent/booking-guards";
import { requireApiPermission } from "@/lib/rbac/guard";

export async function POST(req: NextRequest) {
  const check = await requireApiPermission("calendar", "Create");
  if (!check.ok) return check.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    startTime,
    endTime,
    clientName,
    clientContact,
    clientEmail,
    treatment,
    room,
    practitionerName,
    equipment,
    notes,
    sendConfirmation,
    birthday,
    force,
  } = body as Record<string, string | string[] | boolean>;

  const portalError = validatePortalBooking({
    clientName: typeof clientName === "string" ? clientName : undefined,
    clientContact: typeof clientContact === "string" ? clientContact : undefined,
    clientEmail: typeof clientEmail === "string" ? clientEmail : undefined,
    treatment: typeof treatment === "string" ? treatment : undefined,
    startTime: typeof startTime === "string" ? startTime : undefined,
    endTime: typeof endTime === "string" ? endTime : undefined,
    practitionerName: typeof practitionerName === "string" ? practitionerName : undefined,
    room: typeof room === "string" ? room : undefined,
    birthday: typeof birthday === "string" ? birthday : undefined,
  });
  if (portalError) {
    return NextResponse.json({ error: portalError, code: "VALIDATION_ERROR" }, { status: 400 });
  }

  if (!startTime || !endTime || !clientName || !treatment || !room || !practitionerName) {
    return NextResponse.json(
      {
        error: "startTime, endTime, clientName, treatment, room and practitionerName are required",
      },
      { status: 400 },
    );
  }

  const shouldSendConfirmation = sendConfirmation !== false;

  try {
    const resolvedEmail =
      normalizeEmail(clientEmail) ||
      (clientContact
        ? (await lookupClient({ phone: String(clientContact) }).catch(() => null))?.email
        : undefined);

    if (resolvedEmail || clientContact) {
      await upsertClient({
        name: String(clientName),
        phone: String(clientContact || ""),
        email: resolvedEmail,
        ...(typeof birthday === "string" && birthday.trim()
          ? { birthday: normalizeBirthdayForStorage(birthday.trim()) }
          : {}),
      }).catch(() => undefined);
    }

    const clientRecord = clientContact
      ? await lookupClient({ phone: String(clientContact) }).catch(() => null)
      : null;

    const result = await bookAppointment({
      startTime: String(startTime),
      endTime: String(endTime),
      clientName: String(clientName),
      clientContact: String(clientContact || ""),
      clientEmail: resolvedEmail,
      treatment: String(treatment),
      room: String(room),
      practitionerName: String(practitionerName),
      equipment: Array.isArray(equipment)
        ? equipment.map((item) => String(item))
        : equipment
          ? [String(equipment)]
          : undefined,
      notes: typeof notes === "string" ? notes : undefined,
      force: force === true,
    });

    let emailSent = false;
    let emailSkippedReason: string | undefined;

    if (shouldSendConfirmation) {
      if (resolvedEmail) {
        try {
          await sendBookingConfirmationEmail({
            to: resolvedEmail,
            clientName: String(clientName),
            treatment: String(treatment),
            startTime: String(startTime),
            practitionerName: String(practitionerName),
            notes: typeof notes === "string" ? notes : undefined,
            clientId: clientRecord?.id,
            phone: String(clientContact || ""),
          });
          emailSent = true;
        } catch (err) {
          console.error(`[book] confirmation email failed:`, err);
          emailSkippedReason = "Email delivery failed";
        }
      } else {
        emailSkippedReason = "No email on file for this client";
      }
    }

    return NextResponse.json({ ...result, emailSent, emailSkippedReason });
  } catch (err) {
    if (err instanceof BookingWarningsError) {
      // PRD §9: never silently block or silently allow — surface the reasons and let the
      // caller resubmit with `force: true` if a person decides to book anyway.
      return NextResponse.json(
        { error: err.message, warnings: err.warnings, code: "WARNINGS" },
        { status: 409 },
      );
    }
    const message = err instanceof Error ? err.message : "Booking failed";
    const isConflict =
      message.toLowerCase().includes("already booked") ||
      message.toLowerCase().includes("not available") ||
      message.toLowerCase().includes("unavailable");
    return NextResponse.json(
      { error: message, code: isConflict ? "CONFLICT" : "BOOKING_ERROR" },
      { status: isConflict ? 409 : 400 },
    );
  }
}
