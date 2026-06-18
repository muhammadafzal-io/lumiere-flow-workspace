import {
  sameDay,
  addDays,
  topOffsetPx,
  heightPx,
  slotIdFor,
  parseSlotId,
  SLOT_MIN,
  SLOT_PX,
  HOUR_START,
} from "../calendar-utils";

/** Create a fixed Chicago-noon UTC date for a given calendar date. */
function chicagoNoon(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, 17, 0, 0)); // 17:00 UTC = noon CDT
}

describe("sameDay", () => {
  it("returns true for the same Chicago calendar date", () => {
    const a = chicagoNoon(2026, 6, 15);
    const b = new Date(a.getTime() + 2 * 3_600_000); // +2 hours, still same day
    expect(sameDay(a, b)).toBe(true);
  });

  it("returns false for different Chicago calendar dates", () => {
    const a = chicagoNoon(2026, 6, 15);
    const b = chicagoNoon(2026, 6, 16);
    expect(sameDay(a, b)).toBe(false);
  });
});

describe("addDays", () => {
  it("adds positive days", () => {
    const base = chicagoNoon(2026, 6, 15);
    const result = addDays(base, 3);
    expect(sameDay(result, chicagoNoon(2026, 6, 18))).toBe(true);
  });

  it("subtracts days with negative n", () => {
    const base = chicagoNoon(2026, 6, 15);
    const result = addDays(base, -2);
    expect(sameDay(result, chicagoNoon(2026, 6, 13))).toBe(true);
  });

  it("handles zero", () => {
    const base = chicagoNoon(2026, 6, 15);
    expect(sameDay(addDays(base, 0), base)).toBe(true);
  });

  it("rolls over month boundaries", () => {
    const base = chicagoNoon(2026, 6, 30);
    const result = addDays(base, 1);
    expect(sameDay(result, chicagoNoon(2026, 7, 1))).toBe(true);
  });
});

describe("topOffsetPx", () => {
  it("returns 0 for the first slot (HOUR_START:00)", () => {
    const start = new Date(Date.UTC(2026, 5, 15, HOUR_START + 5, 0, 0)); // 9 AM CDT
    expect(topOffsetPx(start)).toBe(0);
  });

  it("returns SLOT_PX for one slot later (30 min)", () => {
    const start = new Date(Date.UTC(2026, 5, 15, HOUR_START + 5, 30, 0));
    expect(topOffsetPx(start)).toBe(SLOT_PX);
  });

  it("returns 2*SLOT_PX for 1 hour after open", () => {
    const start = new Date(Date.UTC(2026, 5, 15, HOUR_START + 5 + 1, 0, 0));
    expect(topOffsetPx(start)).toBe(2 * SLOT_PX);
  });
});

describe("heightPx", () => {
  it("1 slot = SLOT_PX px", () => {
    expect(heightPx(SLOT_MIN)).toBe(SLOT_PX);
  });

  it("2 slots = 2 * SLOT_PX", () => {
    expect(heightPx(SLOT_MIN * 2)).toBe(2 * SLOT_PX);
  });

  it("60 min appointment", () => {
    expect(heightPx(60)).toBe((60 / SLOT_MIN) * SLOT_PX);
  });
});

describe("slotIdFor / parseSlotId roundtrip", () => {
  it("encodes and decodes a slot", () => {
    const date = chicagoNoon(2026, 6, 15);
    const id = slotIdFor(date, 10, 30);
    expect(id).toMatch(/^slot_2026-06-15_10_30$/);
    const parsed = parseSlotId(id);
    expect(parsed).not.toBeNull();
    expect(parsed!.hour).toBe(10);
    expect(parsed!.minute).toBe(30);
  });

  it("returns null for invalid slot IDs", () => {
    expect(parseSlotId("not-a-slot")).toBeNull();
    expect(parseSlotId("slot_2026-06-15")).toBeNull();
  });

  it("zero-pads month and day", () => {
    const date = chicagoNoon(2026, 3, 5);
    const id = slotIdFor(date, 9, 0);
    expect(id).toMatch(/slot_2026-03-05/);
  });
});
