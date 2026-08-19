import { describe, expect, it } from "vitest";
import {
  applyDiscount,
  isValidDiscountValue,
  resolvePricing,
  formatOfferForNotes,
  type ServiceOfferRow,
} from "@/lib/booking/offer-pricing";

const NOW = new Date("2026-08-19T12:00:00Z");

function offer(overrides: Partial<ServiceOfferRow>): ServiceOfferRow {
  return {
    id: "offer_1",
    serviceId: "service_1",
    name: "Summer Special",
    discountType: "percentage",
    discountValue: 20,
    enabled: true,
    startsAt: null,
    endsAt: null,
    ...overrides,
  };
}

describe("applyDiscount", () => {
  it("computes a percentage discount correctly", () => {
    expect(applyDiscount(150, "percentage", 20)).toBe(120);
  });

  it("computes a fixed discount correctly", () => {
    expect(applyDiscount(150, "fixed", 30)).toBe(120);
  });

  it("never returns a negative price for an oversized fixed discount", () => {
    expect(applyDiscount(50, "fixed", 200)).toBe(0);
  });

  it("never returns a negative price for a 100%+ percentage discount", () => {
    expect(applyDiscount(150, "percentage", 100)).toBe(0);
  });
});

describe("isValidDiscountValue", () => {
  it("rejects negative and non-finite values", () => {
    expect(isValidDiscountValue("fixed", -10)).toBe(false);
    expect(isValidDiscountValue("fixed", NaN)).toBe(false);
  });

  it("rejects a percentage over 100", () => {
    expect(isValidDiscountValue("percentage", 150)).toBe(false);
  });

  it("accepts a percentage at the 100 boundary and a reasonable fixed amount", () => {
    expect(isValidDiscountValue("percentage", 100)).toBe(true);
    expect(isValidDiscountValue("fixed", 9999)).toBe(true);
  });
});

describe("resolvePricing", () => {
  it("procedure has no Rate Card price: nothing to quote", () => {
    const result = resolvePricing(null, [offer({})], NOW);
    expect(result).toEqual({ basePrice: null, offer: null, finalPrice: null });
  });

  it("no active offer: final price equals the Rate Card price", () => {
    const result = resolvePricing(150, [], NOW);
    expect(result).toEqual({ basePrice: 150, offer: null, finalPrice: 150 });
  });

  it("returns the active offer applied to the current Rate Card price", () => {
    const result = resolvePricing(150, [offer({ discountType: "percentage", discountValue: 20 })], NOW);
    expect(result.finalPrice).toBe(120);
    expect(result.offer?.name).toBe("Summer Special");
  });

  it("a disabled offer is excluded", () => {
    const result = resolvePricing(150, [offer({ enabled: false })], NOW);
    expect(result.offer).toBeNull();
    expect(result.finalPrice).toBe(150);
  });

  it("an expired offer (ends_at in the past) is excluded", () => {
    const result = resolvePricing(
      150,
      [offer({ endsAt: "2026-08-01T00:00:00Z" })],
      NOW,
    );
    expect(result.offer).toBeNull();
    expect(result.finalPrice).toBe(150);
  });

  it("an offer that hasn't started yet (starts_at in the future) is excluded", () => {
    const result = resolvePricing(
      150,
      [offer({ startsAt: "2026-09-01T00:00:00Z" })],
      NOW,
    );
    expect(result.offer).toBeNull();
    expect(result.finalPrice).toBe(150);
  });

  it("an offer within its scheduled window is included", () => {
    const result = resolvePricing(
      150,
      [offer({ startsAt: "2026-08-01T00:00:00Z", endsAt: "2026-09-01T00:00:00Z" })],
      NOW,
    );
    expect(result.offer).not.toBeNull();
    expect(result.finalPrice).toBe(120);
  });

  it("an offer with an invalid discount value is excluded", () => {
    const result = resolvePricing(
      150,
      [offer({ discountType: "percentage", discountValue: 150 })],
      NOW,
    );
    expect(result.offer).toBeNull();
    expect(result.finalPrice).toBe(150);
  });

  it("multiple active offers: the one yielding the lowest final price wins", () => {
    const small = offer({ id: "a", name: "Small", discountType: "percentage", discountValue: 10 });
    const big = offer({ id: "b", name: "Big", discountType: "percentage", discountValue: 30 });
    const result = resolvePricing(150, [small, big], NOW);
    expect(result.offer?.name).toBe("Big");
    expect(result.finalPrice).toBe(105);
  });

  it("final price is never negative even with a large fixed discount", () => {
    const result = resolvePricing(20, [offer({ discountType: "fixed", discountValue: 100 })], NOW);
    expect(result.finalPrice).toBe(0);
  });
});

describe("formatOfferForNotes", () => {
  it("returns empty when there's no base price at all", () => {
    expect(formatOfferForNotes({ basePrice: null, offer: null, finalPrice: null })).toBe("");
  });

  it("shows just the price when there's no offer", () => {
    expect(formatOfferForNotes({ basePrice: 150, offer: null, finalPrice: 150 })).toBe(
      "Price: $150",
    );
  });

  it("shows the discounted price with offer details when an offer applied", () => {
    const pricing = resolvePricing(150, [offer({ name: "20% OFF", discountValue: 20 })], NOW);
    expect(formatOfferForNotes(pricing)).toBe(
      "Price: $120 (20% OFF, 20% off rate card $150)",
    );
  });
});
