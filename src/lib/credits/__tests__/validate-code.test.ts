import { describe, expect, it } from "vitest";
import { formatOfferSummary } from "@/lib/rules/offer-config";

describe("promo code validation (format helpers)", () => {
  it("formats rule credit offers for client messaging", () => {
    expect(formatOfferSummary("credit", 30)).toBe("$30 credit");
  });

  it("formats rule discount offers for client messaging", () => {
    expect(formatOfferSummary("discount", 20)).toBe("20% off");
  });
});
