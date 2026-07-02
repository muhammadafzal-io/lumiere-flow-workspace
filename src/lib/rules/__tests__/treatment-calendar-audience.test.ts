import { describe, expect, it } from "vitest";
import {
  eventTreatmentMatches,
  isCompletedCalendarEvent,
  usesTreatmentCalendarSource,
} from "@/lib/rules/audience-match";
import type { Rule } from "@/lib/types";

describe("treatment-calendar-audience", () => {
  it("usesTreatmentCalendarSource for within_last_days treatment rules", () => {
    const rule = {
      trigger_type: "Treatment-based",
      trigger_config: { treatment_timing: "within_last_days", within_last_days: 7 },
    } as Rule;
    expect(usesTreatmentCalendarSource(rule)).toBe(true);
  });

  it("usesTreatmentCalendarSource for exact calendar treatment rules", () => {
    const rule = {
      trigger_type: "Treatment-based",
      trigger_config: { exact_calendar_day: true, days_after: 1 },
    } as Rule;
    expect(usesTreatmentCalendarSource(rule)).toBe(true);
    expect(
      usesTreatmentCalendarSource({
        ...rule,
        trigger_config: { days_after: 14 },
      } as Rule),
    ).toBe(false);
  });

  it("isCompletedCalendarEvent requires end time in the past", () => {
    const now = new Date("2026-07-02T18:00:00Z");
    expect(isCompletedCalendarEvent("2026-07-02T17:00:00Z", now)).toBe(true);
    expect(isCompletedCalendarEvent("2026-07-02T19:00:00Z", now)).toBe(false);
  });

  it("eventTreatmentMatches respects Any and specific treatments", () => {
    expect(eventTreatmentMatches("Any", "Botox")).toBe(true);
    expect(eventTreatmentMatches("Botox", "Botox — follow-up")).toBe(true);
    expect(eventTreatmentMatches("Botox", "HydraFacial")).toBe(false);
  });
});
