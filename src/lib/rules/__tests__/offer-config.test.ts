import { describe, expect, it } from "vitest";
import { personalizeRuleMessage } from "@/lib/rules/personalize";
import { formatOfferSummary, parseRuleOffer } from "@/lib/rules/offer-config";

describe("rule offer config", () => {
  it("parseRuleOffer reads type and amount from trigger_config", () => {
    const o = parseRuleOffer({
      offer_code: "SPRING30",
      trigger_config: { offer_type: "discount", offer_amount: 30 },
    });
    expect(o.code).toBe("SPRING30");
    expect(o.type).toBe("discount");
    expect(o.amount).toBe(30);
  });

  it("parseRuleOffer defaults allowCustomPromoCode to false for backward compatibility", () => {
    const o = parseRuleOffer({
      offer_code: "SPRING30",
      trigger_config: { offer_type: "discount", offer_amount: 30 },
    });
    expect(o.allowCustomPromoCode).toBe(false);
  });

  it("parseRuleOffer reads allow_custom_promo_code when set", () => {
    const o = parseRuleOffer({
      offer_code: "SUMMER50",
      trigger_config: { allow_custom_promo_code: true },
    });
    expect(o.allowCustomPromoCode).toBe(true);
  });

  it("formatOfferSummary", () => {
    expect(formatOfferSummary("credit", 50)).toBe("$50 credit");
    expect(formatOfferSummary("discount", 20)).toBe("20% off");
  });

  it("personalizeRuleMessage replaces offer placeholders", () => {
    const text = personalizeRuleMessage(
      "Hi {first_name}, enjoy {offer_summary} with {credit_code}.",
      {
        name: "Jane Doe",
        offerCode: "SAVE20",
        offerType: "discount",
        offerAmount: 20,
      },
    );
    expect(text).toBe("Hi Jane, enjoy 20% off with SAVE20.");
  });
});
