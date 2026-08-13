/**
 * Sends the "your waitlisted slot is available" notification — reuses trySend
 * (src/lib/retention/utils.ts), the same multi-channel (messaging provider + Discord mirror +
 * email) fan-out every other retention flow (noshow.ts, reactivation.ts) already uses, rather
 * than building new send infrastructure.
 */
import { getMessagingProvider } from "@/lib/messaging";
import { trySend } from "@/lib/retention/utils";
import { getClinicConfig } from "@/lib/clinic-config";
import type { WaitlistOffer } from "@/lib/waitlist/offer-types";
import { waitlistAcceptUrl } from "@/lib/waitlist/offer-types";
import type { WaitlistEntry } from "@/lib/waitlist/store";

function fmtSlotTime(iso: string, timezone: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: timezone,
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
  });
}

/**
 * No native inline chat buttons here — InlineButton only carries `callbackData` (routed through
 * inbound-webhook parsing), not a URL, and wiring a new callback type just for this one button
 * would be real added surface. The accept link is included as plain text instead, same as
 * widgetLinkLine()/cta already do elsewhere in this app's messages.
 */
export async function sendWaitlistOfferNotification(
  offer: WaitlistOffer,
  entry: WaitlistEntry,
): Promise<void> {
  const contact = entry.clientPhone;
  if (!contact && !entry.clientEmail) return; // nothing to notify with

  const { timezone, address } = await getClinicConfig();
  const acceptUrl = waitlistAcceptUrl(offer.token);

  const text = [
    `Hi ${entry.clientName}, great news — a spot just opened up for your ${offer.treatment}.`,
    ``,
    `Date & Time: ${fmtSlotTime(offer.slotStart, timezone)}`,
    offer.practitionerName ? `Practitioner: ${offer.practitionerName}` : "",
    `Location: ${address}`,
    ``,
    `This offer is on a first-come basis and expires ${fmtSlotTime(offer.expiresAt, timezone)}.`,
    `Claim it here: ${acceptUrl}`,
    ``,
    `If this time no longer works, no action is needed — it'll be offered to the next person on`,
    `the list.`,
  ]
    .filter(Boolean)
    .join("\n");

  await trySend(getMessagingProvider(), {
    to: contact ?? entry.clientEmail ?? "",
    text,
    email: entry.clientEmail ?? undefined,
    subject: `Your ${offer.treatment} slot is available`,
    flowType: "waitlist-offer",
    emailLog: {
      category: "waitlist",
      triggerType: "system",
      clientId: entry.clientId,
      clientName: entry.clientName,
    },
  });
}
