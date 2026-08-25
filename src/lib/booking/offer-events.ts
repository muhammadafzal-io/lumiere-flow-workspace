import crypto from "crypto";
import { getSupabase } from "@/lib/supabase";
import { getAppBaseUrl } from "@/lib/client-channels";
import type { RetentionResult } from "@/types";
import type { ServiceAddonRow } from "@/lib/booking/recipe";
import type { ServiceOfferRow } from "@/lib/booking/offer-pricing";

const TABLE = "OfferEvents";

/** Never outlives more than a day, and never longer than this cutoff regardless — kept aligned
 * with runOfferEventsNoResponseSweepFlow's cutoff so a token's own expiry and "when does this
 * silently become NO_RESPONSE" always agree. */
const OFFER_LINK_WINDOW_MS = 24 * 60 * 60_000;

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
  token: string | null;
  expiresAt: string | null;
  respondedAt: string | null;
  createdAt: string;
}

export function mapOfferEventRow(r: any): OfferEventRow {
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
    token: r.token ?? null,
    expiresAt: r.expires_at ?? null,
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
 * Logs one offer as PRESENTED and mints its accept/decline link's token — called from
 * sendBookingConfirmationEmail at the exact moment the offer is embedded in the confirmation
 * email alongside the required-form links (see confirmation-email.ts). Deduped on
 * (event_id, offer_id): a resend of the confirmation email reuses the SAME token/link rather than
 * minting a new one and orphaning the old, and an offer that's already been responded to is never
 * re-logged as open. Never throws — offer tracking is an analytics enhancement, not a
 * booking-blocking concern; returns null on any failure or once already resolved.
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
}): Promise<{ token: string } | null> {
  try {
    const sb = getSupabase();
    const { data: existing } = await sb
      .from(TABLE)
      .select("id, token, status")
      .eq("event_id", input.eventId)
      .eq("offer_id", input.offerId)
      .maybeSingle();
    if (existing) {
      return existing.status === "PRESENTED" && existing.token ? { token: existing.token } : null;
    }

    const token = crypto.randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + OFFER_LINK_WINDOW_MS).toISOString();

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
      token,
      expires_at: expiresAt,
    });
    if (error) {
      console.error("[offer-events] logOfferPresented failed:", error.message);
      return null;
    }
    return { token };
  } catch (err) {
    console.error("[offer-events] logOfferPresented failed:", err);
    return null;
  }
}

/** All OfferEvents rows logged against a given appointment, regardless of status — used by the
 * complementary-treatment recommendation to avoid re-offering something already presented (in any
 * outcome) for this same booking. */
export async function listOfferEventsForEvent(eventId: string): Promise<OfferEventRow[]> {
  if (!eventId?.trim()) return [];
  try {
    const sb = getSupabase();
    const { data, error } = await sb.from(TABLE).select("*").eq("event_id", eventId);
    if (error) throw new Error(error.message);
    return (data ?? []).map(mapOfferEventRow);
  } catch (err) {
    console.error("[offer-events] listOfferEventsForEvent failed:", err);
    return [];
  }
}

export function offerRespondUrl(token: string): string {
  return `${getAppBaseUrl()}/offers/respond/${token}`;
}

/** Sweeps PRESENTED offer events whose link has expired unanswered — rides the existing daily
 * waitlist-sweep cron (Vercel Hobby-plan only allows one cron job) rather than a new schedule,
 * same reasoning as runWaitlistExpirySweepFlow. */
export async function runOfferEventsNoResponseSweepFlow(): Promise<RetentionResult> {
  const sb = getSupabase();

  const { data, error } = await sb
    .from(TABLE)
    .select("id")
    .eq("status", "PRESENTED")
    .lt("expires_at", new Date().toISOString());
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
