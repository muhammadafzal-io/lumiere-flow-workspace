import { getSupabase } from "@/lib/supabase";
import type { RetentionResult } from "@/types";
import type { ServiceAddonRow } from "@/lib/booking/recipe";
import type { ServiceOfferRow } from "@/lib/booking/offer-pricing";

const TABLE = "OfferEvents";

export type OfferEventType = "CROSS_SELL" | "UPSELL";
export type OfferEventStatus = "PRESENTED" | "ACCEPTED" | "DECLINED" | "NO_RESPONSE";

export interface OfferEventRow {
  id: string;
  chatId: string;
  clientId: string | null;
  clientName: string | null;
  clientContact: string | null;
  eventId: string | null;
  serviceId: string | null;
  offerId: string;
  offerType: OfferEventType;
  offerName: string;
  offeredPrice: number | null;
  basePrice: number | null;
  status: OfferEventStatus;
  platform: string | null;
  respondedAt: string | null;
  createdAt: string;
}

function mapRow(r: any): OfferEventRow {
  return {
    id: r.id,
    chatId: r.chat_id,
    clientId: r.client_id ?? null,
    clientName: r.client_name ?? null,
    clientContact: r.client_contact ?? null,
    eventId: r.event_id ?? null,
    serviceId: r.service_id ?? null,
    offerId: r.offer_id,
    offerType: r.offer_type,
    offerName: r.offer_name,
    offeredPrice: r.offered_price === null ? null : Number(r.offered_price),
    basePrice: r.base_price === null ? null : Number(r.base_price),
    status: r.status,
    platform: r.platform ?? null,
    respondedAt: r.responded_at ?? null,
    createdAt: r.created_at,
  };
}

/**
 * Decides which of a booked service's active add-ons/offer are still worth presenting
 * post-booking — pulled out as a pure function (no DB access) so "don't re-offer something
 * already taken care of during the original booking" is unit-testable on its own, same split as
 * resolveSelectedAddons/resolvePricing elsewhere in src/lib/booking. An add-on already in
 * `alreadySelectedAddonIds` (the client added it during the original booking call) is excluded;
 * the offer is excluded if its id matches `alreadyAcceptedOfferId`.
 */
export function computePostBookingOffers(
  availableAddOns: ServiceAddonRow[],
  alreadySelectedAddonIds: string[],
  availableOffer: ServiceOfferRow | null,
  alreadyAcceptedOfferId: string | undefined,
): { crossSell: ServiceAddonRow[]; upsell: ServiceOfferRow | null } {
  const selectedSet = new Set(alreadySelectedAddonIds);
  const crossSell = availableAddOns.filter((a) => !selectedSet.has(a.id));
  const upsell =
    availableOffer && availableOffer.id !== alreadyAcceptedOfferId ? availableOffer : null;
  return { crossSell, upsell };
}

/**
 * Logs one offer as PRESENTED — called once a booking is confirmed and its required forms have
 * been sent, at the exact point book_appointment embeds the offer in its result and directs the
 * AI to relay it alongside the form-link message (see agent/index.ts's book_appointment handler).
 * Deduped on (event_id, offer_id): this booking has already seen this exact offer once, so a
 * later re-check (e.g. a resend) won't spam a duplicate PRESENTED row. Never throws — offer
 * tracking is an analytics enhancement, not a booking-blocking concern.
 */
export async function logOfferPresented(input: {
  chatId: string;
  eventId: string;
  clientId?: string | null;
  clientName?: string;
  clientContact?: string;
  serviceId: string | null;
  offerId: string;
  offerType: OfferEventType;
  offerName: string;
  offeredPrice: number | null;
  basePrice: number | null;
  platform?: string;
}): Promise<void> {
  try {
    const sb = getSupabase();
    const { data: existing } = await sb
      .from(TABLE)
      .select("id")
      .eq("event_id", input.eventId)
      .eq("offer_id", input.offerId)
      .maybeSingle();
    if (existing) return;

    const { error } = await sb.from(TABLE).insert({
      chat_id: input.chatId,
      event_id: input.eventId,
      client_id: input.clientId ?? null,
      client_name: input.clientName ?? null,
      client_contact: input.clientContact ?? null,
      service_id: input.serviceId,
      offer_id: input.offerId,
      offer_type: input.offerType,
      offer_name: input.offerName,
      offered_price: input.offeredPrice,
      base_price: input.basePrice,
      status: "PRESENTED",
      platform: input.platform ?? null,
    });
    if (error) console.error("[offer-events] logOfferPresented failed:", error.message);
  } catch (err) {
    console.error("[offer-events] logOfferPresented failed:", err);
  }
}

/** The open (PRESENTED) offer event for one specific booking + offer, if any — looked up before
 * accepting/declining so apply_post_booking_offer can confirm this was actually presented (and
 * isn't already resolved) rather than trusting the AI's say-so blindly. */
export async function findOfferEvent(
  eventId: string,
  offerId: string,
): Promise<OfferEventRow | null> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from(TABLE)
    .select("*")
    .eq("event_id", eventId)
    .eq("offer_id", offerId)
    .maybeSingle();
  if (error) throw new Error(`findOfferEvent: ${error.message}`);
  return data ? mapRow(data) : null;
}

/**
 * Records the client's explicit response to a post-booking offer — ACCEPTED or DECLINED, never
 * inferred. Only transitions a row that's still PRESENTED (an already-resolved offer can't be
 * re-answered, which is also what keeps "don't offer the same offer twice" honest at the write
 * layer, not just the presentation layer). Returns false if there was nothing open to update.
 */
export async function recordOfferResponse(
  eventId: string,
  offerId: string,
  accepted: boolean,
): Promise<boolean> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from(TABLE)
    .update({ status: accepted ? "ACCEPTED" : "DECLINED", responded_at: new Date().toISOString() })
    .eq("event_id", eventId)
    .eq("offer_id", offerId)
    .eq("status", "PRESENTED")
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`recordOfferResponse: ${error.message}`);
  return !!data;
}

/** Sweeps PRESENTED offer events whose conversation went quiet — rides the existing daily
 * waitlist-sweep cron (Vercel Hobby-plan only allows one cron job) rather than a new schedule,
 * same reasoning as runWaitlistExpirySweepFlow. 24h is a deliberately generous cutoff: a chat
 * session has no explicit "ended" signal, so this only fires for conversations that are very
 * unlikely to still be active. */
export async function runOfferEventsNoResponseSweepFlow(): Promise<RetentionResult> {
  const sb = getSupabase();
  const cutoff = new Date(Date.now() - 24 * 60 * 60_000).toISOString();

  const { data, error } = await sb
    .from(TABLE)
    .select("id")
    .eq("status", "PRESENTED")
    .lt("created_at", cutoff);
  if (error) throw new Error(`runOfferEventsNoResponseSweepFlow: ${error.message}`);

  const ids = (data ?? []).map((r: any) => r.id);
  if (ids.length > 0) {
    const { error: updateError } = await sb
      .from(TABLE)
      .update({ status: "NO_RESPONSE", responded_at: new Date().toISOString() })
      .in("id", ids)
      .eq("status", "PRESENTED");
    if (updateError) throw new Error(`runOfferEventsNoResponseSweepFlow: ${updateError.message}`);
  }

  return { sent: ids.length, skipped: 0, failed: 0, details: [] };
}
