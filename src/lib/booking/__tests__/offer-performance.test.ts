import { describe, expect, it } from "vitest";
import { summarizeOfferPerformance } from "@/lib/booking/offer-performance";
import type { OfferEventRow, OfferEventType, OfferEventStatus } from "@/lib/booking/offer-events";

let seq = 0;
function event(overrides: Partial<OfferEventRow> & { offerType: OfferEventType }): OfferEventRow {
  seq++;
  return {
    id: `evt_${seq}`,
    chatId: `chat_${seq}`,
    clientId: null,
    clientName: null,
    clientContact: null,
    eventId: `booking_${seq}`,
    serviceId: "service_botox",
    offerId: "offer_1",
    offerName: "Test Offer",
    offeredPrice: null,
    basePrice: null,
    status: "PRESENTED",
    platform: "chat",
    token: null,
    expiresAt: null,
    respondedAt: null,
    createdAt: `2026-08-${String((seq % 28) + 1).padStart(2, "0")}T12:00:00Z`,
    ...overrides,
  };
}

function makeEvents(
  offerType: OfferEventType,
  statuses: OfferEventStatus[],
  overrides: Partial<OfferEventRow> = {},
): OfferEventRow[] {
  return statuses.map((status) => event({ offerType, status, ...overrides }));
}

describe("summarizeOfferPerformance", () => {
  it("labels an offer with too few presentations as insufficient_data, regardless of rate", () => {
    const events = makeEvents("CROSS_SELL", ["ACCEPTED", "ACCEPTED", "ACCEPTED"]);
    const [summary] = summarizeOfferPerformance(events);
    expect(summary.presented).toBe(3);
    expect(summary.verdict.label).toBe("insufficient_data");
  });

  it("labels a cross-sell add-on with strong acceptance as good", () => {
    const statuses: OfferEventStatus[] = [
      ...Array(4).fill("ACCEPTED"),
      ...Array(6).fill("DECLINED"),
      ...Array(2).fill("NO_RESPONSE"),
    ];
    const events = makeEvents("CROSS_SELL", statuses, { offeredPrice: 30 });
    const [summary] = summarizeOfferPerformance(events);
    expect(summary.presented).toBe(12);
    expect(summary.accepted).toBe(4);
    expect(summary.acceptanceRate).toBeCloseTo(4 / 12);
    expect(summary.verdict.label).toBe("good");
    expect(summary.revenueCaptured).toBe(120);
  });

  it("labels a mostly-ignored offer as underperforming and calls out low response rate", () => {
    const statuses: OfferEventStatus[] = [
      "ACCEPTED",
      ...Array(19).fill("NO_RESPONSE" as OfferEventStatus),
    ];
    const events = makeEvents("CROSS_SELL", statuses);
    const [summary] = summarizeOfferPerformance(events);
    expect(summary.verdict.label).toBe("underperforming");
    expect(summary.verdict.reasons[0]).toMatch(/no-response/);
  });

  it("labels a low-acceptance offer that IS being seen as underperforming for a different reason", () => {
    const statuses: OfferEventStatus[] = [
      "ACCEPTED",
      ...Array(19).fill("DECLINED" as OfferEventStatus),
    ];
    const events = makeEvents("CROSS_SELL", statuses);
    const [summary] = summarizeOfferPerformance(events);
    expect(summary.verdict.label).toBe("underperforming");
    expect(summary.verdict.reasons[0]).toMatch(/actively declining/);
  });

  it("flags a deep discount accepted very often as mixed rather than unconditionally good", () => {
    const statuses: OfferEventStatus[] = [
      ...Array(9).fill("ACCEPTED"),
      ...Array(1).fill("DECLINED"),
    ];
    const events = makeEvents("UPSELL", statuses, { offeredPrice: 700, basePrice: 1000 });
    const [summary] = summarizeOfferPerformance(events);
    expect(summary.acceptanceRate).toBeCloseTo(0.9);
    expect(summary.avgDiscountPct).toBeCloseTo(30);
    expect(summary.verdict.label).toBe("mixed");
    expect(summary.discountGiven).toBe(9 * 300);
  });

  it("does not apply the deep-discount caution to a shallow, high-acceptance discount", () => {
    const statuses: OfferEventStatus[] = [
      ...Array(9).fill("ACCEPTED"),
      ...Array(1).fill("DECLINED"),
    ];
    const events = makeEvents("UPSELL", statuses, { offeredPrice: 950, basePrice: 1000 });
    const [summary] = summarizeOfferPerformance(events);
    expect(summary.verdict.label).toBe("good");
  });

  it("groups by (offerType, offerId) separately, never mixing cross-sell and upsell of the same id", () => {
    const events = [
      ...makeEvents("CROSS_SELL", Array(10).fill("ACCEPTED"), { offerId: "shared_id" }),
      ...makeEvents("UPSELL", Array(10).fill("DECLINED"), { offerId: "shared_id" }),
    ];
    const summaries = summarizeOfferPerformance(events);
    expect(summaries).toHaveLength(2);
    const crossSell = summaries.find((s) => s.offerType === "CROSS_SELL")!;
    const upsell = summaries.find((s) => s.offerType === "UPSELL")!;
    expect(crossSell.verdict.label).toBe("good");
    expect(upsell.verdict.label).toBe("underperforming");
  });

  it("breaks down presentations by the service they were offered alongside", () => {
    const events = [
      ...makeEvents("CROSS_SELL", Array(6).fill("ACCEPTED"), { serviceId: "botox" }),
      ...makeEvents("CROSS_SELL", Array(6).fill("DECLINED"), { serviceId: "facial" }),
    ];
    const [summary] = summarizeOfferPerformance(events);
    expect(summary.byService).toHaveLength(2);
    const botox = summary.byService.find((b) => b.serviceId === "botox")!;
    expect(botox.accepted).toBe(6);
    expect(botox.presented).toBe(6);
  });

  it("sorts summaries by presentation count, busiest first", () => {
    const events = [
      ...makeEvents("CROSS_SELL", Array(5).fill("ACCEPTED"), { offerId: "quiet" }),
      ...makeEvents("CROSS_SELL", Array(15).fill("ACCEPTED"), { offerId: "busy" }),
    ];
    const summaries = summarizeOfferPerformance(events);
    expect(summaries[0].offerId).toBe("busy");
    expect(summaries[1].offerId).toBe("quiet");
  });
});
