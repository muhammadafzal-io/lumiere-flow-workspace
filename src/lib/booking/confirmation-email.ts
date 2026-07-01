import { sendRetentionEmail } from "@/lib/integrations/email";
import { logEvent } from "@/lib/integrations/activity-log";
import { widgetLinkLine } from "@/lib/client-channels";

export async function sendBookingConfirmationEmail(opts: {
  to: string;
  clientName: string;
  treatment: string;
  startTime: string;
  practitionerName: string;
  notes?: string;
  clientId?: string;
  phone?: string;
}): Promise<void> {
  const displayTime = new Date(opts.startTime).toLocaleString("en-US", {
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
    to: opts.to,
    subject: `Appointment confirmed — ${opts.treatment} on ${new Date(
      opts.startTime,
    ).toLocaleDateString("en-US", {
      timeZone: "America/Chicago",
      weekday: "short",
      month: "short",
      day: "numeric",
    })}`,
    flowType: "booking",
    logMeta: {
      category: "booking",
      triggerType: "system",
      clientId: opts.clientId,
      clientName: opts.clientName,
    },
    text: [
      `Hi ${opts.clientName}, your appointment at Lumière is confirmed!`,
      ``,
      `Treatment: ${opts.treatment}`,
      `Date & Time: ${displayTime} CT`,
      `Practitioner: ${opts.practitionerName}`,
      `Location: 2847 S Lamar Blvd, Suite 120, Austin TX 78704`,
      opts.notes ? `Notes: ${opts.notes}` : "",
      ``,
      `Need to change anything? Reply to this email or contact us Monday–Saturday, 9 AM–7 PM.`,
      widgetLinkLine(),
      ``,
      `See you soon!`,
      `— The Lumière Team`,
    ]
      .filter((line) => line !== undefined)
      .join("\n"),
    cta: {
      label: "View Location",
      url: "https://maps.google.com/?q=2847+S+Lamar+Blvd+Suite+120+Austin+TX",
    },
  });

  await logEvent("booking", opts.clientName, `Booking confirmation email sent to ${opts.to}`, {
    phone: opts.phone,
    email: opts.to,
  });
}
