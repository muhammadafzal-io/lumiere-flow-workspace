import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { lookupClient } from "@/lib/integrations/airtable";
import { sendRetentionEmail } from "@/lib/integrations/email";
import { logEvent } from "@/lib/integrations/activity-log";
import { getWidgetUrl, widgetLinkLine } from "@/lib/client-channels";

function getCalendarClient() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_JSON");

  let credentials: object;
  try {
    credentials = JSON.parse(raw);
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON");
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/calendar"],
  });
  return google.calendar({ version: "v3", auth });
}

function calendarId() {
  return process.env.GOOGLE_CALENDAR_ID ?? "primary";
}

/** Extract a field value from the GCal event description (e.g. "Contact: +1234") */
function parseField(description: string, field: string): string {
  const line = description.split("\n").find((l) => l.startsWith(`${field}:`));
  return line?.slice(field.length + 1).trim() ?? "";
}

export async function DELETE(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { eventId } = body as Record<string, unknown>;

  if (!eventId || typeof eventId !== "string") {
    return NextResponse.json(
      { error: "eventId is required", code: "MISSING_EVENT_ID" },
      { status: 400 },
    );
  }

  try {
    const calendar = getCalendarClient();
    const calId = calendarId();

    const getRes = await calendar.events.get({ calendarId: calId, eventId });
    const event = getRes.data;

    await calendar.events.delete({ calendarId: calId, eventId });

    (async () => {
      try {
        const description = event.description ?? "";
        const contact = parseField(description, "Contact");
        const clientName =
          parseField(description, "Client") || event.summary?.split(" — ")[1] || "Valued Client";
        const treatment =
          parseField(description, "Treatment") ||
          event.summary?.split(" — ")[0] ||
          "your appointment";
        const startTime = event.start?.dateTime;
        // Email may be in a dedicated "Email:" line or buried anywhere in description
        const emailInDesc =
          parseField(description, "Email") ||
          description.match(/Email:\s*([^\s\n]+@[^\s\n]+)/i)?.[1];

        const client = contact ? await lookupClient({ phone: contact }).catch(() => null) : null;
        const email = client?.email || emailInDesc;
        if (!email) return;

        const displayTime = startTime
          ? new Date(startTime).toLocaleString("en-US", {
              timeZone: "America/Chicago",
              weekday: "long",
              month: "long",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
              hour12: true,
            })
          : "your scheduled time";

        await sendRetentionEmail({
          to: email,
          subject: `Your ${treatment} appointment has been cancelled`,
          flowType: "cancellation",
          logMeta: {
            category: "cancellation",
            triggerType: "system",
            clientId: client?.id,
            clientName,
          },
          text: [
            `Hi ${clientName}, your appointment at Lumière has been cancelled.`,
            ``,
            `Treatment: ${treatment}`,
            `Original Date: ${displayTime} CT`,
            ``,
            `We'd love to rebook you at a time that works better. Reply to this email or visit us Monday–Saturday, 9 AM–7 PM.`,
            widgetLinkLine(),
            ``,
            `— The Lumière Team`,
          ].join("\n"),
          cta: {
            label: "Book a New Appointment",
            url: getWidgetUrl(),
          },
        });

        await logEvent(
          "cancellation",
          clientName,
          `Cancellation email sent to ${email} for ${treatment}`,
          {
            phone: contact,
            email,
          },
        );
      } catch (err) {
        console.error(`[cancel] cancellation email failed:`, err);
      }
    })();

    return NextResponse.json({
      ok: true,
      eventId,
      message: `Cancelled: ${event.summary}`,
    });
  } catch (err) {
    console.error("[/api/calendar/cancel] Error:", err);

    const error = err as { code?: number; status?: number; message?: string };
    let statusCode = 500;
    let message = "Failed to cancel appointment";
    let code = "CANCEL_ERROR";

    if (error?.code === 404 || error?.status === 404) {
      statusCode = 404;
      message = "Appointment not found (may have been deleted already)";
      code = "NOT_FOUND";
    } else if (error?.message?.includes("not found")) {
      statusCode = 404;
      message = "Appointment not found (may have been deleted already)";
      code = "NOT_FOUND";
    } else if (error?.message) {
      message = error.message;
    }

    return NextResponse.json(
      {
        error: message,
        code,
        details: process.env.NODE_ENV === "development" ? error?.message : undefined,
      },
      { status: statusCode },
    );
  }
}
