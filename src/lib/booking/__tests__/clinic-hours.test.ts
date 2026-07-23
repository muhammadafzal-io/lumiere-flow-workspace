import { describe, expect, it } from "vitest";
import { describeClinicHours } from "@/lib/booking/clinic-hours";

describe("describeClinicHours", () => {
  it("returns 'Closed all week' when no days are open", () => {
    expect(describeClinicHours({})).toBe("Closed all week");
  });

  it("groups a consecutive run of identical-hours days into a range", () => {
    const schedule = {
      mon: { start: "09:00", end: "19:00" },
      tue: { start: "09:00", end: "19:00" },
      wed: { start: "09:00", end: "19:00" },
    };
    expect(describeClinicHours(schedule)).toBe("Monday–Wednesday, 9:00 AM – 7:00 PM");
  });

  it("lists non-consecutive identical-hours days without collapsing into a range", () => {
    const schedule = {
      mon: { start: "09:00", end: "19:00" },
      wed: { start: "09:00", end: "19:00" },
      fri: { start: "09:00", end: "19:00" },
    };
    expect(describeClinicHours(schedule)).toBe("Monday, Wednesday, Friday, 9:00 AM – 7:00 PM");
  });

  it("lists each day's own hours when days do NOT share identical hours, instead of dropping the time entirely", () => {
    // Regression test: this previously returned just "Monday–Wednesday" with no time at all,
    // leaving the AI with zero information about actual opening/closing times whenever the
    // schedule wasn't perfectly uniform across every open day.
    const schedule = {
      mon: { start: "09:00", end: "19:00" },
      tue: { start: "09:00", end: "19:00" },
      wed: { start: "09:00", end: "17:00" },
    };
    expect(describeClinicHours(schedule)).toBe(
      "Monday 9:00 AM – 7:00 PM, Tuesday 9:00 AM – 7:00 PM, Wednesday 9:00 AM – 5:00 PM",
    );
  });

  it("handles a single open day", () => {
    expect(describeClinicHours({ sat: { start: "08:00", end: "14:00" } })).toBe(
      "Saturday, 8:00 AM – 2:00 PM",
    );
  });

  it("groups a consecutive run ending on Sunday", () => {
    const schedule = {
      fri: { start: "09:00", end: "19:00" },
      sat: { start: "09:00", end: "19:00" },
      sun: { start: "09:00", end: "19:00" },
    };
    expect(describeClinicHours(schedule)).toBe("Friday–Sunday, 9:00 AM – 7:00 PM");
  });
});
