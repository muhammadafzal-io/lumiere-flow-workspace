/**
 * Turns raw OfferEvents history into a per-offer performance verdict — "is this add-on/discount
 * actually working, and why." Pure and DB-free (mirrors resolvePricing/buildBookingPricingSummary's
 * split) so the rules driving each verdict are unit-testable and auditable on their own, separate
 * from src/lib/booking/offer-events.ts's DB read (listAllOfferEvents).
 *
 * Deliberately rules-based rather than a black-box score: a boutique clinic's admin needs to see
 * WHY a label was assigned, in terms of numbers they can check themselves, not trust a model's
 * word for it. Every reason string cites the actual counts/rates that produced it.
 */
import type { OfferEventRow, OfferEventType } from "@/lib/booking/offer-events";

export type OfferVerdictLabel = "good" | "mixed" | "underperforming" | "insufficient_data";

export interface OfferVerdict {
  label: OfferVerdictLabel;
  reasons: string[];
}

export interface ServiceBreakdown {
  serviceId: string | null;
  presented: number;
  accepted: number;
  declined: number;
  noResponse: number;
}

export interface OfferPerformanceSummary {
  offerId: string;
  offerType: OfferEventType;
  offerName: string;
  presented: number;
  accepted: number;
  declined: number;
  noResponse: number;
  acceptanceRate: number;
  responseRate: number;
  /** Sum of offeredPrice across accepted events — actual revenue this offer/add-on brought in. */
  revenueCaptured: number;
  /** UPSELL only: sum of (basePrice - offeredPrice) across accepted events — margin given up. */
  discountGiven: number;
  /** UPSELL only: average discount depth, as a percentage, across accepted events. */
  avgDiscountPct: number | null;
  firstPresentedAt: string;
  lastPresentedAt: string;
  byService: ServiceBreakdown[];
  verdict: OfferVerdict;
}

/** Below this many presentations, a verdict would just be noise — not enough samples to trust a
 * rate. Deliberately a plain constant (not a Settings field) — a boutique clinic's offer volume is
 * low enough that this rarely needs tuning; easy to promote to Settings later if it does. */
const MIN_SAMPLE_SIZE = 10;
/** At or above this acceptance rate, an offer is pulling its weight. */
const GOOD_ACCEPTANCE_RATE = 0.2;
/** At or below this acceptance rate (with enough samples), an offer isn't landing. */
const POOR_ACCEPTANCE_RATE = 0.05;
/** Below this response rate, a poor acceptance rate more likely reflects timing/visibility than
 * the offer itself — most people never even reacted to it, rather than actively declining it. */
const LOW_RESPONSE_RATE = 0.3;
/** A discount this deep, combined with very high acceptance, is worth a second look — it may be
 * converting people who'd have paid full price anyway rather than winning hesitant ones over. */
const DEEP_DISCOUNT_PCT = 25;
const HIGH_ACCEPTANCE_FOR_DISCOUNT_CAUTION = 0.6;

function pct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

function computeVerdict(input: {
  offerType: OfferEventType;
  presented: number;
  accepted: number;
  declined: number;
  acceptanceRate: number;
  responseRate: number;
  avgDiscountPct: number | null;
}): OfferVerdict {
  const { offerType, presented, accepted, declined, acceptanceRate, responseRate, avgDiscountPct } =
    input;

  if (presented < MIN_SAMPLE_SIZE) {
    return {
      label: "insufficient_data",
      reasons: [
        `Only presented ${presented} time${presented === 1 ? "" : "s"} so far — need at least ${MIN_SAMPLE_SIZE} before a verdict is reliable.`,
      ],
    };
  }

  if (acceptanceRate >= GOOD_ACCEPTANCE_RATE) {
    const reasons = [
      `Accepted ${pct(acceptanceRate)} of the time (${accepted}/${presented}) — comfortably above a typical ${pct(GOOD_ACCEPTANCE_RATE)} baseline.`,
    ];
    if (
      offerType === "UPSELL" &&
      acceptanceRate >= HIGH_ACCEPTANCE_FOR_DISCOUNT_CAUTION &&
      avgDiscountPct != null &&
      avgDiscountPct >= DEEP_DISCOUNT_PCT
    ) {
      reasons.push(
        `But it's a deep discount (avg ${Math.round(avgDiscountPct)}% off) accepted very often — worth checking whether repeat clients who'd have paid full price are taking it too, not just hesitant first-timers.`,
      );
      return { label: "mixed", reasons };
    }
    return { label: "good", reasons };
  }

  if (acceptanceRate <= POOR_ACCEPTANCE_RATE) {
    if (responseRate < LOW_RESPONSE_RATE) {
      return {
        label: "underperforming",
        reasons: [
          `Only accepted ${pct(acceptanceRate)} of the time (${accepted}/${presented}), and most clients never responded at all (${pct(1 - responseRate)} no-response) — points at timing or visibility rather than the offer itself.`,
        ],
      };
    }
    return {
      label: "underperforming",
      reasons: [
        `Only accepted ${pct(acceptanceRate)} of the time (${accepted}/${presented}) — clients are seeing it and actively declining (${declined} declines), not just ignoring it.`,
      ],
    };
  }

  return {
    label: "mixed",
    reasons: [
      `Middling acceptance (${pct(acceptanceRate)}, ${accepted}/${presented}) — not a clear win or a clear miss yet.`,
    ],
  };
}

