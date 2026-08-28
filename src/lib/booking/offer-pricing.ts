export type DiscountType = "percentage" | "fixed";

export interface ServiceOfferRow {
  id: string;
  serviceId: string;
  name: string;
  discountType: DiscountType;
  discountValue: number;
  enabled: boolean;
  startsAt: string | null;
  endsAt: string | null;
}

export interface ResolvedPricing {
  /** Rate Card price this was computed from — null when the service has no price configured. */
  basePrice: number | null;
  /** The offer applied, or null when no valid offer exists (or there's no base price to apply one to). */
  offer: ServiceOfferRow | null;
  /** basePrice with the offer applied, clamped to never go below 0. Equals basePrice when there's
   * no valid offer, and null when there's no base price at all. */
  finalPrice: number | null;
}

/** A discount value is only ever meaningless if it's not a finite, non-negative number, or a
 * percentage over 100 (which would always clamp to $0 regardless of base price — not useful,
 * and almost certainly a data-entry mistake rather than an intentional "more than free" offer). */
export function isValidDiscountValue(type: DiscountType, value: number): boolean {
  if (!Number.isFinite(value) || value < 0) return false;
  if (type === "percentage" && value > 100) return false;
  return true;
}

/** Applies one offer to a base price. Never returns a negative number — a fixed discount larger
 * than the base price (or, in principle, any rounding edge case) floors at $0 rather than going
 * negative, per the "prevent invalid results" requirement. */
export function applyDiscount(basePrice: number, type: DiscountType, value: number): number {
  const raw = type === "percentage" ? basePrice * (1 - value / 100) : basePrice - value;
  return Math.max(0, Math.round(raw * 100) / 100);
}

function isOfferCurrentlyActive(offer: ServiceOfferRow, now: Date): boolean {
  if (!offer.enabled) return false;
  if (!isValidDiscountValue(offer.discountType, offer.discountValue)) return false;
  if (offer.startsAt && now.getTime() < new Date(offer.startsAt).getTime()) return false;
  if (offer.endsAt && now.getTime() > new Date(offer.endsAt).getTime()) return false;
  return true;
}

/**
 * Resolves the price a client should actually be quoted for a service right now: the Rate Card
 * price with the single best currently-active offer applied, if any. "Best" means lowest final
 * price for the client — the natural tie-break when a service has multiple active offers
 * (deliberately allowed, e.g. a site-wide promo overlapping a service-specific one), since a
 * clinic offering several simultaneous discounts would want the client to get whichever is most
 * generous, not an arbitrary one.
 *
 * Disabled, expired, not-yet-started, and invalid-discount offers are all excluded here — this is
 * the one place "is this offer valid to show/apply right now" is decided, so the AI booking flow,
 * the customer-facing quote, and the Settings preview all agree.
 */
export function resolvePricing(
  basePrice: number | null,
  offers: ServiceOfferRow[],
  now: Date = new Date(),
): ResolvedPricing {
  if (basePrice == null) {
    return { basePrice: null, offer: null, finalPrice: null };
  }

  const active = offers.filter((o) => isOfferCurrentlyActive(o, now));
  if (active.length === 0) {
    return { basePrice, offer: null, finalPrice: basePrice };
  }

  let best = active[0];
  let bestPrice = applyDiscount(basePrice, best.discountType, best.discountValue);
  for (const candidate of active.slice(1)) {
    const price = applyDiscount(basePrice, candidate.discountType, candidate.discountValue);
    if (price < bestPrice) {
      best = candidate;
      bestPrice = price;
    }
  }

  return { basePrice, offer: best, finalPrice: bestPrice };
}

export function formatOfferForNotes(pricing: ResolvedPricing): string {
  if (pricing.basePrice == null) return "";
  if (!pricing.offer) return `Price: $${pricing.basePrice}`;
  const discountLabel =
    pricing.offer.discountType === "percentage"
      ? `${pricing.offer.discountValue}% off`
      : `$${pricing.offer.discountValue} off`;
  return `Price: $${pricing.finalPrice} (${pricing.offer.name}, ${discountLabel} rate card $${pricing.basePrice})`;
}

export interface BookingPricingSummaryInput {
  basePrice: number | null;
  /** The currently-accepted/applied offer for this booking, or null if none. */
  offer: ServiceOfferRow | null;
  /** Every add-on currently accepted for this booking (not just one just-accepted one) — the
   * caller is responsible for including prior accepts, not just the newest. */
  addons: { name: string; price: number | null }[];
}

/**
 * Builds ONE consolidated, always-current pricing summary line for a booking's notes — an add-on
 * and an offer accepted at different times (one at booking, one later via the confirmation
 * email's link) used to each independently append their own "Add-ons:"/"Price:" fragment via
 * simple string concatenation, which could leave two conflicting "Price:" lines once both had
 * happened. This computes the full picture (add-ons + discounted treatment price + grand total)
 * from the CURRENT accepted state every time, meant to be written via mergeNotesWithPricingSummary
 * so it replaces whatever auto-generated summary was there before rather than piling onto it.
 * Returns "" when there's nothing special to report (no add-ons, no offer) — same "don't add noise
 * to the common case" convention as formatAddonsForNotes/formatOfferForNotes.
 */
export function buildBookingPricingSummary(input: BookingPricingSummaryInput): string {
  const { basePrice, offer, addons } = input;
  if (!offer && addons.length === 0) return "";

  const parts: string[] = [];
  if (addons.length > 0) {
    const items = addons.map((a) => (a.price != null ? `${a.name} ($${a.price})` : a.name));
    parts.push(`Add-ons: ${items.join(", ")}`);
  }

  const treatmentPrice =
    offer && basePrice != null
      ? applyDiscount(basePrice, offer.discountType, offer.discountValue)
      : basePrice;
  if (offer && basePrice != null) {
    const discountLabel =
      offer.discountType === "percentage"
        ? `${offer.discountValue}% off`
        : `$${offer.discountValue} off`;
    parts.push(
      `Treatment: $${treatmentPrice} (${offer.name}, ${discountLabel} rate card $${basePrice})`,
    );
  }

  if (treatmentPrice != null) {
    const addonsTotal = addons.reduce((sum, a) => sum + (a.price ?? 0), 0);
    parts.push(`Total: $${treatmentPrice + addonsTotal}`);
  }

  return parts.join(" | ");
}

const AUTO_SUMMARY_PREFIXES = ["Add-ons:", "Treatment:", "Total:", "Price:"];

/**
 * Writes a freshly computed pricing summary (from buildBookingPricingSummary) into a booking's
 * notes, replacing any segment that looks auto-generated (starts with one of the known prefixes
 * above — including the older single-fragment "Price:"/"Add-ons:" format, for bookings created
 * before this consolidated summary existed) while preserving genuine free-text notes untouched.
 */
export function mergeNotesWithPricingSummary(
  existingNotes: string | undefined,
  summary: string,
): string {
  const kept = (existingNotes ?? "")
    .split(" | ")
    .map((s) => s.trim())
    .filter((s) => s && !AUTO_SUMMARY_PREFIXES.some((p) => s.startsWith(p)));
  if (summary) kept.push(summary);
  return kept.join(" | ");
}
