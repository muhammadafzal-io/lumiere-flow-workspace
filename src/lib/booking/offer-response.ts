/**
 * Lifecycle for a single post-booking offer (OfferEvents row): read by token (customer-facing
 * /offers/respond/[token] page), accept (applies the add-on/offer to the already-confirmed
 * booking), and decline. Mirrors src/lib/waitlist/offers.ts's shape closely — same
 * token/lazy-expiry/status conventions, adapted for "modify an existing booking" instead of
 * "create a new one."
 */
import { getSupabase } from "@/lib/supabase";
import { logEvent } from "@/lib/integrations/activity-log";
import {
  getCalendarBookingDetails,
  rescheduleCalendarEvent,
  patchCalendarBookingFields,
} from "@/lib/integrations/google-calendar";
import { canExtendAppointment } from "@/lib/services/booking-service";
import {
  listActiveAddonsForService,
  listServiceOffers,
  getServiceRateCardPricing,
  getInHouseFormLinks,
  formatInHouseFormLinks,
  formLinksToCtas,
} from "@/lib/booking/recipe";
import {
  resolvePricing,
  buildBookingPricingSummary,
  mergeNotesWithPricingSummary,
} from "@/lib/booking/offer-pricing";
import {
  mapOfferEventRow,
  listOfferEventsForEvent,
  type OfferEventRow,
} from "@/lib/booking/offer-events";
import { sendRetentionEmail } from "@/lib/integrations/email";

const TABLE = "OfferEvents";

/**
 * Rebuilds the ONE consolidated pricing summary from every currently-ACCEPTED OfferEvents row for
 * this booking (not just the one just accepted) and writes it into the calendar event's notes,
 * replacing any prior auto-generated summary. Called after marking the just-accepted row ACCEPTED,
 * so it's included in this pass — this is what keeps an add-on accepted at booking time and an
 * offer accepted later (or vice versa) from each independently appending their own conflicting
 * "Price:" fragment; there's only ever one current summary, always reflecting the full picture.
 */
async function rebuildAndPatchBookingNotes(opts: {
  eventId: string;
  currentNotes: string;
  treatment: string;
}): Promise<void> {
  const [allOfferEvents, addOnCandidates, offerCandidates, { price: basePrice }] =
    await Promise.all([
      listOfferEventsForEvent(opts.eventId),
      listActiveAddonsForService(opts.treatment).catch(() => []),
      listServiceOffers(opts.treatment).catch(() => []),
      getServiceRateCardPricing(opts.treatment).catch(() => ({ price: null, offers: [] })),
    ]);

  const accepted = allOfferEvents.filter((o) => o.status === "ACCEPTED");
  const acceptedAddons = accepted
    .filter((o) => o.offerType === "CROSS_SELL")
    .map((o) => addOnCandidates.find((a) => a.id === o.offerId))
    .filter((a): a is NonNullable<typeof a> => !!a)
    .map((a) => ({ name: a.name, price: a.price }));
  const acceptedUpsellEvent = accepted.find((o) => o.offerType === "UPSELL");
  const acceptedOffer = acceptedUpsellEvent
    ? (offerCandidates.find((o) => o.id === acceptedUpsellEvent.offerId) ?? null)
    : null;

  const summary = buildBookingPricingSummary({
    basePrice,
    offer: acceptedOffer,
    addons: acceptedAddons,
  });
  const newNotes = mergeNotesWithPricingSummary(opts.currentNotes, summary);
  await patchCalendarBookingFields(opts.eventId, { notes: newNotes });
}

export type AcceptOfferResult =
  | { ok: true; message: string }
  | {
      ok: false;
      error: string;
      code: "not_found" | "expired" | "already_responded" | "unavailable";
    };

function isLazilyExpired(offer: OfferEventRow): boolean {
  return (
    offer.status === "PRESENTED" &&
    !!offer.expiresAt &&
    new Date(offer.expiresAt).getTime() < Date.now()
  );
}