function summarizeOne(events: OfferEventRow[]): OfferPerformanceSummary {
  const first = events[0];
  const presented = events.length;
  const accepted = events.filter((e) => e.status === "ACCEPTED");
  const declined = events.filter((e) => e.status === "DECLINED");
  const noResponse = events.filter((e) => e.status !== "ACCEPTED" && e.status !== "DECLINED");

  const acceptanceRate = presented > 0 ? accepted.length / presented : 0;
  const responseRate = presented > 0 ? (accepted.length + declined.length) / presented : 0;

  const revenueCaptured = accepted.reduce((sum, e) => sum + (e.offeredPrice ?? 0), 0);
  const isUpsell = first.offerType === "UPSELL";
  const discountGiven = isUpsell
    ? accepted.reduce((sum, e) => sum + Math.max(0, (e.basePrice ?? 0) - (e.offeredPrice ?? 0)), 0)
    : 0;
  const discountPcts = isUpsell
    ? accepted
        .filter((e) => e.basePrice != null && e.basePrice > 0)
        .map((e) => ((e.basePrice! - (e.offeredPrice ?? 0)) / e.basePrice!) * 100)
    : [];
  const avgDiscountPct =
    discountPcts.length > 0 ? discountPcts.reduce((a, b) => a + b, 0) / discountPcts.length : null;

  const byServiceMap = new Map<string, ServiceBreakdown>();
  for (const e of events) {
    const key = e.serviceId ?? "unknown";
    const existing = byServiceMap.get(key) ?? {
      serviceId: e.serviceId,
      presented: 0,
      accepted: 0,
      declined: 0,
      noResponse: 0,
    };
    existing.presented++;
    if (e.status === "ACCEPTED") existing.accepted++;
    else if (e.status === "DECLINED") existing.declined++;
    else existing.noResponse++;
    byServiceMap.set(key, existing);
  }

  const timestamps = events.map((e) => e.createdAt).sort();

  return {
    offerId: first.offerId,
    offerType: first.offerType,
    offerName: first.offerName,
    presented,
    accepted: accepted.length,
    declined: declined.length,
    noResponse: noResponse.length,
    acceptanceRate,
    responseRate,
    revenueCaptured,
    discountGiven,
    avgDiscountPct,
    firstPresentedAt: timestamps[0],
    lastPresentedAt: timestamps[timestamps.length - 1],
    byService: [...byServiceMap.values()].sort((a, b) => b.presented - a.presented),
    verdict: computeVerdict({
      offerType: first.offerType,
      presented,
      accepted: accepted.length,
      declined: declined.length,
      acceptanceRate,
      responseRate,
      avgDiscountPct,
    }),
  };
}

/** Groups raw OfferEvents rows by (offerType, offerId) — the same add-on/discount presented
 * alongside different treatments (see ServiceAddonLinks) is one performance story, not several —
 * and computes each group's verdict. Sorted by presentation count, busiest first. */
export function summarizeOfferPerformance(events: OfferEventRow[]): OfferPerformanceSummary[] {
  const byKey = new Map<string, OfferEventRow[]>();
  for (const e of events) {
    const key = `${e.offerType}:${e.offerId}`;
    const list = byKey.get(key) ?? [];
    list.push(e);
    byKey.set(key, list);
  }
  return [...byKey.values()].map(summarizeOne).sort((a, b) => b.presented - a.presented);
}
