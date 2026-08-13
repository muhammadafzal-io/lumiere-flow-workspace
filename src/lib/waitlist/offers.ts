/**
 * Lifecycle for a single WaitlistOffer: read by token (customer-facing accept page), accept
 * (books the real appointment via bookAppointment — the same authoritative, race-safe
 * availability check every other booking path uses), and decline. Both accept-failure ("someone
 * else got it first") and decline immediately advance to the next matching candidate via
 * offerSlotToWaitlist, the same function the initial cancellation/reschedule hook and the
 * expiry sweep call.
 */
import { getSupabase } from "@/lib/supabase";
import { logEvent } from "@/lib/integrations/activity-log";
import { bookAppointment, BookingWarningsError } from "@/lib/services/booking-service";
import { sendBookingConfirmationEmail } from "@/lib/booking/confirmation-email";
import { cancelCalendarEvent } from "@/lib/integrations/google-calendar";
import { getWaitlistEntryById, markWaitlistBooked } from "@/lib/waitlist/store";
import { mapOfferRow, type WaitlistOffer } from "@/lib/waitlist/offer-types";
import { offerSlotToWaitlist, type FreedSlot } from "@/lib/waitlist/matching";

const TABLE = "WaitlistOffers";

export type AcceptResult =
  | { ok: true; eventId: string }
  | {
      ok: false;
      error: string;
      code: "not_found" | "expired" | "already_responded" | "slot_taken";
    };

/** Lazy expiry, same pattern as FormResponses/BookingCompletions: the DB only ever stores
 * `pending` until something actively transitions it — `expired` is computed at read-time so a
 * page view never needs to write. Something still has to DO the transition (and advance to the
 * next candidate) eventually, which is what markExpiredAndAdvance below is for. */
function isLazilyExpired(offer: WaitlistOffer): boolean {
  return offer.status === "pending" && new Date(offer.expiresAt).getTime() < Date.now();
}

function offerToFreedSlot(offer: WaitlistOffer): FreedSlot {
  return {
    treatment: offer.treatment,
    serviceId: offer.serviceId,
    startTime: offer.slotStart,
    endTime: offer.slotEnd,
    practitionerName: offer.practitionerName,
    room: offer.room,
    equipment: offer.equipment,
    sourceEventId: offer.sourceEventId,
  };
}

async function markExpiredAndAdvance(
  offer: WaitlistOffer,
  sb: ReturnType<typeof getSupabase>,
): Promise<void> {
  await sb
    .from(TABLE)
    .update({ status: "expired", responded_at: new Date().toISOString() })
    .eq("id", offer.id)
    .eq("status", "pending");
  await offerSlotToWaitlist(offerToFreedSlot(offer));
}

/** Customer-facing read, used by the public /waitlist/accept/[token] page. */
export async function getOfferByToken(token: string): Promise<WaitlistOffer | null> {
  const sb = getSupabase();
  const { data } = await sb.from(TABLE).select("*").eq("token", token).maybeSingle();
  if (!data) return null;
  const offer = mapOfferRow(data);
  return isLazilyExpired(offer) ? { ...offer, status: "expired" } : offer;
}

