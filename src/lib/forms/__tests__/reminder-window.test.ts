import { describe, expect, it } from "vitest";
import { isWithinFormReminderWindow } from "@/lib/forms/reminder-window";

describe("isWithinFormReminderWindow", () => {
  it("is true at the exact 24h target", () => {
    expect(isWithinFormReminderWindow(24)).toBe(true);
  });

  it("is true at the lower tolerance edge (20h)", () => {
    expect(isWithinFormReminderWindow(20)).toBe(true);
  });

  it("is true at the upper tolerance edge (28h)", () => {
    expect(isWithinFormReminderWindow(28)).toBe(true);
  });

  it("is false just outside the lower edge (19.9h)", () => {
    expect(isWithinFormReminderWindow(19.9)).toBe(false);
  });

  it("is false just outside the upper edge (28.1h)", () => {
    expect(isWithinFormReminderWindow(28.1)).toBe(false);
  });

  it("is false for a past appointment (negative hours)", () => {
    expect(isWithinFormReminderWindow(-2)).toBe(false);
  });
});
