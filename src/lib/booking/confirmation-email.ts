import { sendRetentionEmail } from "@/lib/integrations/email";
import { logEvent } from "@/lib/integrations/activity-log";
import { widgetLinkLine } from "@/lib/client-channels";
import { getClinicConfig } from "@/lib/clinic-config";
import { getClinicBusinessHours, describeClinicHours } from "@/lib/booking/clinic-hours";
import { getSupabase } from "@/lib/supabase";
import {
  getInHouseFormLinks,
  formatInHouseFormLinks,
  resolveServiceId,
  listActiveAddonsForService,
  listServiceOffers,
  getServiceRateCardPricing,
  type InHouseFormLink,
} from "@/lib/booking/recipe";
import { resolvePricing } from "@/lib/booking/offer-pricing";
import {
  computePostBookingOffers,
  logOfferPresented,
  offerRespondUrl,
  listOfferEventsForEvent,
} from "@/lib/booking/offer-events";
import {
  selectComplementaryTreatment,
  RECENT_TREATMENT_WINDOW_DAYS,
} from "@/lib/booking/treatment-recommendation";
import { getAppointmentHistoryForContact } from "@/lib/integrations/google-calendar";
import { trackRequiredForms } from "@/lib/forms/tracking";

/**
 * Cross-sell (add-ons) and upsell (Rate Card offers) are presented HERE — in this same
 * confirmation email, right alongside the required-form links — rather than in the live chat
 * conversation. Each offer still worth presenting (i.e. not already selected/accepted during the
 * original booking) gets its own OfferEvents row + single-use accept/decline link, minted via
 * logOfferPresented, so the customer can respond on their own time without a live back-and-forth.
 * selectedAddonIds/acceptedOfferId/chatId/platform are all optional — callers that don't have
 * that context (e.g. a resend, or the waitlist-offer acceptance flow) simply get every currently
 * available add-on/offer presented, since nothing was already taken care of at booking time.
 */
async function buildPostBookingOfferLines(opts: {
  eventId: string;
  treatment: string;
  chatId?: string;
  clientId?: string;
  clientName: string;
  phone?: string;
  platform?: string;
  selectedAddonIds?: string[];
  acceptedOfferId?: string;
}): Promise<string[]> {
  try {
    const serviceId = await resolveServiceId(getSupabase(), opts.treatment).catch(() => null);
    if (!serviceId) return [];

    const [addOns, offers] = await Promise.all([
      listActiveAddonsForService(serviceId).catch(() => []),
      listServiceOffers(serviceId).catch(() => []),
    ]);
    const { price: basePrice } = await getServiceRateCardPricing(serviceId).catch(() => ({
      price: null,
      offers: [],
    }));
    const naturalPricing = resolvePricing(basePrice, offers);
    const post = computePostBookingOffers(
      addOns,
      opts.selectedAddonIds ?? [],
      naturalPricing.offer,
      opts.acceptedOfferId,
    );

    const [history, offeredEvents] = await Promise.all([
      getAppointmentHistoryForContact(
        { id: opts.clientId, phone: opts.phone, name: opts.clientName },
        { pastDays: RECENT_TREATMENT_WINDOW_DAYS + 7, futureDays: 0 },
      ).catch(() => ({ past: [] })),
      listOfferEventsForEvent(opts.eventId),
    ]);
    const recommendation = selectComplementaryTreatment({
      currentTreatmentName: opts.treatment,
      pairedCandidates: addOns,
      history: history.past.map((e) => ({ treatment: e.treatment, date: e.startTime })),
      selectedAddonIdsThisBooking: opts.selectedAddonIds ?? [],
      alreadyOfferedOrAcceptedAddonIds: offeredEvents
        .filter((o) => o.offerType === "CROSS_SELL")
        .map((o) => o.offerId),
      now: new Date(),
      recentWindowDays: RECENT_TREATMENT_WINDOW_DAYS,
    });

    if (!recommendation && !post.upsell) return [];

    const lines: string[] = ["", "You might also like:"];
    const chatId = opts.chatId ?? `email:${opts.eventId}`;

    if (recommendation) {
      const logged = await logOfferPresented({
        chatId,
        eventId: opts.eventId,
        clientId: opts.clientId,
        clientName: opts.clientName,
        clientContact: opts.phone,
        serviceId,
        offerId: recommendation.recommendedTreatmentId,
        offerType: "CROSS_SELL",
        offerName: recommendation.recommendedTreatmentName,
        offeredPrice: recommendation.price,
        basePrice: null,
        platform: opts.platform,
      });
      if (logged) {
        lines.push(
          `${recommendation.recommendedTreatmentName}${recommendation.price != null ? ` — $${recommendation.price}` : ""}: ${offerRespondUrl(logged.token)}`,
        );
      }
    }

    if (post.upsell) {
      const upsellPrice = resolvePricing(basePrice, [post.upsell]).finalPrice;
      const logged = await logOfferPresented({
        chatId,
        eventId: opts.eventId,
        clientId: opts.clientId,
        clientName: opts.clientName,
        clientContact: opts.phone,
        serviceId,
        offerId: post.upsell.id,
        offerType: "UPSELL",
        offerName: post.upsell.name,
        offeredPrice: upsellPrice,
        basePrice,
        platform: opts.platform,
      });
      if (logged) {
        lines.push(
          `${post.upsell.name}: normally $${basePrice}, now $${upsellPrice} — ${offerRespondUrl(logged.token)}`,
        );
      }
    }

    return lines.length > 2 ? lines : [];
  } catch (err) {
    console.error("[confirmation-email] buildPostBookingOfferLines failed:", err);
    return [];
  }
}

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
  chatId?: string;
  platform?: string;
  selectedAddonIds?: string[];
  acceptedOfferId?: string;
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
  const inHouseLinks = opts.eventId
    ? await getInHouseFormLinks(
        opts.treatment,
        opts.eventId,
        opts.startTime,
        opts.phone ?? "",
        opts.clientName,
        opts.clientId ?? null,
      ).catch(() => [] as InHouseFormLink[])
    : ([] as InHouseFormLink[]);

  if (opts.eventId && inHouseLinks.length > 0) {
    const serviceId = await resolveServiceId(getSupabase(), opts.treatment).catch(() => null);
    await trackRequiredForms({
      eventId: opts.eventId,
      serviceId,
      clientId: opts.clientId ?? null,
      inHouseLinks,
    }).catch((err) => console.error("[trackRequiredForms] failed:", err));
  }

  const offerLines = opts.eventId
    ? await buildPostBookingOfferLines({
        eventId: opts.eventId,
        treatment: opts.treatment,
        chatId: opts.chatId,
        clientId: opts.clientId,
        clientName: opts.clientName,
        phone: opts.phone,
        platform: opts.platform,
        selectedAddonIds: opts.selectedAddonIds,
        acceptedOfferId: opts.acceptedOfferId,
      })
    : [];

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
      ...formatInHouseFormLinks(inHouseLinks),
      ...offerLines,
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