export async function acceptWaitlistOffer(token: string): Promise<AcceptResult> {
  const sb = getSupabase();
  const { data } = await sb.from(TABLE).select("*").eq("token", token).maybeSingle();
  if (!data) return { ok: false, error: "This link is invalid.", code: "not_found" };
  const offer = mapOfferRow(data);

  if (isLazilyExpired(offer)) {
    await markExpiredAndAdvance(offer, sb).catch((err) =>
      console.error("[acceptWaitlistOffer] expire+advance failed:", err),
    );
    return { ok: false, error: "This offer has expired.", code: "expired" };
  }
  if (offer.status !== "pending") {
    return {
      ok: false,
      error: "This offer has already been responded to.",
      code: "already_responded",
    };
  }

  const entry = await getWaitlistEntryById(offer.waitlistId);
  if (!entry) return { ok: false, error: "This offer could not be found.", code: "not_found" };

  try {
    const result = await bookAppointment({
      clientName: entry.clientName,
      clientContact: entry.clientPhone ?? "",
      clientEmail: entry.clientEmail ?? undefined,
      clientId: entry.clientId,
      treatment: offer.treatment,
      startTime: offer.slotStart,
      endTime: offer.slotEnd,
      practitionerName: offer.practitionerName ?? "",
      room: offer.room ?? "",
      equipment: offer.equipment,
      source: "admin",
    });

    // bookAppointment deliberately snaps to the closest available slot within one duration
    // window's tolerance rather than failing outright, to be forgiving of AI-computed imprecise
    // times (see its own comment). That's the wrong behavior here: the customer accepted a
    // specific advertised time, so silently landing them on a different one without confirmation
    // isn't acceptable. Undo the mistimed booking and fall into the same "slot taken" handling
    // below via a synthetic throw, so that supersede-and-advance logic only needs to live once.
    const bookedAtOfferedTime =
      new Date(result.startTime).getTime() === new Date(offer.slotStart).getTime();
    if (!bookedAtOfferedTime) {
      await cancelCalendarEvent(result.id).catch((err) =>
        console.error("[acceptWaitlistOffer] rollback of mistimed booking failed:", err),
      );
      throw new Error("This exact time is no longer available.");
    }

    await sb
      .from(TABLE)
      .update({
        status: "accepted",
        responded_at: new Date().toISOString(),
        booked_event_id: result.id,
      })
      .eq("id", offer.id)
      .eq("status", "pending");
    await markWaitlistBooked(offer.waitlistId, result.id);

    if (entry.clientEmail) {
      await sendBookingConfirmationEmail({
        to: entry.clientEmail,
        clientName: entry.clientName,
        treatment: offer.treatment,
        startTime: offer.slotStart,
        practitionerName: offer.practitionerName ?? result.practitionerName,
        clientId: entry.clientId,
        phone: entry.clientPhone ?? undefined,
        eventId: result.id,
      }).catch((err) => console.error("[acceptWaitlistOffer] confirmation email failed:", err));
    }

    await logEvent(
      "waitlist",
      entry.clientName,
      `Waitlist offer accepted, booking created for ${offer.treatment}`,
      { clientId: entry.clientId, phone: entry.clientPhone ?? undefined },
    ).catch(() => undefined);

    return { ok: true, eventId: result.id };
  } catch (err) {
    await sb
      .from(TABLE)
      .update({ status: "superseded", responded_at: new Date().toISOString() })
      .eq("id", offer.id)
      .eq("status", "pending");

    await logEvent(
      "waitlist",
      entry.clientName,
      `Waitlist offer superseded — slot no longer available for ${offer.treatment}`,
      { clientId: entry.clientId, phone: entry.clientPhone ?? undefined },
    ).catch(() => undefined);

    await offerSlotToWaitlist(offerToFreedSlot(offer)).catch((e) =>
      console.error("[acceptWaitlistOffer] re-offer failed:", e),
    );

    const message =
      err instanceof BookingWarningsError ? err.warnings.join(" ") : "This slot was just taken.";
    return { ok: false, error: message, code: "slot_taken" };
  }
}

export async function declineWaitlistOffer(
  token: string,
): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase();
  const { data } = await sb.from(TABLE).select("*").eq("token", token).maybeSingle();
  if (!data) return { ok: false, error: "This link is invalid." };
  const offer = mapOfferRow(data);

  if (isLazilyExpired(offer)) {
    await markExpiredAndAdvance(offer, sb).catch((err) =>
      console.error("[declineWaitlistOffer] expire+advance failed:", err),
    );
    return { ok: false, error: "This offer has already expired." };
  }
  if (offer.status !== "pending") {
    return { ok: false, error: "This offer has already been responded to." };
  }

  const { error } = await sb
    .from(TABLE)
    .update({ status: "declined", responded_at: new Date().toISOString() })
    .eq("id", offer.id)
    .eq("status", "pending");
  if (error) return { ok: false, error: "Something went wrong. Please try again." };

  const entry = await getWaitlistEntryById(offer.waitlistId);
  await logEvent(
    "waitlist",
    entry?.clientName ?? "—",
    `Waitlist offer declined for ${offer.treatment}`,
    { clientId: entry?.clientId, phone: entry?.clientPhone ?? undefined },
  ).catch(() => undefined);

  await offerSlotToWaitlist(offerToFreedSlot(offer)).catch((err) =>
    console.error("[declineWaitlistOffer] re-offer failed:", err),
  );

  return { ok: true };
}
