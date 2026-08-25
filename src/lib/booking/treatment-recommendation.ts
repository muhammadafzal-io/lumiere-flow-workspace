import { listActiveAddonsForService } from "@/lib/booking/recipe";
import { listOfferEventsForEvent } from "@/lib/booking/offer-events";
import { getAppointmentHistoryForContact } from "@/lib/integrations/google-calendar";

/** How far back a treatment still counts as "recently received" and gets excluded from
 * recommendation — matches the 30-day "recently ended" convention already used elsewhere
 * (resend-confirmation.ts's PAST_LOOKBACK_DAYS, the birthday-credit validity window). */
export const RECENT_TREATMENT_WINDOW_DAYS = 30;

export interface PairedTreatmentCandidate {
  id: string;
  name: string;
  price: number | null;
  durationMinutes: number;
  status: string;
  priority: number | null;
}

export interface TreatmentHistoryEntry {
  treatment: string;
  date: string;
}

export interface SelectComplementaryTreatmentInput {
  currentTreatmentName: string;
  pairedCandidates: PairedTreatmentCandidate[];
  history: TreatmentHistoryEntry[];
  selectedAddonIdsThisBooking: string[];
  alreadyOfferedOrAcceptedAddonIds: string[];
  now: Date;
  recentWindowDays: number;
}

export interface ComplementaryTreatmentRecommendation {
  recommendedTreatmentId: string;
  recommendedTreatmentName: string;
  reason: string;
  price: number | null;
  durationMinutes: number;
}

/**
 * Picks the single best complementary treatment to recommend, given a service's configured
 * pairings (ServiceAddons) and the patient's history — pure/no I/O, same split-from-DB-access
 * convention as computePostBookingOffers in offer-events.ts, so every rule below is unit-testable
 * without mocking Supabase.
 *
 * Excludes a candidate that is: inactive, the same treatment as what's currently being booked,
 * already selected as an add-on for this booking, already offered/accepted for this booking's
 * OfferEvents, or received within the last `recentWindowDays` days. Of what's left, ranks by
 * `priority` ascending (unranked/null sorts last), breaking ties alphabetically for determinism,
 * and returns the top match — or null if nothing qualifies. Never forces a recommendation.
 */
export function selectComplementaryTreatment(
  input: SelectComplementaryTreatmentInput,
): ComplementaryTreatmentRecommendation | null {
  const {
    currentTreatmentName,
    pairedCandidates,
    history,
    selectedAddonIdsThisBooking,
    alreadyOfferedOrAcceptedAddonIds,
    now,
    recentWindowDays,
  } = input;

  const selectedSet = new Set(selectedAddonIdsThisBooking);
  const offeredSet = new Set(alreadyOfferedOrAcceptedAddonIds);
  const cutoffMs = now.getTime() - recentWindowDays * 86_400_000;
  const recentTreatmentNames = new Set(
    history
      .filter((h) => new Date(h.date).getTime() >= cutoffMs)
      .map((h) => h.treatment.trim().toLowerCase()),
  );
  const currentLower = currentTreatmentName.trim().toLowerCase();

  const eligible = pairedCandidates.filter((c) => {
    if (c.status !== "Active") return false;
    if (c.name.trim().toLowerCase() === currentLower) return false;
    if (selectedSet.has(c.id)) return false;
    if (offeredSet.has(c.id)) return false;
    if (recentTreatmentNames.has(c.name.trim().toLowerCase())) return false;
    return true;
  });

  if (eligible.length === 0) return null;

  eligible.sort((a, b) => {
    const pa = a.priority ?? Number.POSITIVE_INFINITY;
    const pb = b.priority ?? Number.POSITIVE_INFINITY;
    if (pa !== pb) return pa - pb;
    return a.name.localeCompare(b.name);
  });

  const best = eligible[0];
  return {
    recommendedTreatmentId: best.id,
    recommendedTreatmentName: best.name,
    reason: `Complements ${currentTreatmentName}`,
    price: best.price,
    durationMinutes: best.durationMinutes,
  };
}

/**
 * DB-facing wrapper: gathers a service's configured pairings, the patient's recent treatment
 * history, and what's already been offered for this booking, then delegates to
 * selectComplementaryTreatment. This is the single entry point the Cross-Sell/Upsell flow (see
 * buildPostBookingOfferLines in confirmation-email.ts) and any other future caller should use —
 * never throws, returns null on any failure since a recommendation is an enhancement, not a
 * booking-blocking concern.
 */
export async function recommendComplementaryTreatment(opts: {
  eventId: string;
  currentServiceIdOrName: string;
  clientId?: string | null;
  phone?: string;
  clientName?: string;
  selectedAddonIdsThisBooking?: string[];
}): Promise<ComplementaryTreatmentRecommendation | null> {
  try {
    const [pairedAddons, history, offeredEvents] = await Promise.all([
      listActiveAddonsForService(opts.currentServiceIdOrName),
      getAppointmentHistoryForContact(
        { id: opts.clientId ?? undefined, phone: opts.phone, name: opts.clientName },
        { pastDays: RECENT_TREATMENT_WINDOW_DAYS + 7, futureDays: 0 },
      ).catch(() => ({ past: [] })),
      listOfferEventsForEvent(opts.eventId),
    ]);

    return selectComplementaryTreatment({
      currentTreatmentName: opts.currentServiceIdOrName,
      pairedCandidates: pairedAddons,
      history: history.past.map((e) => ({ treatment: e.treatment, date: e.startTime })),
      selectedAddonIdsThisBooking: opts.selectedAddonIdsThisBooking ?? [],
      alreadyOfferedOrAcceptedAddonIds: offeredEvents
        .filter((o) => o.offerType === "CROSS_SELL")
        .map((o) => o.offerId),
      now: new Date(),
      recentWindowDays: RECENT_TREATMENT_WINDOW_DAYS,
    });
  } catch (err) {
    console.error("[treatment-recommendation] recommendComplementaryTreatment failed:", err);
    return null;
  }
}
