import { describe, expect, it } from "vitest";
import { slotPresentLimit } from "@/lib/agent/shared-booking-rules";

describe("slotPresentLimit", () => {
  it("returns 3 slots for voice per PRD", () => {
    expect(slotPresentLimit("voice")).toBe(3);
  });

  it("returns 6 slots for chat/widget", () => {
    expect(slotPresentLimit("widget")).toBe(6);
    expect(slotPresentLimit("telegram")).toBe(6);
  });
});
