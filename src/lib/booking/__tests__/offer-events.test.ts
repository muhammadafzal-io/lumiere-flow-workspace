import { describe, expect, it } from "vitest";
import { computePostBookingOffers } from "@/lib/booking/offer-events";
import type { ServiceAddonRow } from "@/lib/booking/recipe";
import type { ServiceOfferRow } from "@/lib/booking/offer-pricing";

function addon(overrides: Partial<ServiceAddonRow>): ServiceAddonRow {
  return {
    id: "addon_1",
    serviceId: "service_1",
    name: "LED Light Therapy",
    description: null,
    price: 30,
    durationMinutes: 15,
    status: "Active",
    ...overrides,
  };
}

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

describe("computePostBookingOffers", () => {
  it("no add-ons, no offer: nothing to present", () => {
    const result = computePostBookingOffers([], [], null, undefined);
    expect(result).toEqual({ crossSell: [], upsell: null });
  });

  it("presents an add-on that wasn't selected during the original booking", () => {
    const led = addon({ id: "addon_1" });
    const result = computePostBookingOffers([led], [], null, undefined);
    expect(result.crossSell).toEqual([led]);
  });

  it("does not re-present an add-on already selected at booking time", () => {
    const led = addon({ id: "addon_1" });
    const result = computePostBookingOffers([led], ["addon_1"], null, undefined);
    expect(result.crossSell).toEqual([]);
  });

  it("presents the offer when none was accepted at booking time", () => {
    const summer = offer({ id: "offer_1" });
    const result = computePostBookingOffers([], [], summer, undefined);
    expect(result.upsell).toEqual(summer);
  });

  it("does not re-present the same offer already accepted at booking time", () => {
    const summer = offer({ id: "offer_1" });
    const result = computePostBookingOffers([], [], summer, "offer_1");
    expect(result.upsell).toBeNull();
  });

  it("with multiple add-ons, only excludes the ones already selected", () => {
    const led = addon({ id: "addon_1", name: "LED Light Therapy" });
    const lymph = addon({ id: "addon_2", name: "Lymphatic Drainage" });
    const result = computePostBookingOffers([led, lymph], ["addon_1"], null, undefined);
    expect(result.crossSell).toEqual([lymph]);
  });

  it("handles cross-sell and upsell independently in the same call", () => {
    const led = addon({ id: "addon_1" });
    const summer = offer({ id: "offer_1" });
    const result = computePostBookingOffers([led], [], summer, undefined);
    expect(result.crossSell).toEqual([led]);
    expect(result.upsell).toEqual(summer);
  });
});