/** Customer-facing read, used by the public /offers/respond/[token] page. */
export async function getOfferEventByToken(token: string): Promise<OfferEventRow | null> {
  const sb = getSupabase();
  const { data } = await sb.from(TABLE).select("*").eq("token", token).maybeSingle();
  if (!data) return null;
  const offer = mapOfferEventRow(data);
  return isLazilyExpired(offer) ? { ...offer, status: "NO_RESPONSE" } : offer;
}

export async function acceptOfferEvent(token: string): Promise<AcceptOfferResult> {
  const sb = getSupabase();
  const { data } = await sb.from(TABLE).select("*").eq("token", token).maybeSingle();
  if (!data) return { ok: false, error: "This link is invalid.", code: "not_found" };
  const offer = mapOfferEventRow(data);

  if (isLazilyExpired(offer)) {
    await Promise.resolve(
      sb
        .from(TABLE)
        .update({ status: "NO_RESPONSE", responded_at: new Date().toISOString() })
        .eq("id", offer.id)
        .eq("status", "PRESENTED"),
    ).catch(() => undefined);
    return { ok: false, error: "This offer has expired.", code: "expired" };
  }
  if (offer.status !== "PRESENTED") {
    return {
      ok: false,
      error: "This offer has already been responded to.",
      code: "already_responded",
    };
  }
  if (!offer.eventId) {
    return { ok: false, error: "This offer could not be found.", code: "not_found" };
  }

  try {
    const booking = await getCalendarBookingDetails(offer.eventId);

    if (offer.offerType === "CROSS_SELL") {
      const addOns = await listActiveAddonsForService(booking.treatment).catch(() => []);
      const addon = addOns.find((a) => a.id === offer.offerId);
      if (!addon) {
        return {
          ok: false,
          error: "This add-on is no longer available.",
          code: "unavailable",
        };
      }

      const newEndTime = new Date(
        new Date(booking.endTime).getTime() + addon.durationMinutes * 60_000,
      ).toISOString();
      const conflict = await canExtendAppointment({
        eventId: offer.eventId,
        date: booking.startTime.split("T")[0],
        startTime: booking.startTime,
        newEndTime,
        room: booking.room,
        practitionerName: booking.practitionerName,
      });
      if (!conflict.ok) {
        return {
          ok: false,
          error: `Sorry, we can't fit this into your appointment — ${conflict.reason} Please contact the clinic to reschedule if you'd still like to add it.`,
          code: "unavailable",
        };
      }

      await rescheduleCalendarEvent(offer.eventId, booking.startTime, newEndTime);

      await sb
        .from(TABLE)
        .update({ status: "ACCEPTED", responded_at: new Date().toISOString() })
        .eq("id", offer.id)
        .eq("status", "PRESENTED");

      await rebuildAndPatchBookingNotes({
        eventId: offer.eventId,
        currentNotes: booking.notes,
        treatment: booking.treatment,
      });

      await logEvent(
        "booking",
        offer.clientName ?? booking.clientName,
        `Post-booking add-on accepted: ${addon.name} ($${addon.price ?? "—"})`,
        { clientId: offer.clientId ?? undefined, phone: offer.clientContact ?? undefined },
      ).catch(() => undefined);

      // The add-on is a real Service (see ServiceAddonLinks) — reuse the same in-house
      // form-assignment lookup the original booking confirmation uses, scoped to the add-on's own
      // service id, so its own required consent form (if any) gets sent now that it's been
      // explicitly accepted — never before, per the "no form for a declined/unrequested add-on"
      // rule.
      const addonForms = await getInHouseFormLinks(
        addon.id,
        offer.eventId,
        booking.startTime,
        offer.clientContact || booking.clientContact,
        offer.clientName || booking.clientName,
        offer.clientId,
      ).catch(() => []);

      if (addonForms.length > 0 && booking.clientEmail) {
        await sendRetentionEmail({
          to: booking.clientEmail,
          subject: `Please complete your ${addon.name} form`,
          text: [
            `Hi ${offer.clientName ?? booking.clientName},`,
            "",
            `${addon.name} has been added to your appointment. Please complete the form below before your visit.`,
            ...formatInHouseFormLinks(addonForms),
          ].join("\n"),
          flowType: "booking",
          logMeta: {
            category: "booking",
            triggerType: "system",
            sourceId: offer.eventId,
            sourceName: `${addon.name} consent form`,
            clientId: offer.clientId ?? undefined,
            clientName: offer.clientName ?? booking.clientName,
          },
          ctas: formLinksToCtas(addonForms),
        }).catch((err) => console.error("[acceptOfferEvent] addon form email failed:", err));
      }

      return {
        ok: true,
        message: [
          `${addon.name} has been added to your appointment${addon.price != null ? ` for $${addon.price}` : ""}.`,
          ...(addonForms.length > 0
            ? [
                `Please complete the following before your visit: ${addonForms
                  .map((f) => `${f.formName} (${f.url})`)
                  .join(", ")}`,
              ]
            : []),
        ].join(" "),
      };
    }

    // UPSELL
    const offers = await listServiceOffers(booking.treatment).catch(() => []);
    const matchedOffer = offers.find((o) => o.id === offer.offerId);
    const { price: basePrice } = await getServiceRateCardPricing(booking.treatment).catch(() => ({
      price: null,
      offers: [],
    }));
    const pricing = matchedOffer ? resolvePricing(basePrice, [matchedOffer]) : null;
    if (!matchedOffer || !pricing?.offer) {
      return { ok: false, error: "This offer is no longer available.", code: "unavailable" };
    }

    await sb
      .from(TABLE)
      .update({ status: "ACCEPTED", responded_at: new Date().toISOString() })
      .eq("id", offer.id)
      .eq("status", "PRESENTED");

    await rebuildAndPatchBookingNotes({
      eventId: offer.eventId,
      currentNotes: booking.notes,
      treatment: booking.treatment,
    });

    await logEvent(
      "booking",
      offer.clientName ?? booking.clientName,
      `Post-booking offer accepted: ${matchedOffer.name} — new price $${pricing.finalPrice}`,
      { clientId: offer.clientId ?? undefined, phone: offer.clientContact ?? undefined },
    ).catch(() => undefined);

    return {
      ok: true,
      message: `${matchedOffer.name} has been applied — your new price is $${pricing.finalPrice} (was $${pricing.basePrice}).`,
    };
  } catch (err) {
    console.error("[acceptOfferEvent] failed:", err);
    return {
      ok: false,
      error: "Something went wrong applying this offer. Please contact the clinic directly.",
      code: "unavailable",
    };
  }
}

export async function declineOfferEvent(token: string): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase();
  const { data } = await sb.from(TABLE).select("*").eq("token", token).maybeSingle();
  if (!data) return { ok: false, error: "This link is invalid." };
  const offer = mapOfferEventRow(data);

  if (isLazilyExpired(offer)) {
    await Promise.resolve(
      sb
        .from(TABLE)
        .update({ status: "NO_RESPONSE", responded_at: new Date().toISOString() })
        .eq("id", offer.id)
        .eq("status", "PRESENTED"),
    ).catch(() => undefined);
    return { ok: false, error: "This offer has already expired." };
  }
  if (offer.status !== "PRESENTED") {
    return { ok: false, error: "This offer has already been responded to." };
  }

  const { error } = await sb
    .from(TABLE)
    .update({ status: "DECLINED", responded_at: new Date().toISOString() })
    .eq("id", offer.id)
    .eq("status", "PRESENTED");
  if (error) return { ok: false, error: "Something went wrong. Please try again." };

  await logEvent(
    "booking",
    offer.clientName ?? "—",
    `Post-booking offer declined: ${offer.offerName}`,
    { clientId: offer.clientId ?? undefined, phone: offer.clientContact ?? undefined },
  ).catch(() => undefined);

  return { ok: true };
}
