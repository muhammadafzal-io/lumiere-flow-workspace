import { describe, expect, it } from "vitest";
import { resolveSelectedAddons, formatAddonsForNotes } from "@/lib/booking/addon-selection";
import type { ServiceAddonRow } from "@/lib/booking/recipe";

function addon(overrides: Partial<ServiceAddonRow>): ServiceAddonRow {
  return {
    id: "addon_1",
    serviceId: "service_1",
    name: "LED Light Therapy",
    description: null,
    price: 30,
    durationMinutes: 15,
    status: "Active",
    priority: null,
    ...overrides,
  };
}

describe("resolveSelectedAddons", () => {
  it("procedure with no add-ons configured: nothing to match, nothing unavailable", () => {
    const result = resolveSelectedAddons([], []);
    expect(result).toEqual({
      matched: [],
      unavailable: [],
      extraDurationMinutes: 0,
      extraPrice: 0,
    });
  });

  it("one add-on offered and accepted", () => {
    const led = addon({ name: "LED Light Therapy", price: 30, durationMinutes: 15 });
    const result = resolveSelectedAddons([led], ["LED Light Therapy"]);
    expect(result.matched).toEqual([led]);
    expect(result.extraDurationMinutes).toBe(15);
    expect(result.extraPrice).toBe(30);
    expect(result.unavailable).toEqual([]);
  });

  it("customer declines: booking unaffected", () => {
    const led = addon({ name: "LED Light Therapy" });
    const result = resolveSelectedAddons([led], []);
    expect(result.matched).toEqual([]);
    expect(result.extraDurationMinutes).toBe(0);
    expect(result.extraPrice).toBe(0);
  });

  it("multiple add-ons selected: all matched, durations and prices summed", () => {
    const led = addon({ name: "LED Light Therapy", price: 30, durationMinutes: 15 });
    const lymph = addon({
      id: "addon_2",
      name: "Lymphatic Drainage",
      price: 45,
      durationMinutes: 20,
    });
    const result = resolveSelectedAddons([led, lymph], ["LED Light Therapy", "Lymphatic Drainage"]);
    expect(result.matched).toHaveLength(2);
    expect(result.extraDurationMinutes).toBe(35);
    expect(result.extraPrice).toBe(75);
  });

  it("inactive add-ons are not offered — a selected inactive add-on is reported unavailable, not matched", () => {
    const inactiveAddon = addon({ name: "Discontinued Peel", status: "Inactive" });
    const result = resolveSelectedAddons([inactiveAddon], ["Discontinued Peel"]);
    expect(result.matched).toEqual([]);
    expect(result.unavailable).toEqual(["Discontinued Peel"]);
    expect(result.extraDurationMinutes).toBe(0);
  });

  it("selecting an add-on that no longer exists is reported unavailable, not silently dropped", () => {
    const result = resolveSelectedAddons(
      [addon({ name: "LED Light Therapy" })],
      ["Nonexistent Addon"],
    );
    expect(result.matched).toEqual([]);
    expect(result.unavailable).toEqual(["Nonexistent Addon"]);
  });

  it("matches case-insensitively and trims whitespace", () => {
    const led = addon({ name: "LED Light Therapy" });
    const result = resolveSelectedAddons([led], ["  led light therapy  "]);
    expect(result.matched).toEqual([led]);
  });

  it("de-duplicates a repeated selection instead of double-counting duration/price", () => {
    const led = addon({ name: "LED Light Therapy", price: 30, durationMinutes: 15 });
    const result = resolveSelectedAddons([led], ["LED Light Therapy", "LED Light Therapy"]);
    expect(result.matched).toHaveLength(1);
    expect(result.extraDurationMinutes).toBe(15);
    expect(result.extraPrice).toBe(30);
  });

  it("add-ons with no price set don't contribute to extraPrice", () => {
    const freebie = addon({ name: "Complimentary Upgrade", price: null, durationMinutes: 10 });
    const result = resolveSelectedAddons([freebie], ["Complimentary Upgrade"]);
    expect(result.matched).toEqual([freebie]);
    expect(result.extraPrice).toBe(0);
    expect(result.extraDurationMinutes).toBe(10);
  });
});

describe("formatAddonsForNotes", () => {
  it("returns an empty string when nothing was selected — existing bookings without add-ons are unaffected", () => {
    expect(formatAddonsForNotes([])).toBe("");
  });

  it("renders a single add-on with its price", () => {
    expect(formatAddonsForNotes([addon({ name: "LED Light Therapy", price: 30 })])).toBe(
      "Add-ons: LED Light Therapy ($30)",
    );
  });

  it("renders multiple add-ons, omitting price for any that have none", () => {
    const led = addon({ name: "LED Light Therapy", price: 30 });
    const freebie = addon({ id: "addon_2", name: "Complimentary Upgrade", price: null });
    expect(formatAddonsForNotes([led, freebie])).toBe(
      "Add-ons: LED Light Therapy ($30), Complimentary Upgrade",
    );
  });
});
