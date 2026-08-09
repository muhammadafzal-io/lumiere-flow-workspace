import { sendRetentionEmail } from "@/lib/integrations/email";
import { logEvent } from "@/lib/integrations/activity-log";
import { widgetLinkLine } from "@/lib/client-channels";
import { getClinicConfig } from "@/lib/clinic-config";
import { getClinicBusinessHours, describeClinicHours } from "@/lib/booking/clinic-hours";
import { getSupabase } from "@/lib/supabase";
import {
  getServiceFormLinks,
  formatRequiredFormsLines,
  getInHouseFormLinks,
  formatInHouseFormLinks,
  resolveServiceId,
  type ServiceFormLink,
  type InHouseFormLink,
} from "@/lib/booking/recipe";
import { trackRequiredForms } from "@/lib/forms/tracking";

export async function sendBookingConfirmationEmail(opts: {
  to: string;
  clientName: string;
  treatment: string;
  startTime: string;
  practitionerName: string;
  notes?: string;
  clientId?: string;
  phone?: string;
  eventId?: string;
}): Promise<void> {
  const clinic = await getClinicConfig();
  const displayTime = new Date(opts.startTime).toLocaleString("en-US", {
    timeZone: clinic.timezone,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
  });
  const businessHoursLabel = describeClinicHours(await getClinicBusinessHours());
  const formLinks = await getServiceFormLinks(opts.treatment).catch(() => [] as ServiceFormLink[]);
  const inHouseLinks = opts.eventId
    ? await getInHouseFormLinks(
        opts.treatment,
        opts.eventId,
        opts.startTime,
        opts.phone ?? "",
        opts.clientName,
      ).catch(() => [] as InHouseFormLink[])
    : ([] as InHouseFormLink[]);

  if (opts.eventId && (formLinks.length > 0 || inHouseLinks.length > 0)) {
    const serviceId = await resolveServiceId(getSupabase(), opts.treatment).catch(() => null);
    await trackRequiredForms({
      eventId: opts.eventId,
      serviceId,
      externalLinks: formLinks,
      inHouseLinks,
    }).catch((err) => console.error("[trackRequiredForms] failed:", err));
  }

  await sendRetentionEmail({
    to: opts.to,
    subject: `Appointment confirmed — ${opts.treatment} on ${new Date(
      opts.startTime,
    ).toLocaleDateString("en-US", {
      timeZone: clinic.timezone,
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
      `Date & Time: ${displayTime}`,
      `Practitioner: ${opts.practitionerName}`,
      `Location: ${clinic.address}`,
      opts.notes ? `Notes: ${opts.notes}` : "",
      ...formatRequiredFormsLines(formLinks),
      ...formatInHouseFormLinks(inHouseLinks),
      ``,
      `Need to change anything? Reply to this email or contact us ${businessHoursLabel}.`,
      widgetLinkLine(),
      ``,
      `See you soon!`,
      `— The Lumière Team`,
    ]
      .filter((line) => line !== undefined)
      .join("\n"),
    cta: {
      label: "View Location",
      url: `https://maps.google.com/?q=${encodeURIComponent(clinic.address)}`,
    },
  });

  await logEvent("booking", opts.clientName, `Booking confirmation email sent to ${opts.to}`, {
    phone: opts.phone,
    email: opts.to,
  });
}
