import { NextRequest, NextResponse } from "next/server";
import { bookAppointment } from "@/lib/services/booking-service";
import { lookupClient } from "@/lib/integrations/airtable";
import { sendRetentionEmail } from "@/lib/integrations/email";
import { logEvent } from "@/lib/integrations/activity-log";

export async function POST(req: NextRequest) {
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
    treatment,
    room,
    practitionerName,
    notes,
  } = body as Record<string, string>;

  if (!startTime || !endTime || !clientName || !treatment || !room || !practitionerName) {
    return NextResponse.json(
      {
        error: "startTime, endTime, clientName, treatment, room and practitionerName are required",
      },
      { status: 400 },
    );
  }

  try {
    const result = await bookAppointment({
      startTime,
      endTime,
      clientName,
      clientContact: clientContact || "",
      treatment,
      room,
      practitionerName,
      notes,
    });

    // Fire-and-forget: send booking confirmation email
    (async () => {
      try {
        const client = clientContact
          ? await lookupClient({ phone: clientContact }).catch(() => null)
          : null;
        const email = client?.email;
        if (!email) return;

        const displayTime = new Date(startTime).toLocaleString("en-US", {
          timeZone: "America/Chicago",
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        });

        await sendRetentionEmail({
          to: email,
          subject: `Appointment confirmed — ${treatment} on ${new Date(startTime).toLocaleDateString("en-US", { timeZone: "America/Chicago", weekday: "short", month: "short", day: "numeric" })}`,
          flowType: "booking",
          logMeta: {
            category: "booking",
            triggerType: "system",
            clientId: client?.id,
            clientName,
          },
          text: [
            `Hi ${clientName}, your appointment at Lumière is confirmed!`,
            ``,
            `Treatment: ${treatment}`,
            `Date & Time: ${displayTime} CT`,
            `Practitioner: ${practitionerName}`,
            `Location: 2847 S Lamar Blvd, Suite 120, Austin TX 78704`,
            notes ? `Notes: ${notes}` : "",
            ``,
            `Need to change anything? Reply to this email or contact us Monday–Saturday, 9 AM–7 PM.`,
            ``,
            `See you soon!`,
            `— The Lumière Team`,
          ]
            .filter((l) => l !== undefined)
            .join("\n"),
          cta: {
            label: "View Location",
            url: "https://maps.google.com/?q=2847+S+Lamar+Blvd+Suite+120+Austin+TX",
          },
        });

        await logEvent("booking", clientName, `Booking confirmation email sent to ${email}`, {
          phone: clientContact,
          email,
        });

        console.log(`[book] confirmation email sent → ${email}`);
      } catch (err) {
        console.error(`[book] confirmation email failed:`, err);
      }
    })();

    return NextResponse.json(result);
  } catch (err) {
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
